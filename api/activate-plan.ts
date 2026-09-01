import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import admin from 'firebase-admin'
import { stripe, getAdminDb, planFromSubscription } from './_lib/stripe-admin.js'
import { verifyAuth } from './_lib/auth.js'

// ── Post-payment activation ──────────────────────────────────────────────────
// This is the *fast path*: it upgrades the account the moment the browser
// confirms the payment, so the user sees their new plan immediately. It is not
// the only path — api/stripe-webhook.ts activates the same subscription from
// Stripe's own `invoice.payment_succeeded` event, so a closed tab or a dropped
// connection can no longer leave a paying customer on the free plan.
//
// Two rules make this safe:
//   1. The account upgraded is the one in the verified ID token, never a uid
//      from the request body.
//   2. The plan granted is read from the Stripe subscription's product, never
//      from the request body — so a $9 payment cannot be redeemed for Pro.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authed = await verifyAuth(req)
  if (!authed) {
    return res.status(401).json({ code: 'UNAUTHENTICATED', error: 'Please sign in to complete your subscription.' })
  }
  const uid = authed.uid

  const { subscriptionId, paymentIntentId } = req.body ?? {}
  if (!subscriptionId && !paymentIntentId) {
    return res.status(400).json({ error: 'Missing subscription or payment reference' })
  }

  try {
    let subscription: Stripe.Subscription | null = null
    let paid = false
    let customerId: string | undefined

    // Primary signal: the PaymentIntent the browser just confirmed.
    if (paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
      if (pi.status === 'succeeded') {
        paid = true
        customerId = typeof pi.customer === 'string' ? pi.customer : (pi.customer as Stripe.Customer)?.id
      } else {
        console.warn(`[activate-plan] PI status not succeeded: ${pi.status}`)
      }
    }

    if (subscriptionId) {
      subscription = await stripe.subscriptions.retrieve(subscriptionId)
      if (!paid) {
        paid = subscription.status === 'active' || subscription.status === 'trialing'
      }
      customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : (subscription.customer as Stripe.Customer)?.id
    }

    if (!paid) {
      console.warn(`[activate-plan] Payment not confirmed for uid=${uid}`)
      return res.status(402).json({
        success: false,
        code: 'PAYMENT_NOT_CONFIRMED',
        error: 'We could not confirm your payment yet. If you were charged, your plan will activate automatically within a minute.',
      })
    }

    if (!subscription) {
      // Paid, but we have no subscription to read the plan from. The webhook
      // will finish the job — do not guess a plan here.
      console.warn(`[activate-plan] Paid but no subscription reference for uid=${uid}; deferring to webhook`)
      return res.status(202).json({
        success: false,
        code: 'PENDING_WEBHOOK',
        error: 'Payment received. Your plan is being activated.',
      })
    }

    // The plan comes from what Stripe says was bought, not from the client.
    const planKey = await planFromSubscription(subscription)
    if (!planKey) {
      console.error(`[activate-plan] Could not resolve plan from subscription ${subscription.id}`)
      return res.status(500).json({ success: false, error: 'Could not determine your plan. Support has been notified.' })
    }

    // Verify the subscription really belongs to this user before granting it.
    const metaUid = subscription.metadata?.firebaseUid
    if (metaUid && metaUid !== uid) {
      console.error(`[activate-plan] uid mismatch: token=${uid} subscription=${metaUid}`)
      return res.status(403).json({ success: false, error: 'This subscription belongs to a different account.' })
    }

    const adminDb = getAdminDb()
    if (!adminDb) {
      return res.status(500).json({ success: false, error: 'Account service unavailable. Your plan will activate shortly.' })
    }

    // Expiry tracks Stripe's real billing period (plus a small buffer for
    // webhook delay), falling back to 37 days only if Stripe omits it.
    const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end
      ?? subscription.items.data[0]?.current_period_end
    const expiresAt = admin.firestore.Timestamp.fromDate(
      periodEnd !== undefined
        ? new Date((periodEnd + 3 * 24 * 60 * 60) * 1000)
        : new Date(Date.now() + 37 * 24 * 60 * 60 * 1000),
    )

    await adminDb.doc(`users/${uid}`).set(
      {
        plan: planKey,
        planStartDate: admin.firestore.FieldValue.serverTimestamp(),
        planExpiresAt: expiresAt,
        subscriptionStatus: subscription.status,
        stripeSubscriptionId: subscription.id,
        ...(customerId ? { stripeCustomerId: customerId } : {}),
      },
      { merge: true },
    )
    console.log(`[activate-plan] ✓ uid=${uid} → plan=${planKey}, expires=${expiresAt.toDate().toISOString()}`)

    return res.json({ success: true, plan: planKey })
  } catch (err) {
    console.error('[activate-plan] Error:', err)
    return res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Activation failed' })
  }
}
