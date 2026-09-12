import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import OpenAI from 'openai'
import PDFParser from 'pdf2json'
import Stripe from 'stripe'
import admin from 'firebase-admin'
import { Resend } from 'resend'
// The dev server reuses the production enforcement modules from api/_lib so
// local behaviour matches Vercel exactly — auth, plan limits, AI Credit
// charging and refunds all run through the same code paths.
import { verifyAuth, ApiError } from '../api/_lib/auth.js'
import {
  resolveEntitlement,
  assertWithinDocumentLimits,
  planFeatures,
  chargeCredits,
  refundCredits,
  consumeFreeReport,
  refundFreeReport,
  chargeAssistantQuestion,
  computeReportCost,
  type Entitlement,
} from '../api/_lib/entitlements.js'
import { planFromSubscription, webhookVerification } from '../api/_lib/stripe-admin.js'
// Password reset reuses the production sender so the branded template and the
// enumeration-safe behaviour are identical locally. Without this route the dev
// server 404s the reset call and the flow looks broken only on localhost.
import { sendPasswordResetEmail, sendVerificationEmail, NoSuchAccountError } from '../api/_lib/resend.js'
import { resolveSubscriptionRequest } from '../api/_lib/subscriptions.js'
import { clientIp, consumeRateLimit, emailKey } from '../api/_lib/rateLimit.js'
// Models, input ceilings and pricing live in one module shared with api/, so
// the dev server and Vercel can never disagree about which model runs what or
// how much text it is allowed to send.
import {
  REPORT_MODEL,
  ASSISTANT_MODEL,
  MAX_CONTENT_CHARS,
  MAX_ASSISTANT_CONTEXT_CHARS,
  CONTENT_TIMEOUT_MS,
  REPORT_TIMEOUT_MS,
  ASSISTANT_TIMEOUT_MS,
  OPENAI_MAX_RETRIES,
  buildDocsBlock,
  readUsage,
  isTimeoutError,
  TIMEOUT_MESSAGE,
  toPageMarkedText,
} from '../api/_lib/aiConfig.js'
// The decision prompts and the report normalizer are shared with Vercel too.
// They used to be copy-pasted into this file, and the copies had already
// drifted — the page-marker handling and the `reasoning` array guard differed
// between the two, so a report could render locally and break in production.
import { getFrameworkPrompt, normalizeDecisionReport } from '../api/_lib/shared.js'
import { recordAiUsage } from '../api/_lib/aiUsage.js'

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Authenticate an Express request with the shared verifier, which expects a
 * Vercel-shaped request. Only `headers` is read, so the cast is safe.
 */
async function requireAuth(req: any, res: any): Promise<Entitlement | null> {
  const authed = await verifyAuth(req)
  if (!authed) {
    res.status(401).json({ code: 'UNAUTHENTICATED', error: 'Please sign in to continue.' })
    return null
  }
  return resolveEntitlement(authed.uid)
}

/** Send an ApiError with its status and code; rethrow anything else. */
function sendApiError(res: any, e: unknown): boolean {
  if (e instanceof ApiError) {
    res.status(e.status).json({ code: e.code, error: e.message })
    return true
  }
  return false
}

/** Strip report sections the caller's plan does not include. */
function gateReport(data: Record<string, any>, features: ReturnType<typeof planFeatures>) {
  const out = { ...data }
  if (!features.playbook) delete out.decision_playbook
  if (!features.skepticQuestions) {
    delete out.verification_questions
    delete out.smart_skeptic_questions
  }
  if (!features.advisor) delete out.if_i_were_you
  return out
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function extractPDFText(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, true)
    parser.on('pdfParser_dataReady', () => resolve(parser.getRawTextContent()))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parser.on('pdfParser_dataError', (errData: any) => {
      // pdf2json emits { parserError: string } — always convert to proper Error
      const raw = errData?.parserError ?? errData
      reject(new Error(typeof raw === 'string' ? raw : String(raw)))
    })
    parser.parseBuffer(buffer)
  })
}

