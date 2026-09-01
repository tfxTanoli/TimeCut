import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { stripe, STRIPE_PLANS, getOrCreateProductId, getAdminDb } from './_lib/stripe-admin.js'
import { getStripeAmount } from './_lib/planConfig.js'
import { verifyAuth } from './_lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // The subscription is created for the signed-in caller, not for whatever uid
  // the request body claims.
  const authed = await verifyAuth(req)
  if (!authed) {
    return res.status(401).json({ code: 'UNAUTHENTICATED', error: 'Please sign in to subscribe.' })
  }
  const uid = authed.uid

  const { plan, email, name } = req.body ?? {}

  // STRIPE_PLANS holds only the self-serve plans. Business/Custom are sold
  // through Contact Sales and provisioned by hand, so they can never be
  // charged here — this is what stops a "Contact Sales" button from taking
  // a card payment for features that are not self-serve.
  const planMeta = STRIPE_PLANS[plan]
  if (!planMeta) {
    return res.status(400).json({
      code: 'PLAN_NOT_SELF_SERVE',
      error: 'This plan is not available for self-serve checkout. Please contact sales.',
    })
  }

  const amountCents = await getStripeAmount(plan)
  if (!amountCents || amountCents <= 0) {
    return res.status(400).json({
      code: 'PRICE_UNAVAILABLE',
      error: 'This plan has no price configured. Please contact support.',
    })
  }

  try {
    const adminDb = getAdminDb()
    let customerId: string | undefined

    // Reuse existing Stripe customer if available
    if (adminDb) {
      try {
        const snap = await adminDb.doc(`users/${uid}`).get()
        customerId = snap.data()?.stripeCustomerId as string | undefined
      } catch { /* ignore */ }
    }

    // A stored customer can be unusable: it may belong to a different Stripe
    // account (after an API-key switch) or have been deleted. Verify it before
    // reusing, otherwise subscriptions.create fails with "No such customer".
    if (customerId) {
      try {
        const existing = await stripe.customers.retrieve(customerId)
        if ('deleted' in existing && existing.deleted) customerId = undefined
      } catch {
        console.warn('[create-subscription] Unusable stripeCustomerId, creating a new one:', customerId)
        customerId = undefined
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email || undefined,
        name: name || undefined,
        metadata: { firebaseUid: uid },
      })
      customerId = customer.id
      if (adminDb) {
        try {
          await adminDb.doc(`users/${uid}`).set({ stripeCustomerId: customerId }, { merge: true })
        } catch { /* ignore */ }
      }
    }

    const productId = await getOrCreateProductId(plan)

    // Charge amount comes from config/plans (Admin Dashboard) — same source the
    // pricing page renders from, so displayed price === charged price. It is
    // resolved above, before any Stripe object is created.
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{
        price_data: {
          currency: 'usd',
          product: productId,
          unit_amount: amountCents,
          recurring: { interval: 'month' },
        },
      }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
      // Carried on the subscription so the webhook can activate the right
      // account even if the customer lookup ever fails. This is what makes
      // activation work without the browser having to report back.
      metadata: { firebaseUid: uid, plan },
    })

    type ExpandedInvoice = Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | null }
    const invoice = subscription.latest_invoice as ExpandedInvoice
    const paymentIntent = invoice?.payment_intent ?? null

    if (!paymentIntent?.client_secret) {
      console.error('[create-subscription] Missing client_secret for sub:', subscription.id)
      return res.status(500).json({ error: 'Could not initialise payment. Please try again.' })
    }

    return res.json({
      subscriptionId: subscription.id,
      clientSecret: paymentIntent.client_secret,
      amountCents,
    })
  } catch (err) {
    console.error('[create-subscription] Error:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Subscription creation failed' })
  }
}
