import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import OpenAI from 'openai'
import PDFParser from 'pdf2json'
import Stripe from 'stripe'
import admin from 'firebase-admin'
import { Resend } from 'resend'

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

async function sendVerificationEmail(to: string, name: string, verificationLink: string) {
  try {
    await resend.emails.send({
      from: 'TimeCut <support@timecut.online>',
      to,
      subject: 'Verify your TimeCut email address',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#0a0a0a;color:#e5e5e5;border-radius:12px;">
          <div style="text-align:center;margin-bottom:32px;">
            <h1 style="color:#d4af37;font-size:28px;margin:0;">TimeCut</h1>
            <p style="color:#888;margin:4px 0 0;">Cut through the noise.</p>
          </div>
          <h2 style="color:#ffffff;font-size:22px;">Welcome${name ? `, ${name}` : ''}!</h2>
          <p style="color:#aaa;line-height:1.6;">
            Thanks for signing up for <strong style="color:#d4af37;">TimeCut</strong>. Please verify your email address to get started.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${verificationLink}" style="background:#d4af37;color:#0a0a0a;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Verify Email Address</a>
          </div>
          <p style="color:#666;font-size:13px;line-height:1.6;">
            If you did not create a TimeCut account, you can safely ignore this email.
            This link will expire in 24 hours.
          </p>
          <p style="color:#555;font-size:13px;text-align:center;margin-top:32px;">
            Questions? <a href="mailto:support@timecut.online" style="color:#d4af37;">support@timecut.online</a>
          </p>
        </div>
      `,
    })
    console.log(`[resend] Verification email sent to ${to}`)
  } catch (err) {
    console.error('[resend] Failed to send verification email:', err)
  }
}

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

const STRIPE_PLAN_MAP: Record<string, string> = {
  'timecutstarter': 'starter',
  'timecutpro': 'pro',
  'timecutbusiness': 'business',
}

const app = express()
app.use(cors())

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2023-10-16' as any })

// Stripe product metadata only. The charge amount comes from the config/plans
// Firestore doc (Admin Dashboard) via getStripeAmount() so the price shown on
// the site and the price charged by Stripe always come from one place.
const STRIPE_PLANS: Record<string, { name: string; description: string }> = {
  starter: {
    name: 'TimeCut Starter',
    description: 'Build better information habits — 60 analyses/month',
  },
  pro: {
    name: 'TimeCut Pro',
    description: 'Make faster decisions at scale — 300 analyses/month',
  },
  business: {
    name: 'TimeCut Business',
    description: 'Scale your content intelligence — 2,000 analyses/month',
  },
}

// Used only when config/plans has no explicit price for a plan (e.g. Business,
// which is "Contact Sales" and therefore has priceCents = null).
const FALLBACK_AMOUNT_CENTS: Record<string, number> = {
  starter: 900,
  pro: 2900,
  business: 14900,
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

// Cache Stripe product IDs so we don't create duplicates on every request
const productIdCache: Record<string, string> = {}

async function getOrCreateProductId(plan: string): Promise<string> {
  if (productIdCache[plan]) return productIdCache[plan]

  const planConfig = STRIPE_PLANS[plan]
  // Only search for active products
  const existing = await stripe.products.search({
    query: `name:"${planConfig.name}" AND active:"true"`,
    limit: 1,
  })
  if (existing.data.length > 0) {
    productIdCache[plan] = existing.data[0].id
    return productIdCache[plan]
  }
  // Create a fresh active product
  const product = await stripe.products.create({
    name: planConfig.name,
    description: planConfig.description,
  })
  productIdCache[plan] = product.id
  return productIdCache[plan]
}

async function generateReport(content: string, language: string) {
  const truncated = content.slice(0, 15000)
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Language: ${language}\n\nContent to analyze:\n${truncated}` },
    ],
  })
  const raw = completion.choices[0]?.message?.content ?? '{}'
  return JSON.parse(raw)
}

