import Stripe from 'stripe'
import admin from 'firebase-admin'
import {
  stripe,
  STRIPE_PLANS,
  getOrCreateProductId,
  getAdminDb,
  listEntitlingSubscriptions,
  planFromSubscription,
} from './stripe-admin.js'
import { getStripeAmount } from './planConfig.js'

// ── Self-serve checkout, in one place ────────────────────────────────────────
// This logic used to exist twice: once in api/create-subscription.ts for Vercel
// and once inline in server/index.ts for local dev. The two drifted, and the
// drift was not cosmetic — the duplicate-subscription guard was added to the
// Vercel copy only, so running locally still created a brand-new subscription
// on every call. A test run produced three subscriptions for one customer.
//
// Both entry points now call `resolveSubscriptionRequest`, so a fix cannot be
// present in one environment and missing from the other.
//
// Three outcomes, and only one of them changes anything:
//
//   • no subscription yet          → create one, return a client secret
//   • a subscription on this plan  → refuse; there is nothing to buy
//   • a subscription on another plan → report that a switch is needed, and
//     perform it ONLY when the caller passes `confirmSwitch`
//
// That last split matters: the checkout modal calls this on mount, so mutating
// unconditionally would move a paying customer between plans (and bill the
// proration) merely because they clicked a pricing card to look at it.

const EXPIRY_BUFFER_SECONDS = 3 * 24 * 60 * 60
const FALLBACK_PERIOD_MS = 37 * 24 * 60 * 60 * 1000

function periodEndOf(subscription: Stripe.Subscription): number | undefined {
  return (subscription as unknown as { current_period_end?: number }).current_period_end
    ?? subscription.items.data[0]?.current_period_end
}

export interface SubscriptionRequest {
  uid: string
  plan: string
  email?: string
  name?: string
  /** Only a confirmed request may change an existing subscription. */
  confirmSwitch?: boolean
}

export interface SubscriptionResult {
  status: number
  body: Record<string, unknown>
}

export async function resolveSubscriptionRequest(
  req: SubscriptionRequest,
): Promise<SubscriptionResult> {
  const { uid, plan, email, name, confirmSwitch } = req

  // STRIPE_PLANS holds only the self-serve plans. Business/Custom are sold
  // through Contact Sales and provisioned by hand, so they can never be
  // charged here — this is what stops a "Contact Sales" button from taking a
  // card payment for features that are not self-serve.
  const planMeta = STRIPE_PLANS[plan]
  if (!planMeta) {
    return {
      status: 400,
      body: {
        code: 'PLAN_NOT_SELF_SERVE',
        error: 'This plan is not available for self-serve checkout. Please contact sales.',
      },
    }
  }

  const amountCents = await getStripeAmount(plan)
  if (!amountCents || amountCents <= 0) {
    return {
      status: 400,
      body: {
        code: 'PRICE_UNAVAILABLE',
        error: 'This plan has no price configured. Please contact support.',
      },
    }
  }

  const adminDb = getAdminDb()
  let customerId: string | undefined

  if (adminDb) {
    try {
      const snap = await adminDb.doc(`users/${uid}`).get()
      customerId = snap.data()?.stripeCustomerId as string | undefined
    } catch { /* ignore */ }
  }

  // A stored customer can be unusable: it may belong to a different Stripe
  // account (after an API-key switch) or have been deleted. Verify before
  // reusing, otherwise subscriptions.create fails with "No such customer".
  if (customerId) {
    try {
      const existing = await stripe.customers.retrieve(customerId)
      if ('deleted' in existing && existing.deleted) customerId = undefined
    } catch {
      console.warn('[subscription] Unusable stripeCustomerId, creating a new one:', customerId)
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

  // ── Does this customer already pay us for something? ──
  const existingSubs = await listEntitlingSubscriptions(customerId)

  if (existingSubs.length > 0) {
    // Where a customer somehow carries more than one (created before this
    // check existed), the newest is the one they believe they are on.
    const current = existingSubs.sort((a, b) => b.created - a.created)[0]
    const currentPlan = await planFromSubscription(current)

    if (currentPlan === plan) {
      return {
        status: 409,
        body: {
          code: 'ALREADY_SUBSCRIBED',
          plan,
          error: `You are already subscribed to ${planMeta.name.replace('TimeCut ', '')}. Manage or cancel your subscription from your account page.`,
        },
      }
    }

    // A switch is a billing event with an immediate prorated charge or credit,
    // so it needs the customer to have actually asked for it. The unconfirmed
    // call is strictly read-only.
    if (!confirmSwitch) {
      return {
        status: 200,
        body: {
          requiresConfirmation: true,
          currentPlan,
          plan,
          amountCents,
          subscriptionId: current.id,
        },
      }
    }

    const itemId = current.items.data[0]?.id
    if (!itemId) {
      console.error('[subscription] Subscription has no items to switch:', current.id)
      return { status: 500, body: { error: 'Could not change your plan. Please contact support.' } }
    }

    const updated = await stripe.subscriptions.update(current.id, {
      items: [{
        id: itemId,
        price_data: {
          currency: 'usd',
          product: productId,
          unit_amount: amountCents,
          recurring: { interval: 'month' },
        },
      }],
      proration_behavior: 'always_invoice',
      metadata: { ...current.metadata, firebaseUid: uid, plan },
    })

    // Grant immediately when Stripe says the subscription is live. When the
    // prorated invoice still needs action the status will not be active, and
    // the plan is left for `invoice.payment_succeeded` to grant.
    const live = updated.status === 'active' || updated.status === 'trialing'
    if (live && adminDb) {
      const periodEnd = periodEndOf(updated)
      const expiresAt = admin.firestore.Timestamp.fromDate(
        periodEnd !== undefined
          ? new Date((periodEnd + EXPIRY_BUFFER_SECONDS) * 1000)
          : new Date(Date.now() + FALLBACK_PERIOD_MS),
      )
      await adminDb.doc(`users/${uid}`).set({
        plan,
        planStartDate: admin.firestore.FieldValue.serverTimestamp(),
        planExpiresAt: expiresAt,
        subscriptionStatus: updated.status,
        stripeSubscriptionId: updated.id,
        stripeCustomerId: customerId,
      }, { merge: true })
    }

    console.log(`[subscription] ✓ uid=${uid} switched ${currentPlan ?? 'unknown'} → ${plan} on ${updated.id} (status=${updated.status})`)

    return {
      status: 200,
      body: {
        switched: true,
        activated: live,
        plan,
        previousPlan: currentPlan,
        subscriptionId: updated.id,
        amountCents,
      },
    }
  }

  // First subscription for this customer.
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
    // account even if the customer lookup ever fails.
    metadata: { firebaseUid: uid, plan },
  })

  type ExpandedInvoice = Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | null }
  const invoice = subscription.latest_invoice as ExpandedInvoice
  const paymentIntent = invoice?.payment_intent ?? null

  if (!paymentIntent?.client_secret) {
    console.error('[subscription] Missing client_secret for sub:', subscription.id)
    return { status: 500, body: { error: 'Could not initialise payment. Please try again.' } }
  }

  return {
    status: 200,
    body: {
      subscriptionId: subscription.id,
      clientSecret: paymentIntent.client_secret,
      amountCents,
    },
  }
}