const SYSTEM_PROMPT = `You are the TimeCut intelligence for "TimeCut", a tool that helps users decide whether content is truly worth their time.

STEP 1 — DETECT CONTENT TYPE
Classify the content as one of:
- FICTION / NARRATIVE: novels, short stories, creative writing, screenplays, poetry, narrative essays
- INFORMATIONAL: articles, blog posts, emails, reports, research papers, business documents, self-help, news, academic papers, transcripts

STEP 2 — SCORE BASED ON CONTENT TYPE

For FICTION / NARRATIVE, evaluate:
- Emotional engagement and resonance
- Atmosphere and immersion
- Narrative tension and pacing
- Character depth and authenticity
- Writing quality and originality (do NOT penalize fiction for "low information density" — that is not the goal of this content type)

For INFORMATIONAL content, evaluate:
- Information density (useful information per paragraph)
- Originality (fresh ideas vs recycled talking points)
- Practical value (actionable takeaways)
- Clarity and structure
- Evidence quality (data, examples, logic)

STEP 3 — ASSIGN A VERDICT

Choose exactly ONE verdict from the list below based on the overall_value_score AND content characteristics:

SCORE-BASED VERDICTS:
- "TIME WASTER"         score 0.0–2.9  — actively wastes time; deeply repetitive, misleading, or zero value
- "SKIP IT"            score 3.0–4.4  — low value, derivative, dull; not worth reading
- "SKIM ONLY"          score 4.5–5.9  — some value but notable padding, repetition, or filler
- "WORTH A GLANCE"     score 6.0–6.4  — quickly interesting but not essential; a brief scan is enough
- "LIGHT READ"         score 6.5–6.9  — easy, enjoyable casual content with decent value
- "GOOD READ"          score 7.0–7.4  — solid value and enjoyable; worth the full read
- "HIGHLY RECOMMENDED" score 7.5–8.4  — strong quality and engagement; clearly above average
- "MUST READ"          score 8.5–9.4  — exceptional content; do not miss this

SPECIAL CONTEXT VERDICTS (override score range when characteristics match):
- "OVERRATED"   — Content is widely popular or heavily hyped but actual substance is below average (score typically 3.0–5.9). Use when the content's reputation clearly exceeds its value.
- "HIDDEN GEM"  — Content is low-profile or niche but delivers surprisingly high value (score typically 7.5+). Use when the content deserves far more attention than it gets.
- "DEEP DIVE"   — Content is intellectually dense, complex, or academic (score typically 7.0+). Requires active effort but rewards it. Use for technical papers, philosophy, advanced research.
- "MASTERPIECE" — Extremely rare, top-tier content of lasting value (score 9.5–10.0). Reserve for truly exceptional works only.

STEP 4 — PRODUCE THE REPORT

Return an honest, specific, direct JSON report.

OUTPUT FORMAT (JSON ONLY, no markdown, no extra keys):
{
  "verdict": <one of the 12 verdicts above>,
  "verdict_description": "One clear sentence explaining the verdict",
  "overall_value_score": <number 0.0 to 10.0>,
  "time_saved_minutes": <integer, estimated minutes the user can safely skip>,
  "value_score": <number 0.0 to 10.0>,
  "attention_quality": "High" | "Medium" | "Low",
  "attention_quality_description": "One sentence describing the quality of attention this content deserves",
  "what_this_is_about": "2 to 3 sentences describing what the content actually covers",
  "key_insights": ["insight 1", "insight 2", "insight 3", "insight 4"],
  "what_to_skip": ["element to skip 1", "element to skip 2", "element to skip 3"],
  "best_for": ["audience type 1", "audience type 2", "audience type 3"],
  "final_decision": "2 to 3 sentences with a clear, actionable final recommendation",
  "originality_score": <number 0.0 to 10.0 — how fresh and original the ideas are; 10 = highly novel thinking, 0 = entirely recycled clichés>,
  "evidence_density": <number 0.0 to 10.0 — how well claims are backed by data, examples, or logic; 10 = every claim supported, 0 = pure assertion>,
  "repetition_score": <number 0.0 to 10.0 — how repetitive the content is; 10 = extremely repetitive padding, 0 = zero repetition>,
  "insight_uniqueness": <number 0.0 to 10.0 — how non-obvious and novel the key insights are; 10 = rare insights reader won't have seen before, 0 = entirely obvious>
}

Generate ALL text fields in the user's selected language.`

// ── Firebase Admin (optional — required for Stripe webhook plan updates) ──
let adminDb: admin.firestore.Firestore | null = null
if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  try {
    const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString())
    admin.initializeApp({ credential: admin.credential.cert(sa) })
    adminDb = admin.firestore()
    console.log('[firebase-admin] initialized')
  } catch (e) {
    console.warn('[firebase-admin] init failed:', e)
  }
} else {
  console.warn('[firebase-admin] FIREBASE_SERVICE_ACCOUNT_BASE64 not set — plan updates via webhook disabled')
}

// ── Resend email client ──
const resend = new Resend(process.env.RESEND_API_KEY)

const PLAN_LABELS: Record<string, string> = {
  starter: 'TimeCut Starter',
  pro: 'TimeCut Pro',
  business: 'TimeCut Business',
}

const PLAN_LIMITS: Record<string, string> = {
  starter: '5 analyses/month · 50 pages per analysis',
  pro: '20 analyses/month · 100 pages per analysis',
  business: 'Unlimited analyses & pages',
}

// The local copy of `sendVerificationEmail` lived here with its own duplicate
// of the email template. It is gone: the route above uses the shared sender in
// api/_lib/resend.ts, so the dev server and production send identical mail.

