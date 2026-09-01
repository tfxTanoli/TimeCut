import type { VercelRequest, VercelResponse } from '@vercel/node'
import { stripe, getAdminDb } from './_lib/stripe-admin.js'
import { verifyAuth } from './_lib/auth.js'

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

    const origin = (req.headers.origin as string | undefined)
      ?? (process.env.FRONTEND_URL as string | undefined)
      ?? 'https://timecut.ai'

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
