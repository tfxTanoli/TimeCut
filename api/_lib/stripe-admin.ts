import Stripe from 'stripe'
import admin from 'firebase-admin'

// ── Stripe ──────────────────────────────────────────────────────────────────
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  // Pinned deliberately: this code is written against the 2023-10-16 response
  // shapes. Stripe types `apiVersion` as the newest version only, so pinning an
  // older one requires a cast — Stripe's own typings prescribe exactly this.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiVersion: '2023-10-16' as any,
})

// Stripe product metadata only. Prices are NOT stored here — the charge amount
// comes from the config/plans Firestore doc via getStripeAmount() in
// ./planConfig so prices can be changed from the Admin Dashboard (one place)
// without a redeploy and without the site and Stripe drifting apart.
// Self-serve plans only. Business is sold through Contact Sales and is
// provisioned manually, so it must NOT be purchasable through this API.
export const STRIPE_PLANS: Record<string, { name: string; description: string }> = {
  starter: {
    name: 'TimeCut Starter',
    description: 'AI Decision Intelligence — 500 AI Credits/month · up to 5 documents per report',
  },
  pro: {
    name: 'TimeCut Pro',
    description: 'Advanced decision intelligence — 3,000 AI Credits/month · up to 10 documents per report',
  },
}

export const STRIPE_PLAN_MAP: Record<string, string> = {
  timecutstarter: 'starter',
  timecutpro: 'pro',
  timecutbusiness: 'business',
}

/**
 * An unsigned webhook is a way to grant yourself any plan for nothing: the
 * handlers below activate subscriptions from the event body alone. Skipping
 * verification is therefore only ever acceptable on a local machine running
 * Stripe test keys — never in a deployment, and never with a live key.
 */
export function webhookVerification(): { secret: string } | { skip: true } | { refuse: string } {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (secret) return { secret }

  const isLiveKey = (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_live')
  if (isLiveKey) {
    return { refuse: 'STRIPE_WEBHOOK_SECRET is required when using live Stripe keys. Refusing to trust an unsigned event.' }
  }
  if (process.env.VERCEL) {
    return { refuse: 'STRIPE_WEBHOOK_SECRET is not set on this deployment. Refusing to trust an unsigned event.' }
  }
  console.warn('[webhook] No STRIPE_WEBHOOK_SECRET — accepting unsigned events (local test mode only).')
  return { skip: true }
}

// ── Firebase Admin ───────────────────────────────────────────────────────────
// Serverless functions are stateless so we guard against re-initialisation
let _adminDb: admin.firestore.Firestore | null = null

export function getAdminDb(): admin.firestore.Firestore | null {
  if (_adminDb) return _adminDb

  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  if (!b64) {
    console.warn('[firebase-admin] FIREBASE_SERVICE_ACCOUNT_BASE64 not set')
    return null
  }

  try {
    const sa = JSON.parse(Buffer.from(b64, 'base64').toString())
    if (admin.apps.length === 0) {
      admin.initializeApp({ credential: admin.credential.cert(sa) })
    }
    _adminDb = admin.firestore()
    return _adminDb
  } catch (e) {
    console.error('[firebase-admin] init failed:', e)
    return null
  }
}

// ── Stripe product ID cache (per cold-start) ─────────────────────────────────
const productIdCache: Record<string, string> = {}

export async function getOrCreateProductId(plan: string): Promise<string> {
  if (productIdCache[plan]) return productIdCache[plan]

  const planConfig = STRIPE_PLANS[plan]
  const existing = await stripe.products.search({
    query: `name:"${planConfig.name}" AND active:"true"`,
    limit: 1,
  })
  if (existing.data.length > 0) {
    productIdCache[plan] = existing.data[0].id
    return productIdCache[plan]
  }
  const product = await stripe.products.create({
    name: planConfig.name,
    description: planConfig.description,
    // Stamped so the plan can be recovered from Stripe alone (webhooks,
    // activation) without depending on the product name staying unchanged.
    metadata: { plan },
  })
  productIdCache[plan] = product.id
  return productIdCache[plan]
}

/**
 * Determine which TimeCut plan a Stripe subscription is for, using Stripe as
 * the source of truth. Never trust a plan name sent by the browser — the price
 * the customer actually paid is what decides their plan.
 */
export async function planFromSubscription(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const productRef = subscription.items.data[0]?.price?.product
  if (!productRef) return null

  const product = typeof productRef === 'string'
    ? await stripe.products.retrieve(productRef)
    : (productRef as Stripe.Product)

  if ('deleted' in product && product.deleted) return null

  const byMetadata = (product as Stripe.Product).metadata?.plan
  if (byMetadata && STRIPE_PLANS[byMetadata]) return byMetadata

  const byName = STRIPE_PLAN_MAP[(product as Stripe.Product).name?.toLowerCase().replace(/\s+/g, '') ?? '']
  return byName ?? null
}
