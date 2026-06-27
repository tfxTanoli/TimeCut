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

const STRIPE_PLANS: Record<string, { name: string; description: string; amount: number }> = {
  starter: {
    name: 'TimeCut Starter',
    description: 'Build better information habits — 60 analyses/month',
    amount: 900,
  },
  pro: {
    name: 'TimeCut Pro',
    description: 'Make faster decisions at scale — 300 analyses/month',
    amount: 2900,
  },
  business: {
    name: 'TimeCut Business',
    description: 'Scale your content intelligence — 2,000 analyses/month',
    amount: 14900,
  },
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

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{
        price_data: {
          currency: 'usd',
          product: productId,           // ← product ID, not inline product_data
          unit_amount: planConfig.amount,
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
          unit_amount: planConfig.amount,
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

// ── Decision Intelligence: multi-document analysis ──
const DECISION_SYSTEM_PROMPT = `You are a Critical Decision Reviewer for TimeCut Decision Intelligence. Your role is to help users make better, safer decisions by analyzing their documents with a skeptical, risk-aware mindset.

CRITICAL RULES:
- You are NOT a summarizer. Do NOT describe or paraphrase what documents say.
- You ARE a risk detector, blind-spot finder, and decision advisor.
- Always challenge assumptions. Always look for what is MISSING.
- Surface hidden risks even when documents appear clean or positive.
- Use cautious, non-absolute language in recommendations.
- Rank documents by fit-to-decision-goal, not by general quality.
- Every risk must be described in 1-2 clear sentences.
- Evidence references must cite the document name and section/page if detectable.
- Output must be grounded in the actual uploaded documents.

YOUR ANALYSIS PROCESS:
1. Read all documents in the context of the stated decision goal.
2. Compare documents against each other AND against the decision goal.
3. Identify what information is present, what is missing, and what is suspicious.
4. Generate critical questions a skeptical stakeholder would ask.
5. Produce a structured decision report.

SUPPLIER QUOTATION DETECTION:
If any uploaded document is a supplier quotation, vendor proposal, or procurement document, check: fixed price guarantee, delivery SLA, warranty terms, cancellation policy, payment terms, liability/insurance, past performance.
Only include an item in missing_information if you cannot find clear supporting evidence in the uploaded documents.

MANDATORY OUTPUT RULES — ALL FIELDS BELOW ARE REQUIRED, NO EXCEPTIONS:
1. "missing_information" MUST be an array of OBJECTS with keys: title, whyItMatters, action, evidence. NEVER use plain strings.
2. "if_i_were_you" is REQUIRED — a non-empty string starting with "I would..."
3. "what_would_change" is REQUIRED — a non-empty string describing what would reverse the recommendation.
4. "before_signing_checklist" is REQUIRED — a non-empty array of at least 3 action strings.
5. "compared_categories" is REQUIRED — a non-empty array of category names compared across documents.
6. "confidence_breakdown" is REQUIRED — an object with all four numeric sub-scores.
7. "hidden_risks" items MUST include "reasoning" — an array of 2-3 bullet strings explaining why the AI flagged this.

OUTPUT FORMAT (JSON ONLY — no markdown, no extra keys):
{
  "recommendation": "<1-3 sentences, cautious tone, references best-fit document(s) with rationale>",
  "ranking": [
    { "rank": 1, "name": "<document name>", "summary": "<1-2 sentences: why this rank, based on decision goal fit>" }
  ],
  "confidence_score": <integer 0-100>,
  "confidence_rationale": "<1-2 sentences explaining the confidence score>",
  "decision_strength": <integer 1-5>,
  "decision_strength_reason": "<1-2 sentences explaining the decision strength rating>",
  "what_would_change": "<REQUIRED: 2-3 sentences — what conditions or new information would reverse this recommendation>",
  "if_i_were_you": "<REQUIRED: 3-5 sentences of direct personal consultant advice starting with 'I would...'>",
  "before_signing_checklist": ["<REQUIRED action item 1>", "<action item 2>", "<action item 3>"],
  "compared_categories": ["<REQUIRED category 1>", "<category 2>", "<category 3>"],
  "confidence_breakdown": {
    "document_completeness": <REQUIRED integer 0-100>,
    "evidence_consistency": <REQUIRED integer 0-100>,
    "risk_severity": <REQUIRED integer 0-100>,
    "missing_information": <REQUIRED integer 0-100>
  },
  "hidden_risks": [
    {
      "description": "<clear risk description, 1-2 sentences>",
      "severity": "High",
      "reasoning": ["<specific reason 1>", "<specific reason 2>"]
    }
  ],
  "missing_information": [
    {
      "title": "<OBJECT REQUIRED — name of missing item>",
      "whyItMatters": "<why this matters for the decision>",
      "action": "<recommended action to get this information>",
      "evidence": "<Not found | Unclear | Partially mentioned>"
    }
  ],
  "smart_skeptic_questions": ["<critical question 1>", "<critical question 2>"],
  "decision_defense": "<2-4 sentences: business justification for the recommendation>",
  "evidence_found": [
    {
      "section": "<section name>",
      "page": "<page number or null>",
      "clause": "<clause reference or null>",
      "confidence": <integer 0-100>,
      "context": "<2-3 sentences of surrounding context>",
      "document": "<source document name>"
    }
  ],
  "documents_analyzed": <integer>
}

SEVERITY DEFINITIONS:
- High: Could materially harm the decision outcome, cause financial/legal/reputational damage.
- Medium: Requires clarification before proceeding; significant uncertainty.
- Low: Minor concern, worth noting but unlikely to change the decision.

Generate ALL text fields in the user's selected language.`

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
    const { decisionGoal, language = 'English' } = req.body
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

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      messages: [
        { role: 'system', content: DECISION_SYSTEM_PROMPT },
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
