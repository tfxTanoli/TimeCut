import Stripe from 'stripe'
import admin from 'firebase-admin'

// ── Stripe ──────────────────────────────────────────────────────────────────
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2023-10-16' as any,
})

// Stripe product metadata only. Prices are NOT stored here — the charge amount
// comes from the config/plans Firestore doc via getStripeAmount() in
// ./planConfig so prices can be changed from the Admin Dashboard (one place)
// without a redeploy and without the site and Stripe drifting apart.
export const STRIPE_PLANS: Record<string, { name: string; description: string }> = {
  starter: {
    name: 'TimeCut Starter',
    description: 'AI Decision Intelligence — 500 AI Credits/month · up to 5 documents per report',
  },
  pro: {
    name: 'TimeCut Pro',
    description: 'Advanced decision intelligence — 3,000 AI Credits/month · up to 10 documents per report',
  },
  business: {
    name: 'TimeCut Business',
    description: 'Team decision intelligence — custom AI Credit allocation & workspace',
  },
}

export const STRIPE_PLAN_MAP: Record<string, string> = {
  timecutstarter: 'starter',
  timecutpro: 'pro',
  timecutbusiness: 'business',
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
  })
  productIdCache[plan] = product.id
  return productIdCache[plan]
}