async function sendWelcomeEmail(to: string, name: string) {
  const firstName = name ? name.split(' ')[0] : 'there'
  try {
    await resend.emails.send({
      from: 'TimeCut <support@timecut.online>',
      to,
      subject: `Welcome to TimeCut, ${firstName}! 🎯`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#0a0a0a;color:#e5e5e5;border-radius:12px;">
          <div style="text-align:center;margin-bottom:32px;">
            <h1 style="color:#d4af37;font-size:28px;margin:0;">TimeCut</h1>
            <p style="color:#888;margin:4px 0 0;">Cut through the noise.</p>
          </div>

          <h2 style="color:#ffffff;font-size:22px;">Welcome aboard, ${firstName}!</h2>
          <p style="color:#aaa;line-height:1.6;">
            You've just unlocked smarter content decisions. TimeCut analyzes any article, email, PDF, or book chapter and tells you exactly whether it's worth your time — before you read a single word.
          </p>

          <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:20px;margin:24px 0;">
            <h3 style="color:#d4af37;margin:0 0 16px;">What you can do with TimeCut:</h3>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:8px 0;color:#aaa;font-size:14px;border-bottom:1px solid #222;">
                  <span style="color:#d4af37;margin-right:8px;">✓</span> Paste text or upload a PDF
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#aaa;font-size:14px;border-bottom:1px solid #222;">
                  <span style="color:#d4af37;margin-right:8px;">✓</span> Get a verdict: Must Read, Skim Only, or Skip It
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#aaa;font-size:14px;border-bottom:1px solid #222;">
                  <span style="color:#d4af37;margin-right:8px;">✓</span> See exactly how many minutes you can safely skip
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#aaa;font-size:14px;">
                  <span style="color:#d4af37;margin-right:8px;">✓</span> Supports 12 languages
                </td>
              </tr>
            </table>
          </div>

          <p style="color:#aaa;line-height:1.6;">
            Your free plan includes <strong style="color:#ffffff;">5 analyses per month</strong>. Need more? Upgrade anytime from your dashboard.
          </p>

          <div style="text-align:center;margin:32px 0;">
            <a href="https://timecut.online" style="background:#d4af37;color:#0a0a0a;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Start Your First Analysis</a>
          </div>

          <p style="color:#555;font-size:13px;text-align:center;margin-top:32px;">
            Questions? <a href="mailto:support@timecut.online" style="color:#d4af37;">support@timecut.online</a>
          </p>
        </div>
      `,
    })
    console.log(`[resend] Welcome email sent to ${to}`)
  } catch (err) {
    console.error('[resend] Failed to send welcome email:', err)
  }
}

async function sendPlanConfirmationEmail(to: string, name: string, plan: string) {
  const planLabel = PLAN_LABELS[plan] ?? plan
  const planLimit = PLAN_LIMITS[plan] ?? ''
  try {
    await resend.emails.send({
      from: 'TimeCut <support@timecut.online>',
      to,
      subject: `Welcome to ${planLabel} — You're all set!`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#0a0a0a;color:#e5e5e5;border-radius:12px;">
          <div style="text-align:center;margin-bottom:32px;">
            <h1 style="color:#d4af37;font-size:28px;margin:0;">TimeCut</h1>
            <p style="color:#888;margin:4px 0 0;">Cut through the noise.</p>
          </div>
          <h2 style="color:#ffffff;font-size:22px;">Hey ${name || 'there'}, your subscription is active!</h2>
          <p style="color:#aaa;line-height:1.6;">
            You've successfully subscribed to <strong style="color:#d4af37;">${planLabel}</strong>.
            You now have <strong style="color:#22c55e;">${planLimit}</strong> to help you make smarter reading decisions.
          </p>
          <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:20px;margin:24px 0;">
            <h3 style="color:#d4af37;margin:0 0 12px;">What's included:</h3>
            <ul style="color:#aaa;line-height:1.8;padding-left:20px;margin:0;">
              <li>${planLimit}</li>
              <li>PDF, URL &amp; text analysis</li>
              <li>Verdict, key insights &amp; time-save estimates</li>
              <li>Multi-language support</li>
            </ul>
          </div>
          <div style="text-align:center;margin:32px 0;">
            <a href="https://timecut.online" style="background:#d4af37;color:#0a0a0a;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Start Analyzing</a>
          </div>
          <p style="color:#555;font-size:13px;text-align:center;margin-top:32px;">
            Questions? Reply to this email or contact us at <a href="mailto:support@timecut.online" style="color:#d4af37;">support@timecut.online</a>
          </p>
        </div>
      `,
    })
    console.log(`[resend] Confirmation email sent to ${to}`)
  } catch (err) {
    console.error('[resend] Failed to send email:', err)
  }
}

// Plan resolution now goes through planFromSubscription() in api/_lib, which
// reads the plan from the Stripe product's metadata (falling back to its name),
// so the name->plan map no longer needs to be duplicated here.

const app = express()
app.use(cors())

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
// Pinned deliberately: this code is written against the 2023-10-16 response
// shapes. Stripe types `apiVersion` as the newest version only, so pinning an
// older one requires a cast — Stripe's own typings prescribe exactly this.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2023-10-16' as any })

// Stripe product metadata only. The charge amount comes from the config/plans
// Firestore doc (Admin Dashboard) via getStripeAmount() so the price shown on
// the site and the price charged by Stripe always come from one place.
// Mirrors api/_lib/stripe-admin.ts. Business is sold through Contact Sales and
// provisioned by hand, so it is deliberately absent — nothing here may take a
// card payment for it.
const STRIPE_PLANS: Record<string, { name: string; description: string }> = {
  starter: {
    name: 'TimeCut Starter',
    description: 'AI Decision Intelligence — 500 AI Credits/month · up to 5 documents per report',
  },
  pro: {
    name: 'TimeCut Pro',
    description: 'Advanced decision intelligence — 3,000 AI Credits/month · up to 10 documents per report',
  },
}

// Used only when config/plans has no explicit price for a plan (e.g. Business,
// which is "Contact Sales" and therefore has priceCents = null).
const FALLBACK_AMOUNT_CENTS: Record<string, number> = {
  starter: 900,
  pro: 2900,
}

/** Read the live charge amount (cents) from config/plans, with a safe fallback. */
async function getStripeAmount(plan: string): Promise<number> {
  try {
    if (adminDb) {
      const snap = await adminDb.collection('config').doc('plans').get()
      const cents = snap.exists ? (snap.data()?.plans?.[plan]?.priceCents as number | null | undefined) : undefined
      if (typeof cents === 'number' && cents > 0) return cents
    }
  } catch (e) {
    console.warn('[stripe] plan price lookup failed, using fallback:', e)
  }
  return FALLBACK_AMOUNT_CENTS[plan] ?? 0
}

// `getOrCreateProductId` and its cache used to live here as a second copy of
// the same helper in api/_lib/stripe-admin.ts. Product resolution now happens
// inside the shared subscriptions module, so the duplicate is gone.

async function generateReport(content: string, language: string) {
  const wasTruncated = content.length > MAX_CONTENT_CHARS
  const truncated = wasTruncated ? content.slice(0, MAX_CONTENT_CHARS) : content
  const completion = await openai.chat.completions.create({
    model: REPORT_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Language: ${language}\n\nContent to analyze:\n${truncated}` },
    ],
  }, { timeout: CONTENT_TIMEOUT_MS, maxRetries: OPENAI_MAX_RETRIES })
  const raw = completion.choices[0]?.message?.content ?? '{}'
  return { data: JSON.parse(raw), usage: readUsage(completion), truncated: wasTruncated }
}

// ── Send verification email via Resend ──
// Delegates to the shared sender, like the Vercel route. The inline copy that
// used to live here returned the raw Firebase message for an unknown address
// ("There is no user record...") — an account-enumeration oracle that the
// production route had already been fixed to avoid.
app.post('/api/send-verification-email', express.json(), async (req, res) => {
  const { email, name } = req.body ?? {}
  if (typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({ error: 'A valid email address is required' }); return
  }
  const to = email.trim()

  const byEmail = await consumeRateLimit(`verify:${emailKey(to)}`, { limit: 5, windowSeconds: 3600 })
  const byIp = await consumeRateLimit(`verify-ip:${clientIp(req.headers)}`, { limit: 20, windowSeconds: 3600 })
  if (!byEmail.allowed || !byIp.allowed) {
    res.status(429).json({ code: 'RATE_LIMITED', error: 'Too many requests. Please try again later.' }); return
  }

  try {
    await sendVerificationEmail(to, typeof name === 'string' ? name.slice(0, 100) : '')
    res.json({ success: true })
  } catch (err) {
    // An address with no account is reported as success on purpose; a genuine
    // delivery failure is not, so the UI can tell the user to retry.
    if (err instanceof NoSuchAccountError) {
      console.log(`[send-verification-email] No account for ${to}; reporting success`)
      res.json({ success: true }); return
    }
    console.error('[send-verification-email] Error:', err)
    res.status(500).json({ error: 'Could not send the verification email. Please try again.' })
  }
})

