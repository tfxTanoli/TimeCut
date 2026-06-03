import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { stripe, getAdminDb } from './_lib/stripe-admin.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { subscriptionId, uid, plan, paymentIntentId } = req.body ?? {}
  if (!uid || !plan) return res.status(400).json({ error: 'Missing required fields' })

  try {
    let shouldActivate = false
    let customerId: string | undefined

    // Primary: verify PaymentIntent directly — always succeeded immediately after confirmPayment()
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

    // Fallback: check subscription status
    if (!shouldActivate && subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      shouldActivate = subscription.status === 'active' || subscription.status === 'trialing'
      customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : (subscription.customer as Stripe.Customer)?.id
      console.log(`[activate-plan] Sub fallback status: ${subscription.status}`)
    }

    if (shouldActivate) {
      const adminDb = getAdminDb()
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
      return res.json({ success: true, plan })
    }

    console.warn(`[activate-plan] Could not verify payment for uid=${uid}`)
    return res.json({ success: false })
  } catch (err) {
    console.error('[activate-plan] Error:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Activation failed' })
  }
}