// ── Send verification email via Resend ──
app.post('/api/send-verification-email', express.json(), async (req, res) => {
  const { email, name } = req.body
  if (!email) { res.status(400).json({ error: 'Missing email' }); return }
  try {
    const continueUrl = process.env.FRONTEND_URL ?? 'https://timecut.online'
    const verificationLink = await admin.auth().generateEmailVerificationLink(email, { url: continueUrl })
    await sendVerificationEmail(email, name ?? '', verificationLink)
    res.json({ success: true })
  } catch (err) {
    console.error('[send-verification-email] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send verification email' })
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
app.post('/api/create-subscription', express.json(), async (req, res) => {
  const { plan, uid, email, name } = req.body
  const planConfig = STRIPE_PLANS[plan]
  if (!planConfig) { res.status(400).json({ error: 'Invalid plan' }); return }

  try {
    // Look up existing Stripe customer from Firestore (non-fatal)
    let customerId: string | undefined
    if (adminDb && uid) {
      try {
        const snap = await adminDb.doc(`users/${uid}`).get()
        customerId = snap.data()?.stripeCustomerId as string | undefined
      } catch { /* ignore — will create new customer */ }
    }

    // Create Stripe customer if not found
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email || undefined,
        name: name || undefined,
        metadata: { firebaseUid: uid ?? '' },
      })
      customerId = customer.id
      // Save customer ID (non-fatal)
      if (adminDb && uid) {
        try {
          await adminDb.doc(`users/${uid}`).set({ stripeCustomerId: customerId }, { merge: true })
        } catch { /* ignore */ }
      }
    }

    // Get or create Stripe product (fixes "product_data not supported" error)
    const productId = await getOrCreateProductId(plan)

    // Same source as the pricing page: config/plans in Firestore.
    const amountCents = await getStripeAmount(plan)

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{
        price_data: {
          currency: 'usd',
          product: productId,           // ← product ID, not inline product_data
          unit_amount: amountCents,
          recurring: { interval: 'month' },
        },
      }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    })

    type ExpandedInvoice = Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | null }
    const invoice      = subscription.latest_invoice as ExpandedInvoice
    const paymentIntent = invoice?.payment_intent ?? null

    if (!paymentIntent?.client_secret) {
      console.error('[subscription] Missing client_secret for sub:', subscription.id)
      res.status(500).json({ error: 'Could not initialise payment. Please try again.' })
      return
    }

    res.json({
      subscriptionId: subscription.id,
      clientSecret: paymentIntent.client_secret,
      amountCents,
    })
  } catch (err) {
    console.error('[subscription] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Subscription creation failed' })
  }
})

// Step 2: verify payment and activate plan in Firestore
app.post('/api/activate-plan', express.json(), async (req, res) => {
  const { subscriptionId, uid, plan, paymentIntentId, email, name } = req.body
  if (!uid || !plan) {
    res.status(400).json({ error: 'Missing required fields' })
    return
  }
  try {
    let shouldActivate = false
    let customerId: string | undefined

    // ── Primary: verify the PaymentIntent directly (most reliable, always up-to-date) ──
    if (paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
      if (pi.status === 'succeeded') {
        shouldActivate = true
        customerId = typeof pi.customer === 'string' ? pi.customer : (pi.customer as Stripe.Customer)?.id
        console.log(`[activate-plan] PI ${paymentIntentId} confirmed succeeded`)
      } else {
        console.warn(`[activate-plan] PI status not succeeded: ${pi.status}`)
      }
    }

    // ── Fallback: check subscription status (in case paymentIntentId wasn't passed) ──
    if (!shouldActivate && subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      shouldActivate = subscription.status === 'active' || subscription.status === 'trialing'
      customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : (subscription.customer as Stripe.Customer)?.id
      console.log(`[activate-plan] Sub fallback status: ${subscription.status}`)
    }

    if (shouldActivate) {
      if (adminDb) {
        await adminDb.doc(`users/${uid}`).set(
          {
            plan,
            ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
            ...(customerId ? { stripeCustomerId: customerId } : {}),
          },
          { merge: true },
        )
        console.log(`[activate-plan] ✓ uid=${uid} → plan=${plan}`)
      }
      if (email) {
        await sendPlanConfirmationEmail(email, name ?? '', plan)
      }
      res.json({ success: true, plan })
    } else {
      console.warn(`[activate-plan] Could not verify payment for uid=${uid}`)
      res.json({ success: false })
    }
  } catch (err) {
    console.error('[activate-plan] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Activation failed' })
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
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    let event: Stripe.Event

    try {
      if (webhookSecret) {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
      } else {
        event = JSON.parse(req.body.toString()) as Stripe.Event
      }
    } catch (err) {
      res.status(400).send(`Webhook error: ${err instanceof Error ? err.message : 'unknown'}`)
      return
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const uid = session.client_reference_id
      const subscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id

      if (uid && adminDb && subscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          const productId = subscription.items.data[0]?.price.product as string
          const product = await stripe.products.retrieve(productId)
          const planKey = STRIPE_PLAN_MAP[product.name.toLowerCase().replace(/\s+/g, '')]
            ?? (product.metadata?.plan as string | undefined)
          if (planKey) {
            await adminDb.doc(`users/${uid}`).update({
              plan: planKey,
              stripeCustomerId: session.customer,
              stripeSubscriptionId: subscriptionId,
            })
            console.log(`[webhook] Updated user ${uid} to plan: ${planKey}`)
          }
        } catch (e) {
          console.error('[webhook] Firestore update failed:', e)
        }
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id
      if (customerId && adminDb) {
        try {
          const users = await adminDb.collection('users')
            .where('stripeCustomerId', '==', customerId).limit(1).get()
          if (!users.empty) {
            await users.docs[0].ref.update({ plan: 'free' })
            console.log(`[webhook] Downgraded customer ${customerId} to free`)
          }
        } catch (e) {
          console.error('[webhook] Subscription cancel update failed:', e)
        }
      }
    }

    res.json({ received: true })
  }
)