// ── Send password reset email via Resend ──
// Mirrors api/send-password-reset-email.ts: rate limited, and an address with
// no account returns the same success as one with an account so the route
// cannot be used to discover who has registered.
app.post('/api/send-password-reset-email', express.json(), async (req, res) => {
  const { email, name } = req.body ?? {}
  if (typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({ error: 'A valid email address is required' }); return
  }
  const to = email.trim()

  const byEmail = await consumeRateLimit(`reset:${emailKey(to)}`, { limit: 5, windowSeconds: 3600 })
  const byIp = await consumeRateLimit(`reset-ip:${clientIp(req.headers)}`, { limit: 20, windowSeconds: 3600 })
  if (!byEmail.allowed || !byIp.allowed) {
    res.status(429).json({ code: 'RATE_LIMITED', error: 'Too many requests. Please try again later.' }); return
  }

  try {
    await sendPasswordResetEmail(to, typeof name === 'string' ? name.slice(0, 100) : '')
    res.json({ success: true })
  } catch (err) {
    if (err instanceof NoSuchAccountError) {
      console.log(`[send-password-reset-email] No account for ${to}; reporting success`)
      res.json({ success: true }); return
    }
    console.error('[send-password-reset-email] Error:', err)
    res.status(500).json({ error: 'Could not send the reset email. Please try again.' })
  }
})

app.post('/api/send-contact-email', express.json(), async (req, res) => {
  const { name, email, subject, message } = req.body
  if (!name || !email || !message) { res.status(400).json({ error: 'Missing required fields' }); return }
  try {
    await resend.emails.send({
      from: 'TimeCut Contact <support@timecut.online>',
      to: 'support@timecut.online',
      replyTo: email,
      subject: `[Contact] ${subject || 'General Inquiry'} — from ${name}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#0a0a0a;color:#e5e5e5;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h1 style="color:#d4af37;font-size:24px;margin:0;">TimeCut</h1>
            <p style="color:#888;margin:4px 0 0;font-size:13px;">New message from Contact Form</p>
          </div>
          <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:20px;margin-bottom:20px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:8px 0;color:#888;font-size:13px;width:80px;border-bottom:1px solid #222;">Name</td>
                <td style="padding:8px 0;color:#fff;font-size:14px;border-bottom:1px solid #222;">${name}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#888;font-size:13px;border-bottom:1px solid #222;">Email</td>
                <td style="padding:8px 0;font-size:14px;border-bottom:1px solid #222;">
                  <a href="mailto:${email}" style="color:#d4af37;">${email}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#888;font-size:13px;">Subject</td>
                <td style="padding:8px 0;color:#fff;font-size:14px;">${subject || 'General Inquiry'}</td>
              </tr>
            </table>
          </div>
          <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:20px;">
            <p style="color:#888;font-size:12px;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">Message</p>
            <p style="color:#e5e5e5;line-height:1.7;margin:0;white-space:pre-wrap;">${message}</p>
          </div>
          <p style="color:#555;font-size:12px;text-align:center;margin-top:24px;">
            Reply directly to this email to respond to ${name}.
          </p>
        </div>
      `,
    })
    console.log(`[resend] Contact email sent from ${email}`)
    res.json({ success: true })
  } catch (err) {
    console.error('[send-contact-email] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send contact email' })
  }
})

app.post('/api/send-welcome-email', express.json(), async (req, res) => {
  const { email, name } = req.body
  if (!email) { res.status(400).json({ error: 'Missing email' }); return }
  try {
    await sendWelcomeEmail(email, name ?? '')
    res.json({ success: true })
  } catch (err) {
    console.error('[send-welcome-email] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send welcome email' })
  }
})

// ── Custom subscription flow (in-app payment modal) ──

// Step 1: create Stripe customer + subscription, return client_secret
// ── Create / change a subscription ──
// Delegates to the same module the Vercel route uses. This was previously a
// second, inline implementation, and it had NOT received the duplicate-
// subscription guard — so locally, opening the checkout modal created a brand
// new subscription every single time (a test run produced three for one
// customer). One module now serves both environments.
app.post('/api/create-subscription', express.json(), async (req, res) => {
  const authed = await verifyAuth(req)
  if (!authed) {
    res.status(401).json({ code: 'UNAUTHENTICATED', error: 'Please sign in to subscribe.' })
    return
  }

  const { plan, email, name, confirmSwitch } = req.body ?? {}

  try {
    const { status, body } = await resolveSubscriptionRequest({
      uid: authed.uid,
      plan,
      email,
      name,
      confirmSwitch: confirmSwitch === true,
    })
    res.status(status).json(body)
  } catch (err) {
    console.error('[create-subscription] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Subscription creation failed' })
  }
})

