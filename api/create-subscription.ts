import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { stripe, STRIPE_PLANS, getOrCreateProductId, getAdminDb } from './_lib/stripe-admin.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { plan, uid, email, name } = req.body ?? {}
  const planConfig = STRIPE_PLANS[plan]
  if (!planConfig) return res.status(400).json({ error: 'Invalid plan' })

  try {
    const adminDb = getAdminDb()
    let customerId: string | undefined

    // Reuse existing Stripe customer if available
    if (adminDb && uid) {
      try {
        const snap = await adminDb.doc(`users/${uid}`).get()
        customerId = snap.data()?.stripeCustomerId as string | undefined
      } catch { /* ignore */ }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email || undefined,
        name: name || undefined,
        metadata: { firebaseUid: uid ?? '' },
      })
      customerId = customer.id
      if (adminDb && uid) {
        try {
          await adminDb.doc(`users/${uid}`).set({ stripeCustomerId: customerId }, { merge: true })
        } catch { /* ignore */ }
      }
    }

    const productId = await getOrCreateProductId(plan)

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{
        price_data: {
          currency: 'usd',
          product: productId,
          unit_amount: planConfig.amount,
          recurring: { interval: 'month' },
        },
      }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    })

    type ExpandedInvoice = Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | null }
    const invoice = subscription.latest_invoice as ExpandedInvoice
    const paymentIntent = invoice?.payment_intent ?? null

    if (!paymentIntent?.client_secret) {
      console.error('[create-subscription] Missing client_secret for sub:', subscription.id)
      return res.status(500).json({ error: 'Could not initialise payment. Please try again.' })
    }

    return res.json({ subscriptionId: subscription.id, clientSecret: paymentIntent.client_secret })
  } catch (err) {
    console.error('[create-subscription] Error:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Subscription creation failed' })
  }
}