// ── Decision Intelligence: multi-document analysis (Phase 4 — Expert Frameworks) ──

const UNIFIED_OUTPUT_FORMAT = `
OUTPUT FORMAT (JSON ONLY — no markdown, no extra keys):
{
  "document_type": "<cv|supplier_quotation|contract|business_proposal|general>",
  "recommendation": "<1-3 sentences, cautious tone, references best-fit document(s) with rationale>",
  "ranking": [
    { "rank": 1, "name": "<document name>", "summary": "<1-2 sentences: why this rank>" }
  ],
  "confidence_score": <integer 0-100>,
  "confidence_rationale": "<1-2 sentences>",
  "decision_strength": <integer 1-5>,
  "decision_strength_reason": "<1-2 sentences>",
  "what_would_change": "<REQUIRED: 2-3 sentences — what new information or conditions would reverse this recommendation>",
  "if_i_were_you": "<REQUIRED: 3-5 sentences of direct personal advice starting with 'I would...'>",
  "before_signing_checklist": ["<action item 1>", "<action item 2>", "<action item 3>"],
  "compared_categories": ["<category 1>", "<category 2>", "<category 3>"],
  "confidence_breakdown": {
    "document_completeness": <integer 0-100>,
    "evidence_consistency": <integer 0-100>,
    "risk_severity": <integer 0-100>,
    "missing_information": <integer 0-100>
  },
  "hidden_risks": [
    { "description": "<1-2 sentences>", "severity": "High|Medium|Low", "reasoning": ["<specific reason 1>", "<specific reason 2>"] }
  ],
  "missing_information": [
    { "title": "<name of missing item>", "whyItMatters": "<why>", "action": "<how to obtain>", "evidence": "<Not found|Unclear|Partially mentioned>" }
  ],
  "smart_skeptic_questions": ["<question 1>", "<question 2>", "<question 3>"],
  "decision_defense": "<2-4 sentences: business justification for the recommendation>",
  "evidence_found": [
    { "section": "<section name>", "page": "<page or null>", "clause": "<clause or null>", "confidence": <0-100>, "context": "<2-3 sentences>", "document": "<source document name>" }
  ],
  "documents_analyzed": <integer>,
  "verification_questions": [
    {
      "question": "<specific verification question>",
      "strong_answer_should_include": ["<element 1>", "<element 2>", "<element 3>"],
      "red_flags": ["<warning sign 1>", "<warning sign 2>"],
      "why_it_matters": "<why this question reveals real vs. claimed>"
    }
  ],
  "interview_red_flags": ["<behavioral red flag 1>", "<red flag 2>"],
  "recommended_actions": [
    { "action": "<next step>", "reason": "<why>", "priority": "High|Medium|Low" }
  ],
  "negotiation_suggestions": [
    { "clause": "<term to negotiate>", "issue": "<what is wrong or missing>", "suggested_improvement": "<what to request>", "leverage": "<why they might agree>" }
  ],
  "weak_evidence": [
    { "claim": "<specific claim in document>", "issue": "<why it is weak or unsupported>", "recommendation": "<what evidence should be provided>" }
  ],
  "decision_playbook": {
    "final_recommendation": "<one clear sentence: Hire/Do Not Hire or Approve/Reject or Sign/Negotiate/Do Not Sign>",
    "key_reasons": ["<reason 1>", "<reason 2>", "<reason 3>"],
    "remaining_risks": ["<risk 1>", "<risk 2>"],
    "action_checklist": ["<action before deciding 1>", "<action 2>", "<action 3>"]
  }
}

EVIDENCE STATUS OPTIONS: "Not found" | "Unclear" | "Partially mentioned"
SEVERITY: High = material harm; Medium = significant uncertainty; Low = minor concern.
Generate ALL text fields in the user's selected language.`