// Step 2: verify payment and activate plan in Firestore
app.post('/api/activate-plan', express.json(), async (req, res) => {
  // The account comes from the verified token and the plan comes from Stripe —
  // neither is read from the request body. Mirrors api/activate-plan.ts.
  const authed = await verifyAuth(req)
  if (!authed) {
    res.status(401).json({ code: 'UNAUTHENTICATED', error: 'Please sign in to complete your subscription.' })
    return
  }
  const uid = authed.uid

  const { subscriptionId, paymentIntentId, email, name } = req.body
  if (!subscriptionId && !paymentIntentId) {
    res.status(400).json({ error: 'Missing subscription or payment reference' })
    return
  }

  try {
    let subscription: Stripe.Subscription | null = null
    let paid = false
    let customerId: string | undefined

    if (paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
      if (pi.status === 'succeeded') {
        paid = true
        customerId = typeof pi.customer === 'string' ? pi.customer : (pi.customer as Stripe.Customer)?.id
      } else {
        console.warn(`[activate-plan] PI status not succeeded: ${pi.status}`)
      }
    }

    if (subscriptionId) {
      subscription = await stripe.subscriptions.retrieve(subscriptionId)
      if (!paid) paid = subscription.status === 'active' || subscription.status === 'trialing'
      customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : (subscription.customer as Stripe.Customer)?.id
    }

    if (!paid) {
      console.warn(`[activate-plan] Payment not confirmed for uid=${uid}`)
      res.status(402).json({
        success: false,
        code: 'PAYMENT_NOT_CONFIRMED',
        error: 'We could not confirm your payment yet. If you were charged, your plan will activate automatically within a minute.',
      })
      return
    }

    if (!subscription) {
      res.status(202).json({ success: false, code: 'PENDING_WEBHOOK', error: 'Payment received. Your plan is being activated.' })
      return
    }

    const planKey = await planFromSubscription(subscription)
    if (!planKey) {
      console.error(`[activate-plan] Could not resolve plan from subscription ${subscription.id}`)
      res.status(500).json({ success: false, error: 'Could not determine your plan. Support has been notified.' })
      return
    }

    const metaUid = subscription.metadata?.firebaseUid
    if (metaUid && metaUid !== uid) {
      res.status(403).json({ success: false, error: 'This subscription belongs to a different account.' })
      return
    }

    if (adminDb) {
      const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end
        ?? subscription.items.data[0]?.current_period_end
      const expiresAt = admin.firestore.Timestamp.fromDate(
        periodEnd !== undefined
          ? new Date((periodEnd + 3 * 24 * 60 * 60) * 1000)
          : new Date(Date.now() + 37 * 24 * 60 * 60 * 1000),
      )
      await adminDb.doc(`users/${uid}`).set(
        {
          plan: planKey,
          planStartDate: admin.firestore.FieldValue.serverTimestamp(),
          planExpiresAt: expiresAt,
          subscriptionStatus: subscription.status,
          stripeSubscriptionId: subscription.id,
          ...(customerId ? { stripeCustomerId: customerId } : {}),
        },
        { merge: true },
      )
      console.log(`[activate-plan] ✓ uid=${uid} → plan=${planKey}`)
    }

    if (email) {
      await sendPlanConfirmationEmail(email, name ?? '', planKey)
    }
    res.json({ success: true, plan: planKey })
  } catch (err) {
    console.error('[activate-plan] Error:', err)
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Activation failed' })
  }
})

