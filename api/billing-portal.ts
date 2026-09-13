import type { VercelRequest, VercelResponse } from '@vercel/node'
import { stripe, getAdminDb } from './_lib/stripe-admin.js'
import { verifyAuth } from './_lib/auth.js'

/** Production site, used when no trusted origin can be established. */
const DEFAULT_APP_URL = 'https://timecut.online'

/**
 * Where Stripe should send the customer back to.
 *
 * The caller's Origin header used to be pasted straight into the return URL,
 * so a request from any site produced a TimeCut-issued Stripe session that
 * redirected to that site afterwards — an open redirect with our name on it.
 * The origin is now honoured only when it is one of ours; anything else gets
 * the configured site URL. The fallback also pointed at timecut.ai, a domain
 * we do not own.
 */
function trustedReturnOrigin(originHeader: unknown): string {
  const configured = (process.env.FRONTEND_URL ?? '').replace(/\/+$/, '') || DEFAULT_APP_URL
  const origin = typeof originHeader === 'string' ? originHeader.replace(/\/+$/, '') : ''
  if (!origin) return configured

  const allowed = new Set<string>([
    configured,
    DEFAULT_APP_URL,
    'https://www.timecut.online',
    ...(process.env.APP_ALLOWED_ORIGINS ?? '').split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean),
  ])
  // This deployment's own Vercel URLs, so preview builds return to themselves.
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (host) allowed.add(`https://${host}`)
  }
  if (allowed.has(origin)) return origin

  // Local development only — a deployment never trusts localhost.
  if (!process.env.VERCEL && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin

  return configured
}

// ── Self-serve subscription management ───────────────────────────────────────
// Creates a Stripe Billing Portal session for the signed-in user, which is what
// makes the pricing FAQ's "cancel anytime from your account settings" true.
// The portal lets the customer cancel, update their card and download invoices
// without us handling any of it. Cancelling there fires
// `customer.subscription.deleted`, which api/stripe-webhook.ts already turns
// into a downgrade at the end of the paid period.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authed = await verifyAuth(req)
  if (!authed) {
    return res.status(401).json({ code: 'UNAUTHENTICATED', error: 'Please sign in to manage your subscription.' })
  }

  const adminDb = getAdminDb()
  if (!adminDb) return res.status(500).json({ error: 'Account service unavailable. Please try again.' })

  try {
    const snap = await adminDb.doc(`users/${authed.uid}`).get()
    const customerId = snap.data()?.stripeCustomerId as string | undefined

    if (!customerId) {
      return res.status(400).json({
        code: 'NO_SUBSCRIPTION',
        error: 'No billing account found. If you believe this is an error, please contact support.',
      })
    }

    // Confirm the customer still exists in this Stripe account before creating
    // a session — a stale id (after an API-key switch) would otherwise 500.
    try {
      const customer = await stripe.customers.retrieve(customerId)
      if ('deleted' in customer && customer.deleted) throw new Error('customer deleted')
    } catch {
      return res.status(400).json({
        code: 'NO_SUBSCRIPTION',
        error: 'No billing account found. If you believe this is an error, please contact support.',
      })
    }

    const origin = trustedReturnOrigin(req.headers.origin)

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/profile`,
    })

    return res.json({ url: session.url })
  } catch (err) {
    console.error('[billing-portal] Error:', err)
    const message = err instanceof Error ? err.message : 'Could not open billing management'
    // The portal needs a one-time configuration in the Stripe dashboard; say so
    // plainly rather than showing a raw Stripe error.
    if (message.includes('configuration')) {
      return res.status(500).json({
        error: 'Subscription management is not configured yet. Please contact support to cancel.',
      })
    }
    return res.status(500).json({ error: message })
  }
}