const CV_SYSTEM_PROMPT = `You are a Senior HR Director and Talent Intelligence Expert with 20+ years of hiring experience. Your role is to analyze CVs and help hiring managers make evidence-based hiring decisions.

YOU ARE NOT A SUMMARIZER. You are a talent risk assessor and competency verifier.

YOUR EXPERT FOCUS:
1. Experience Authenticity — Is claimed experience real and verifiable, or embellished? Look for vague language like "responsible for", "assisted with", "involved in" with no outcomes.
2. Skill Evidence — Are skills demonstrated through measurable results, or just listed?
3. Leadership Evidence — Is leadership proven through scope, team size, and impact — or just claimed?
4. Missing Competencies — What key skills does the target role require that are absent from the CV?
5. Employment Stability — Are there concerning gaps, frequent short tenures, or unexplained role changes?
6. Hiring Risks — What are the risks of hiring this candidate based on the document evidence?
7. Competency Verification — Generate questions that distinguish real hands-on experience from paper claims.

CRITICAL RULES:
- Challenge every significant claim. "Managed a team" means nothing without size, scope, and outcome.
- Candidates with real experience cite numbers, timelines, and measurable outcomes.
- Employment gaps, frequent job changes, and downward career moves must be flagged as risks.
- Generate at least 5 competency verification questions targeting the most important claimed skills.
- Each verification question must be impossible to answer well without real experience.
- "interview_red_flags" should list behavioral patterns to watch for during the interview.
- "negotiation_suggestions" must be an empty array [] for CVs.
- "weak_evidence" must be an empty array [] for CVs.
- "document_type" must be "cv".

${UNIFIED_OUTPUT_FORMAT}`

const SUPPLIER_SYSTEM_PROMPT = `You are a Senior Procurement Manager and Commercial Negotiator with 20+ years of experience evaluating supplier quotations. Your role is to analyze supplier quotations and protect the buyer's interests.

YOU ARE NOT A SUMMARIZER. You are a commercial risk assessor and negotiation advisor.

YOUR EXPERT FOCUS:
1. Pricing Transparency — Are all costs clearly stated? Hidden fees, escalation clauses, ambiguous pricing?
2. Delivery Commitments — Are delivery dates firm commitments with penalties, or merely estimates?
3. Warranty Terms — Are defect categories, claim procedures, and response times clearly defined?
4. Payment Terms — Are payment milestones, methods, and conditions clearly stated and favorable?
5. SLA (Service Level Agreement) — Are performance standards and escalation paths formally defined?
6. Cancellation Terms — What are the costs and conditions for exit?
7. Liability Allocation — Who bears risk if something goes wrong?
8. Price Escalation Clauses — Can prices increase after signing? Under what conditions?
9. Negotiation Opportunities — Where is there room to improve terms before signing?
10. Past Performance Evidence — Are references, track record, or case studies provided?

SUPPLIER QUOTATION CHECKLIST — assess every item and flag missing ones:
1. Fixed Price Period — Defined period during which prices will not change?
2. Price Increase Cap — Maximum cap on price increases (% or index-linked)?
3. Delivery Guarantee — Formal committed delivery date with a penalty clause?
4. Late Delivery Penalty — Defined financial penalty for late or missed delivery?
5. Warranty Terms — Coverage, defect categories, claim procedure, response times?
6. Cancellation Terms — Notice periods and fees clearly stated?
7. Payment Terms — Schedule, method, milestones, and conditions clearly stated?
8. Liability Allocation — Is liability clearly assigned if something goes wrong?
9. Service Level Agreement — Formal SLA with escalation paths?
10. Evidence of Past Performance — References, case studies, or track record?

CRITICAL RULES:
- Generate at least 5 clarification questions to ask the supplier before signing.
- Each question must target a specific risk or missing term identified in the documents.
- "interview_red_flags" must be an empty array [] for supplier quotations.
- "weak_evidence" must be an empty array [] for supplier quotations.
- "document_type" must be "supplier_quotation".
- "negotiation_suggestions" must contain at least 3 specific negotiation points.

${UNIFIED_OUTPUT_FORMAT}`