// Self-serve subscription management (cancel, update card, invoices)
app.post('/api/billing-portal', express.json(), async (req, res) => {
  const authed = await verifyAuth(req)
  if (!authed) {
    res.status(401).json({ code: 'UNAUTHENTICATED', error: 'Please sign in to manage your subscription.' })
    return
  }
  if (!adminDb) { res.status(500).json({ error: 'Account service unavailable. Please try again.' }); return }

  try {
    const snap = await adminDb.doc(`users/${authed.uid}`).get()
    const customerId = snap.data()?.stripeCustomerId as string | undefined
    if (!customerId) {
      res.status(400).json({ code: 'NO_SUBSCRIPTION', error: 'No billing account found. If you believe this is an error, please contact support.' })
      return
    }
    const origin = (req.headers.origin as string | undefined) ?? process.env.FRONTEND_URL ?? 'http://localhost:5173'
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/profile`,
    })
    res.json({ url: session.url })
  } catch (err) {
    console.error('[billing-portal] Error:', err)
    const message = err instanceof Error ? err.message : 'Could not open billing management'
    res.status(500).json({
      error: message.includes('configuration')
        ? 'Subscription management is not configured yet. Please contact support to cancel.'
        : message,
    })
  }
})

// Downgrade the caller's own account once their plan has lapsed
app.post('/api/expire-plan', express.json(), async (req, res) => {
  const authed = await verifyAuth(req)
  if (!authed) { res.status(401).json({ code: 'UNAUTHENTICATED', error: 'Not signed in' }); return }
  if (!adminDb) { res.status(500).json({ error: 'Database unavailable' }); return }

  try {
    const snap = await adminDb.doc(`users/${authed.uid}`).get()
    if (!snap.exists) { res.json({ expired: false }); return }
    const data = snap.data()!
    const planExpiresAt = data.planExpiresAt?.toDate?.() as Date | undefined
    const plan = data.plan as string | undefined

    if (!planExpiresAt || !plan || plan === 'free') { res.json({ expired: false }); return }

    if (planExpiresAt < new Date()) {
      await adminDb.doc(`users/${authed.uid}`).update({ plan: 'free', planStartDate: null, planExpiresAt: null })
      res.json({ expired: true })
      return
    }
    res.json({ expired: false })
  } catch (err) {
    console.error('[expire-plan] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' })
  }
})

// ── Legacy Stripe-hosted checkout (kept as fallback) ──
// Stripe checkout session creation
app.post('/api/create-checkout-session', express.json(), async (req, res) => {
  const { plan, uid } = req.body
  const planConfig = STRIPE_PLANS[plan]
  if (!planConfig) {
    res.status(400).json({ error: 'Invalid plan' })
    return
  }
  try {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      client_reference_id: uid ?? undefined,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: planConfig.name,
            description: planConfig.description,
          },
          unit_amount: await getStripeAmount(plan),
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `${frontendUrl}/pricing?success=true`,
      cancel_url: `${frontendUrl}/pricing?canceled=true`,
    })
    res.json({ url: session.url })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Checkout session creation failed' })
  }
})

// Stripe webhook — updates user plan in Firestore after successful payment
app.post('/api/stripe-webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'] as string
    const verification = webhookVerification()
    if ('refuse' in verification) {
      console.error(`[webhook] ${verification.refuse}`)
      return res.status(500).json({ error: 'Webhook signing secret not configured' })
    }
    let event: Stripe.Event

    try {
      event = 'secret' in verification
        ? stripe.webhooks.constructEvent(req.body, sig, verification.secret)
        : JSON.parse(req.body.toString()) as Stripe.Event
    } catch (err) {
      res.status(400).send(`Webhook error: ${err instanceof Error ? err.message : 'unknown'}`)
      return
    }

    if (!adminDb) {
      console.error('[webhook] Admin DB unavailable; asking Stripe to retry')
      res.status(500).json({ error: 'Database unavailable' })
      return
    }
    const db = adminDb

    // Locate the account a subscription belongs to. Prefers the firebaseUid
    // stamped on the subscription at creation; falls back to customer id for
    // subscriptions created before that existed.
    const findUserRef = async (
      subscription: Stripe.Subscription | null,
      customerId: string | undefined,
    ): Promise<admin.firestore.DocumentReference | null> => {
      const uid = subscription?.metadata?.firebaseUid
      if (uid) {
        const ref = db.doc(`users/${uid}`)
        if ((await ref.get()).exists) return ref
      }
      if (customerId) {
        const byCustomer = await db.collection('users')
          .where('stripeCustomerId', '==', customerId).limit(1).get()
        if (!byCustomer.empty) return byCustomer.docs[0].ref
      }
      if (subscription?.id) {
        const bySub = await db.collection('users')
          .where('stripeSubscriptionId', '==', subscription.id).limit(1).get()
        if (!bySub.empty) return bySub.docs[0].ref
      }
      return null
    }

    // Grant or renew the plan the subscription actually pays for.
    const activate = async (subscription: Stripe.Subscription, customerId: string | undefined) => {
      const userRef = await findUserRef(subscription, customerId)
      if (!userRef) { console.error('[webhook] No user for subscription:', subscription.id); return }

      const planKey = await planFromSubscription(subscription)
      if (!planKey) { console.error('[webhook] Could not resolve plan for:', subscription.id); return }

      const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end
        ?? subscription.items.data[0]?.current_period_end
      if (periodEnd === undefined) { console.error('[webhook] No period end for:', subscription.id); return }

      await userRef.set({
        plan: planKey,
        planStartDate: admin.firestore.FieldValue.serverTimestamp(),
        planExpiresAt: admin.firestore.Timestamp.fromDate(new Date((periodEnd + 3 * 24 * 60 * 60) * 1000)),
        subscriptionStatus: subscription.status,
        stripeSubscriptionId: subscription.id,
        ...(customerId ? { stripeCustomerId: customerId } : {}),
      }, { merge: true })
      console.log(`[webhook] ✓ ${userRef.id} → ${planKey}`)
    }

    const downgrade = async (
      subscription: Stripe.Subscription | null,
      customerId: string | undefined,
      reason: string,
    ) => {
      const userRef = await findUserRef(subscription, customerId)
      if (!userRef) { console.error('[webhook] No user to downgrade for:', customerId); return }
      await userRef.set({
        plan: 'free',
        planStartDate: null,
        planExpiresAt: null,
        subscriptionStatus: subscription?.status ?? 'canceled',
      }, { merge: true })
      console.log(`[webhook] ${userRef.id} downgraded to free (${reason})`)
    }

    const invoiceSubscriptionId = (invoice: Stripe.Invoice): string | undefined => {
      const legacy = (invoice as unknown as { subscription?: string | Stripe.Subscription | null }).subscription
      const current = legacy ?? invoice.parent?.subscription_details?.subscription
      if (!current) return undefined
      return typeof current === 'string' ? current : current.id
    }

    try {
      switch (event.type) {
        // Stripe Checkout redirects only. The in-app Payment Element flow never
        // fires this — invoice.payment_succeeded below covers those.
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session
          const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id
          if (!subscriptionId) break
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          if (session.client_reference_id && !subscription.metadata?.firebaseUid) {
            subscription.metadata = { ...subscription.metadata, firebaseUid: session.client_reference_id }
          }
          const customerId = typeof session.customer === 'string'
            ? session.customer
            : (session.customer as Stripe.Customer)?.id
          await activate(subscription, customerId)
          break
        }

        // Covers BOTH the first payment (subscription_create) and every renewal
        // (subscription_cycle). This is the server-side safety net that makes
        // activation independent of the browser.
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice
          const subscriptionId = invoiceSubscriptionId(invoice)
          if (!subscriptionId) break
          const reason = invoice.billing_reason
          if (reason !== 'subscription_create' && reason !== 'subscription_cycle' && reason !== 'subscription_update') break
          const customerId = typeof invoice.customer === 'string'
            ? invoice.customer
            : (invoice.customer as Stripe.Customer)?.id
          await activate(await stripe.subscriptions.retrieve(subscriptionId), customerId)
          break
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice
          const subscriptionId = invoiceSubscriptionId(invoice)
          const customerId = typeof invoice.customer === 'string'
            ? invoice.customer
            : (invoice.customer as Stripe.Customer)?.id
          const subscription = subscriptionId ? await stripe.subscriptions.retrieve(subscriptionId) : null
          const userRef = await findUserRef(subscription, customerId)
          if (userRef) await userRef.set({ subscriptionStatus: subscription?.status ?? 'past_due' }, { merge: true })
          break
        }

        // Plan changes, plus the unpaid/incomplete_expired end-states Stripe
        // moves a subscription into once retries are exhausted.
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription
          const customerId = typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer?.id
          if (subscription.status === 'active' || subscription.status === 'trialing') {
            await activate(subscription, customerId)
          } else if (['unpaid', 'incomplete_expired', 'canceled'].includes(subscription.status)) {
            await downgrade(subscription, customerId, `status=${subscription.status}`)
          } else {
            const userRef = await findUserRef(subscription, customerId)
            if (userRef) await userRef.set({ subscriptionStatus: subscription.status }, { merge: true })
          }
          break
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription
          const customerId = typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer?.id
          await downgrade(subscription, customerId, 'subscription deleted')
          break
        }

        default:
          break
      }
    } catch (e) {
      console.error(`[webhook] Handler failed for ${event.type}:`, e)
      res.status(500).json({ error: 'Webhook handler failed' })
      return
    }

    res.json({ received: true })
  }
)

// ── Decision Intelligence: multi-document analysis (Phase 4 — Expert Frameworks) ──


const uploadAny = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }).any()

app.post('/api/analyze-decision', (req, res, next) => {
  uploadAny(req, res, (err) => {
    if (err) {
      console.error('[analyze-decision] multer error:', err)
      res.status(400).json({ error: err instanceof Error ? err.message : 'File upload failed' })
      return
    }
    next()
  })
}, async (req, res) => {
  // Charged work: identify the caller and read their plan before anything else.
  const ent = await requireAuth(req, res)
  if (!ent) return
  const features = planFeatures(ent)
  let charged: { credits: number; docs: number } | null = null

  try {
    const files = (req.files as Express.Multer.File[]) ?? []
    const { decisionGoal, language = 'English', documentType = 'auto' } = req.body

    console.log(`[analyze-decision] files=${files.length} goal="${decisionGoal}" lang=${language}`)

    if (!files.length) { res.status(400).json({ error: 'No files uploaded' }); return }
    if (!decisionGoal?.trim()) { res.status(400).json({ error: 'Decision goal is required' }); return }

    try {
      assertWithinDocumentLimits(ent, { docs: files.length, pages: 0 })
    } catch (e) {
      if (sendApiError(res, e)) return
      throw e
    }

    let totalPages = 0
    const documents: { name: string; content: string }[] = []
    const parseErrors: string[] = []

    for (const file of files) {
      const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')
      let text: string

      if (isPdf) {
        try {
          // Page breaks become citable `[PAGE n]` headers, 1-indexed, rather
          // than the raw 0-indexed trailing markers this used to forward — the
          // model cites these, and the report UI deep-links the reader's PDF
          // to whatever it cites.
          const marked = toPageMarkedText(await extractPDFText(file.buffer))
          if (marked.contentChars < 20) {
            parseErrors.push(`"${file.originalname}" appears to be a scanned/image-based PDF with no extractable text.`)
            continue
          }
          text = marked.text
          totalPages += marked.pages
        } catch (pdfErr) {
          const msg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr)
          console.warn(`[analyze-decision] PDF parse failed for "${file.originalname}":`, msg)
          parseErrors.push(`"${file.originalname}" could not be parsed: ${msg}`)
          continue
        }
      } else {
        text = file.buffer.toString('utf-8')
        totalPages += Math.ceil(text.length / 3000)
      }

      documents.push({ name: file.originalname, content: text })
    }

    if (documents.length === 0) {
      const detail = parseErrors.length ? ` Details: ${parseErrors.join(' ')}` : ''
      res.status(400).json({ error: `None of the uploaded files could be read.${detail}` })
      return
    }

    if (parseErrors.length) {
      console.warn(`[analyze-decision] ${parseErrors.length} file(s) skipped:`, parseErrors)
    }

    // Plan page limit, from the plan — not from a request header.
    try {
      assertWithinDocumentLimits(ent, { docs: documents.length, pages: totalPages })
    } catch (e) {
      if (sendApiError(res, e)) return
      throw e
    }

    // Charge before the model call: pages and documents are already known, so
    // the exact cost is taken up front and refunded if generation fails.
    const cost = computeReportCost(ent.cfg, { pages: totalPages, docs: documents.length })
    try {
      if (ent.isFree) await consumeFreeReport(ent, documents.length)
      else await chargeCredits(ent, cost, { reports: 1, documents: documents.length })
      charged = { credits: cost, docs: documents.length }
    } catch (e) {
      if (sendApiError(res, e)) return
      throw e
    }

    // Shares a fixed character budget across the documents and reports which
    // ones were cut, so the UI can say so rather than silently dropping them.
    const { block: docsBlock, truncated: truncatedDocuments } = buildDocsBlock(documents)

    const systemPrompt = getFrameworkPrompt(documentType)
    const completion = await openai.chat.completions.create({
      model: REPORT_MODEL,
      response_format: { type: 'json_object' },
      max_tokens: 8192,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Language: ${language}\n\nDecision Goal: ${decisionGoal}\n\n${docsBlock}` },
      ],
    }, { timeout: REPORT_TIMEOUT_MS, maxRetries: OPENAI_MAX_RETRIES })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw)
    const data = normalizeDecisionReport(parsed)

    await recordAiUsage({
      uid: ent.uid, plan: ent.plan, operation: 'decision', model: REPORT_MODEL,
      usage: readUsage(completion), creditsCharged: ent.isFree ? 0 : cost,
      documents: documents.length, pages: totalPages,
      truncated: truncatedDocuments.length > 0,
    })

    res.json({
      data: {
        ...gateReport(data, features),
        pages_analyzed: totalPages,
        documents_analyzed: documents.length,
        truncated_documents: truncatedDocuments,
      },
      entitlements: { plan: ent.plan, features, creditsCharged: ent.isFree ? 0 : cost },
    })
  } catch (err) {
    // Refund whatever we charged for an analysis that never arrived.
    if (charged) {
      if (ent.isFree) await refundFreeReport(ent, charged.docs)
      else await refundCredits(ent, charged.credits, { reports: 1, documents: charged.docs })
    }
    if (sendApiError(res, err)) return
    // A deadline hit is not a broken request — say what happened and confirm
    // the refund, rather than showing the raw SDK message.
    if (isTimeoutError(err)) { res.status(504).json({ code: 'TIMEOUT', error: TIMEOUT_MESSAGE }); return }
    const message = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err)
    console.error('[analyze-decision] Error:', message, err)
    res.status(500).json({ error: message || 'Analysis failed' })
  }
})

