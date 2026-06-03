import Stripe from 'stripe'
import admin from 'firebase-admin'

// ── Stripe ──────────────────────────────────────────────────────────────────
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2023-10-16' as any,
})

export const STRIPE_PLANS: Record<string, { name: string; description: string; amount: number }> = {
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

export const STRIPE_PLAN_MAP: Record<string, string> = {
  timecutstarter: 'starter',
  timecutpro: 'pro',
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