const CONTRACT_SYSTEM_PROMPT = `You are an experienced Senior Commercial Contract Reviewer with 20+ years of experience analyzing commercial agreements. Your role is to identify contract risks, missing clauses, and negotiation opportunities.

YOU ARE NOT A SUMMARIZER. You are a contract risk detector and negotiation advisor.

YOUR EXPERT FOCUS:
1. High-Risk Clauses — Clauses that create excessive or unlimited liability.
2. One-Sided Clauses — Provisions that disproportionately favor one party.
3. Liability — How is liability capped, allocated, and excluded?
4. Indemnity — Who indemnifies whom, and under what circumstances?
5. Termination — Grounds and procedures for termination; notice periods.
6. Renewal — Are renewal terms automatic? Under what conditions?
7. Insurance — Are insurance requirements clearly specified and adequate?
8. Confidentiality — Is confidential information adequately protected?
9. Missing Clauses — What important provisions are absent from this contract?
10. Force Majeure — Are force majeure events appropriately defined?
11. Dispute Resolution — Is the mechanism clear, fair, and practical?
12. Governing Law — Which jurisdiction governs, and is it appropriate?
13. IP Rights — Who owns intellectual property created under this contract?
14. Assignment — Can rights be assigned without consent?

CRITICAL RULES:
- Flag every clause that creates unlimited or uncapped liability.
- Flag every clause where one party has unilateral rights (to terminate, amend, or assign) without notice.
- "missing_information" items represent missing clauses in the contract.
- Generate at least 5 clarification questions to ask before signing.
- "negotiation_suggestions" must target specific clauses with exact improvement requests.
- "interview_red_flags" must be an empty array [] for contracts.
- "weak_evidence" must be an empty array [] for contracts.
- "document_type" must be "contract".

${UNIFIED_OUTPUT_FORMAT}`

const PROPOSAL_SYSTEM_PROMPT = `You are a Senior Business Consultant and Strategic Advisor with 20+ years of evaluating business proposals and investment cases. Your role is to identify risks, unsupported claims, and strategic blind spots.

YOU ARE NOT A SUMMARIZER. You are a business risk assessor and strategic advisor.

YOUR EXPERT FOCUS:
1. Timeline Feasibility — Are proposed timelines realistic given scope and resources?
2. Budget Assumptions — Are financial projections based on credible, verifiable assumptions?
3. Deliverables Clarity — Are deliverables specific, measurable, and achievable?
4. ROI Assumptions — Are return on investment claims credible and evidence-based?
5. Resource Allocation — Are required resources (human, financial, technical) fully accounted for?
6. Weak Evidence — Which claims lack supporting data or third-party validation?
7. Unsupported Claims — Which assertions cannot be verified from the proposal documents?
8. Exit Strategy — What happens if the plan fails or underperforms?
9. Business Risks — What could go wrong that the proposal does not address?
10. Competitive Analysis — Is the competitive landscape honestly and completely assessed?
11. Assumptions Sensitivity — Which assumptions, if wrong, would most hurt the outcome?

CRITICAL RULES:
- Every significant claim in the proposal must be tested against available evidence.
- Flag projections with no supporting data as "weak_evidence" items.
- "weak_evidence" must contain at least 3 items identifying specific unsupported claims.
- Generate at least 5 critical questions that a skeptical investor or approver would ask.
- "negotiation_suggestions" should target specific deliverables, milestones, or commitments to negotiate.
- "interview_red_flags" must be an empty array [] for proposals.
- "document_type" must be "business_proposal".

${UNIFIED_OUTPUT_FORMAT}`