// Challenge AI — question a specific conclusion from a decision report
app.post('/api/challenge-ai', express.json(), async (req, res) => {
  const { question, reportContext, decisionGoal } = req.body as {
    question?: string
    reportContext?: string
    decisionGoal?: string
  }

  if (!question || !reportContext) {
    res.status(400).json({ error: 'question and reportContext are required' })
    return
  }

  const ent = await requireAuth(req, res)
  if (!ent) return

  // Free plans have a fixed monthly question quota; paid plans pay per question
  // from AI Credits. Charged before answering, refunded if the answer fails.
  try {
    await chargeAssistantQuestion(ent)
  } catch (e) {
    if (sendApiError(res, e)) return
    throw e
  }

  // Bounded server-side as well as in the browser: the client must not be the
  // only thing deciding how much we pay OpenAI per question.
  const boundedContext = reportContext.slice(0, MAX_ASSISTANT_CONTEXT_CHARS)

  try {
    const completion = await openai.chat.completions.create({
      model: ASSISTANT_MODEL,
      max_tokens: 600,
      messages: [
        {
          role: 'system',
          content: `You are an AI Decision Reviewer assistant for TimeCut.
A user has received an AI-generated decision analysis report and wants to challenge or question a specific aspect of it.

Your role:
- Answer the user's question based ONLY on evidence and data in the provided report context
- Be direct, honest, and transparent about your reasoning
- Reference specific findings, risks, or evidence from the report when answering
- If asked for supporting or opposing evidence, give a balanced response
- Acknowledge uncertainty when the report lacks data to answer fully
- Keep responses concise (3-5 sentences typically)

Never fabricate information not found in the report.`,
        },
        {
          role: 'user',
          content: `Decision Goal: ${decisionGoal ?? 'Not specified'}\n\nReport Data:\n${boundedContext}\n\nUser Question: ${question}`,
        },
      ],
    }, { timeout: ASSISTANT_TIMEOUT_MS, maxRetries: OPENAI_MAX_RETRIES })

    const answer = completion.choices[0]?.message?.content ?? 'Unable to generate a response.'
    await recordAiUsage({
      uid: ent.uid, plan: ent.plan, operation: 'assistant', model: ASSISTANT_MODEL,
      usage: readUsage(completion),
      creditsCharged: ent.isFree ? 0 : ent.cfg.creditCosts.assistantQuestion,
      truncated: reportContext.length > MAX_ASSISTANT_CONTEXT_CHARS,
    })
    res.json({ answer })
  } catch (err) {
    await refundCredits(ent, ent.isFree ? 0 : ent.cfg.creditCosts.assistantQuestion, { assistant: 1 })
    console.error('[challenge-ai] Error:', err)
    const message = err instanceof Error ? err.message : 'Challenge AI failed'
    res.status(500).json({ error: message })
  }
})

