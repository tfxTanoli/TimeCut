import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import OpenAI from 'openai'
import PDFParser from 'pdf2json'
import Stripe from 'stripe'
import admin from 'firebase-admin'

function extractPDFText(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, true)
    parser.on('pdfParser_dataReady', () => resolve(parser.getRawTextContent()))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parser.on('pdfParser_dataError', (err: any) => reject(err.parserError ?? err))
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

const STRIPE_PLAN_MAP: Record<string, string> = {
  'timecutstarter': 'starter',
  'timecutpro': 'pro',
}

const app = express()
app.use(cors())

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2023-10-16' as any })

const STRIPE_PLANS: Record<string, { name: string; description: string; amount: number }> = {
  starter: {
    name: 'TimeCut Starter',
    description: 'For smarter daily reading — 500 analyses/month',
    amount: 900,
  },
  pro: {
    name: 'TimeCut Pro',
    description: 'For professionals and power users — 300 analyses/month',
    amount: 2900,
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
  const { subscriptionId, uid, plan, paymentIntentId } = req.body
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