const AUTO_DETECT_SYSTEM_PROMPT = `You are a Critical Decision Intelligence Reviewer for TimeCut. You lead a team of expert advisors — a Senior HR Director, a Senior Procurement Manager, a Commercial Contract Reviewer, and a Business Consultant. You apply the right expert framework based on the document type.

STEP 1 — DETECT DOCUMENT TYPE:
Examine the documents and classify them as one of:
- "cv" — Resume, CV, or candidate profile for a job
- "supplier_quotation" — Supplier quotation, vendor proposal, price list, or procurement document
- "contract" — Legal contract, agreement, or terms and conditions document
- "business_proposal" — Business proposal, investment pitch, project plan, or strategic plan
- "general" — Any other document type

STEP 2 — APPLY THE RIGHT EXPERT PERSONA:
- "cv": Act as a Senior HR Director. Focus: experience authenticity, hiring risks, competency verification questions that distinguish real experience from claimed experience.
- "supplier_quotation": Act as a Senior Procurement Manager. Focus: pricing transparency, delivery commitments, warranty, SLA, liability, negotiation opportunities. Apply the supplier checklist (fixed price period, delivery guarantee, late penalty, warranty, cancellation terms, payment terms, liability, SLA, past performance).
- "contract": Act as a Commercial Contract Reviewer. Focus: high-risk clauses, one-sided provisions, missing clauses, liability, indemnity, termination, renewal, IP rights.
- "business_proposal": Act as a Business Consultant. Focus: timeline feasibility, budget assumptions, weak evidence, unsupported claims, ROI credibility, exit strategy, strategic risks.
- "general": Act as a Critical Decision Reviewer. Focus: risks, missing information, and decision quality.

CRITICAL RULES FOR ALL TYPES:
- You are NOT a summarizer. Do NOT paraphrase or describe what documents say.
- You ARE a risk detector, blind-spot finder, and decision advisor.
- Always challenge assumptions. Always look for what is MISSING.
- Surface hidden risks even when documents appear clean or positive.
- Output must be grounded in the actual documents. Do NOT generate generic findings.
- Generate at least 4 verification_questions relevant to the document type.
- Generate at least 3 recommended_actions as practical next steps.
- The decision_playbook must be specific to the document type.
- For "cv": "negotiation_suggestions" = [], "weak_evidence" = []
- For "supplier_quotation": "interview_red_flags" = [], "weak_evidence" = []
- For "contract": "interview_red_flags" = [], "weak_evidence" = []
- For "business_proposal": "interview_red_flags" = []
- For "general": "interview_red_flags" = [], "weak_evidence" = [], "negotiation_suggestions" = []

${UNIFIED_OUTPUT_FORMAT}`