// Text or URL analysis
app.post('/api/analyze', express.json(), async (req, res) => {
  const { type, content, url, language = 'English' } = req.body

  const ent = await requireAuth(req, res)
  if (!ent) return
  // Content analysis has no page count, so it costs the base report price.
  const cost = computeReportCost(ent.cfg, { pages: 0, docs: 1 })

  try {
    if (ent.isFree) await consumeFreeReport(ent, 1)
    else await chargeCredits(ent, cost, { reports: 1, documents: 1 })
  } catch (e) {
    if (sendApiError(res, e)) return
    throw e
  }

  try {
    let textContent: string
    if (type === 'url') {
      if (!url?.trim()) { res.status(400).json({ error: 'url is required' }); return }
      const resp = await fetch(`https://r.jina.ai/${url}`, { headers: { Accept: 'text/plain' } })
      if (!resp.ok) throw new Error(`Could not fetch article (${resp.status})`)
      textContent = await resp.text()
    } else {
      if (!content?.trim()) { res.status(400).json({ error: 'content is required' }); return }
      textContent = content
    }
    const { data, usage, truncated } = await generateReport(textContent, language)
    await recordAiUsage({
      uid: ent.uid, plan: ent.plan, operation: 'content', model: REPORT_MODEL, usage,
      creditsCharged: ent.isFree ? 0 : cost, documents: 1, truncated,
    })
    res.json({ data: { ...data, content_truncated: truncated } })
  } catch (err) {
    if (ent.isFree) await refundFreeReport(ent, 1)
    else await refundCredits(ent, cost, { reports: 1, documents: 1 })
    res.status(500).json({ error: err instanceof Error ? err.message : 'Analysis failed' })
  }
})

// PDF analysis
app.post('/api/analyze-pdf', upload.single('file'), async (req, res) => {
  const ent = await requireAuth(req, res)
  if (!ent) return
  const cost = computeReportCost(ent.cfg, { pages: 0, docs: 1 })
  let charged = false

  try {
    if (!req.file) { res.status(400).json({ error: 'No PDF file uploaded' }); return }
    const text = await extractPDFText(req.file.buffer)
    const meaningful = text.replace(/-+Page \(\d+\) Break-+/g, '').trim()
    if (meaningful.length < 50) {
      throw new Error('This PDF has no extractable text (likely scanned/image-based). Please upload a PDF with selectable text.')
    }

    // Charge only once we know the file is actually analysable.
    try {
      if (ent.isFree) await consumeFreeReport(ent, 1)
      else await chargeCredits(ent, cost, { reports: 1, documents: 1 })
      charged = true
    } catch (e) {
      if (sendApiError(res, e)) return
      throw e
    }

    const language = req.body.language || 'English'
    const { data, usage, truncated } = await generateReport(text, language)
    await recordAiUsage({
      uid: ent.uid, plan: ent.plan, operation: 'content', model: REPORT_MODEL, usage,
      creditsCharged: ent.isFree ? 0 : cost, documents: 1, truncated,
    })
    res.json({ data: { ...data, content_truncated: truncated } })
  } catch (err) {
    if (charged) {
      if (ent.isFree) await refundFreeReport(ent, 1)
      else await refundCredits(ent, cost, { reports: 1, documents: 1 })
    }
    console.error('[PDF ERROR]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'PDF parsing failed' })
  }
})

const PORT = process.env.PORT ?? 3001
const server = app.listen(PORT, () => console.log(`Time Cut server running on http://localhost:${PORT}`))
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] Port ${PORT} is already in use. Kill the old process and retry.`)
    process.exit(1)
  }
  throw err
})