function getFrameworkPrompt(documentType: string): string {
  switch (documentType) {
    case 'cv': return CV_SYSTEM_PROMPT
    case 'supplier_quotation': return SUPPLIER_SYSTEM_PROMPT
    case 'contract': return CONTRACT_SYSTEM_PROMPT
    case 'business_proposal': return PROPOSAL_SYSTEM_PROMPT
    default: return AUTO_DETECT_SYSTEM_PROMPT
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeDecisionReport(raw: Record<string, any>): Record<string, any> {
  const hiddenRisks = (raw.hidden_risks ?? []).map((r: any) => ({
    description: r.description ?? r.risk ?? r.text ?? '',
    severity: r.severity ?? 'Medium',
    reasoning: Array.isArray(r.reasoning) ? r.reasoning : (Array.isArray(r.reasons) ? r.reasons : []),
  }))

  const missingInfo = (raw.missing_information ?? []).map((m: any) => {
    if (typeof m === 'string' && m.trim()) {
      return { title: m.trim(), whyItMatters: '', action: '', evidence: 'Not found' }
    }
    return {
      title: m.title ?? m.name ?? m.item ?? m.topic ?? '',
      whyItMatters: m.whyItMatters ?? m.why_it_matters ?? m.why ?? m.importance ?? m.impact ?? '',
      action: m.action ?? m.recommended_action ?? m.recommendation ?? m.next_step ?? m.steps ?? '',
      evidence: m.evidence ?? m.evidence_status ?? m.status ?? m.availability ?? '',
    }
  })

  const evidenceFound = (raw.evidence_found ?? []).map((e: any) => ({
    section: e.section ?? e.area ?? e.topic ?? '',
    page: e.page ?? e.page_number ?? null,
    clause: e.clause ?? e.clause_reference ?? null,
    confidence: e.confidence ?? e.confidence_score ?? null,
    context: e.context ?? e.surrounding_text ?? e.excerpt ?? null,
    document: e.document ?? e.document_name ?? e.source ?? null,
  }))

  const verificationQuestions = (raw.verification_questions ?? []).map((q: any) => ({
    question: q.question ?? q.q ?? '',
    strong_answer_should_include: Array.isArray(q.strong_answer_should_include)
      ? q.strong_answer_should_include
      : (Array.isArray(q.strong_answer) ? q.strong_answer : []),
    red_flags: Array.isArray(q.red_flags) ? q.red_flags : [],
    why_it_matters: q.why_it_matters ?? q.why ?? q.importance ?? '',
  })).filter((q: any) => q.question)

  const recommendedActions = (raw.recommended_actions ?? []).map((a: any) => ({
    action: a.action ?? a.step ?? a.recommendation ?? '',
    reason: a.reason ?? a.why ?? a.rationale ?? '',
    priority: (['High', 'Medium', 'Low'].includes(a.priority)) ? a.priority : 'Medium',
  })).filter((a: any) => a.action)

  const negotiationSuggestions = (raw.negotiation_suggestions ?? []).map((n: any) => ({
    clause: n.clause ?? n.term ?? n.item ?? '',
    issue: n.issue ?? n.problem ?? n.concern ?? '',
    suggested_improvement: n.suggested_improvement ?? n.improvement ?? n.suggestion ?? n.recommended_change ?? '',
    leverage: n.leverage ?? n.leverage_point ?? n.rationale ?? undefined,
  })).filter((n: any) => n.clause)

  const weakEvidence = (raw.weak_evidence ?? []).map((w: any) => ({
    claim: w.claim ?? w.statement ?? '',
    issue: w.issue ?? w.problem ?? w.why_weak ?? '',
    recommendation: w.recommendation ?? w.action ?? w.suggestion ?? '',
  })).filter((w: any) => w.claim)

  const dp = raw.decision_playbook ?? {}
  const decisionPlaybook = {
    final_recommendation: dp.final_recommendation ?? dp.recommendation ?? '',
    key_reasons: Array.isArray(dp.key_reasons) ? dp.key_reasons : [],
    remaining_risks: Array.isArray(dp.remaining_risks) ? dp.remaining_risks : [],
    action_checklist: Array.isArray(dp.action_checklist) ? dp.action_checklist : [],
  }

  const score = raw.confidence_score ?? 75

  const ifIWereYou = raw.if_i_were_you?.trim() ||
    (raw.recommendation
      ? `I would ${raw.ranking?.[0]?.name ? `choose ${raw.ranking[0].name}` : 'proceed with the top-ranked option'} based on the available evidence. ${raw.decision_defense ?? raw.recommendation ?? ''}`.trim()
      : '')

  const whatWouldChange = raw.what_would_change?.trim() ||
    (hiddenRisks.length > 0
      ? `This recommendation would change if the identified risks are resolved — particularly: ${hiddenRisks[0]?.description ?? ''}. Provide additional documentation that addresses missing information items before signing.`
      : 'This recommendation would change if new evidence emerges that contradicts the current findings or if significant risks are discovered in additional documentation.')

  const beforeSigningChecklist: string[] = Array.isArray(raw.before_signing_checklist) && raw.before_signing_checklist.length > 0
    ? raw.before_signing_checklist
    : [
        ...missingInfo.slice(0, 3).map((m: any) => `Obtain and verify: ${m.title}`),
        'Confirm all pricing and payment terms in writing',
        'Review and sign only after all missing information is resolved',
      ].filter(Boolean)

  const comparedCategories: string[] = Array.isArray(raw.compared_categories) && raw.compared_categories.length > 0
    ? raw.compared_categories
    : evidenceFound.map((e: any) => e.section).filter(Boolean).slice(0, 6)

  const confidenceBreakdown = raw.confidence_breakdown ?? {
    document_completeness: Math.min(100, score + 5),
    evidence_consistency: Math.min(100, score),
    risk_severity: Math.max(0, 100 - (hiddenRisks.filter((r: any) => r.severity === 'High').length * 20)),
    missing_information: Math.max(0, 100 - (missingInfo.length * 15)),
  }

  return {
    ...raw,
    hidden_risks: hiddenRisks,
    missing_information: missingInfo,
    evidence_found: evidenceFound,
    if_i_were_you: ifIWereYou,
    what_would_change: whatWouldChange,
    before_signing_checklist: beforeSigningChecklist,
    compared_categories: comparedCategories,
    confidence_breakdown: confidenceBreakdown,
    verification_questions: verificationQuestions,
    recommended_actions: recommendedActions,
    negotiation_suggestions: negotiationSuggestions,
    weak_evidence: weakEvidence,
    decision_playbook: decisionPlaybook,
    interview_red_flags: Array.isArray(raw.interview_red_flags) ? raw.interview_red_flags : [],
  }
}

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
  try {
    const files = (req.files as Express.Multer.File[]) ?? []
    const { decisionGoal, language = 'English', documentType = 'auto' } = req.body
    const pageLimitRaw = req.headers['x-page-limit']
    const pageLimit = parseInt(Array.isArray(pageLimitRaw) ? pageLimitRaw[0] : (pageLimitRaw ?? '999999'), 10) || 999999

    console.log(`[analyze-decision] files=${files.length} goal="${decisionGoal}" lang=${language}`)

    if (!files.length) { res.status(400).json({ error: 'No files uploaded' }); return }
    if (!decisionGoal?.trim()) { res.status(400).json({ error: 'Decision goal is required' }); return }

    let totalPages = 0
    const documents: { name: string; content: string }[] = []
    const parseErrors: string[] = []

    for (const file of files) {
      const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')
      let text: string

      if (isPdf) {
        try {
          text = await extractPDFText(file.buffer)
          const meaningful = text.replace(/-+Page \(\d+\) Break-+/g, '').trim()
          if (meaningful.length < 20) {
            parseErrors.push(`"${file.originalname}" appears to be a scanned/image-based PDF with no extractable text.`)
            continue
          }
          const pageMarkers = (text.match(/-+Page \(\d+\) Break-+/g) ?? []).length
          totalPages += Math.max(pageMarkers, 1)
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

    if (totalPages > pageLimit) {
      res.status(400).json({ error: `Total pages (${totalPages}) exceeds your plan limit (${pageLimit} pages).` })
      return
    }

    const docsBlock = documents
      .map((d, i) => `--- Document ${i + 1}: ${d.name} ---\n${d.content.slice(0, 8000)}`)
      .join('\n\n')

    const systemPrompt = getFrameworkPrompt(documentType)
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      max_tokens: 8192,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Language: ${language}\n\nDecision Goal: ${decisionGoal}\n\n${docsBlock}` },
      ],
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw)
    const data = normalizeDecisionReport(parsed)
    res.json({ data: { ...data, pages_analyzed: totalPages } })
  } catch (err) {
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

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
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
          content: `Decision Goal: ${decisionGoal ?? 'Not specified'}\n\nReport Data:\n${reportContext}\n\nUser Question: ${question}`,
        },
      ],
    })

    const answer = completion.choices[0]?.message?.content ?? 'Unable to generate a response.'
    res.json({ answer })
  } catch (err) {
    console.error('[challenge-ai] Error:', err)
    const message = err instanceof Error ? err.message : 'Challenge AI failed'
    res.status(500).json({ error: message })
  }
})

// Text or URL analysis
app.post('/api/analyze', express.json(), async (req, res) => {
  const { type, content, url, language = 'English' } = req.body
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
    const data = await generateReport(textContent, language)
    res.json({ data })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Analysis failed' })
  }
})

// PDF analysis
app.post('/api/analyze-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'No PDF file uploaded' }); return }
    const text = await extractPDFText(req.file.buffer)
    const meaningful = text.replace(/-+Page \(\d+\) Break-+/g, '').trim()
    if (meaningful.length < 50) {
      throw new Error('This PDF has no extractable text (likely scanned/image-based). Please upload a PDF with selectable text.')
    }
    const language = req.body.language || 'English'
    const data = await generateReport(text, language)
    res.json({ data })
  } catch (err) {
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
