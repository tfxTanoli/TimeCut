import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import admin from 'firebase-admin'
import { stripe, getAdminDb, planFromSubscription } from './_lib/stripe-admin.js'

// Vercel must NOT parse the body — Stripe needs the raw bytes to verify the signature
export const config = { api: { bodyParser: false } }

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

// ── API-version shims ───────────────────────────────────────────────────────
// The client is pinned to apiVersion 2023-10-16 (see _lib/stripe-admin), so at
// runtime Stripe returns the fields below at their original top-level paths.
// The installed SDK's types describe a newer API version where they moved, so
// we read the pinned-version path first and fall back to the newer one — that
// keeps today's behaviour identical and survives a future apiVersion bump.

function getPeriodEnd(subscription: Stripe.Subscription): number | undefined {
  const legacy = (subscription as unknown as { current_period_end?: number }).current_period_end
  return legacy ?? subscription.items.data[0]?.current_period_end
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const legacy = (invoice as unknown as { subscription?: string | Stripe.Subscription | null }).subscription
  const current = legacy ?? invoice.parent?.subscription_details?.subscription
  if (!current) return undefined
  return typeof current === 'string' ? current : current.id
}

type AdminDb = NonNullable<ReturnType<typeof getAdminDb>>

/**
 * Find the user document a Stripe subscription belongs to. Prefers the
 * firebaseUid stamped on the subscription at creation, and falls back to a
 * lookup by customer id for subscriptions created before that was added.
 */
async function findUserRef(
  adminDb: AdminDb,
  subscription: Stripe.Subscription | null,
  customerId: string | undefined,
): Promise<admin.firestore.DocumentReference | null> {
  const uid = subscription?.metadata?.firebaseUid
  if (uid) {
    const ref = adminDb.doc(`users/${uid}`)
    if ((await ref.get()).exists) return ref
  }

  if (customerId) {
    const byCustomer = await adminDb.collection('users')
      .where('stripeCustomerId', '==', customerId).limit(1).get()
    if (!byCustomer.empty) return byCustomer.docs[0].ref
  }

  if (subscription?.id) {
    const bySub = await adminDb.collection('users')
      .where('stripeSubscriptionId', '==', subscription.id).limit(1).get()
    if (!bySub.empty) return bySub.docs[0].ref
  }

  return null
}

function expiryFrom(subscription: Stripe.Subscription): admin.firestore.Timestamp | null {
  const periodEnd = getPeriodEnd(subscription)
  if (periodEnd === undefined) return null
  // +3 days so a slow renewal webhook never briefly locks a paying customer out.
  return admin.firestore.Timestamp.fromDate(new Date((periodEnd + 3 * 24 * 60 * 60) * 1000))
}

/**
 * Grant (or renew) the plan a subscription actually pays for. Used by both the
 * first payment and every renewal, so activation never depends on the browser.
 */
async function activateFromSubscription(
  adminDb: AdminDb,
  subscription: Stripe.Subscription,
  customerId: string | undefined,
): Promise<void> {
  const userRef = await findUserRef(adminDb, subscription, customerId)
  if (!userRef) {
    console.error('[webhook] No user found for subscription:', subscription.id)
    return
  }

  const planKey = await planFromSubscription(subscription)
  if (!planKey) {
    console.error('[webhook] Could not resolve plan for subscription:', subscription.id)
    return
  }

  const expiresAt = expiryFrom(subscription)
  if (!expiresAt) {
    console.error('[webhook] No period end on subscription:', subscription.id)
    return
  }

  await userRef.set(
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
  console.log(`[webhook] ✓ ${userRef.id} → ${planKey}, expires ${expiresAt.toDate().toISOString()}`)
}

/** Return an account to the free plan. */
async function downgrade(
  adminDb: AdminDb,
  subscription: Stripe.Subscription | null,
  customerId: string | undefined,
  reason: string,
): Promise<void> {
  const userRef = await findUserRef(adminDb, subscription, customerId)
  if (!userRef) {
    console.error('[webhook] No user found to downgrade for customer:', customerId)
    return
  }
  await userRef.set(
    {
      plan: 'free',
      planStartDate: null,
      planExpiresAt: null,
      subscriptionStatus: subscription?.status ?? 'canceled',
    },
    { merge: true },
  )
  console.log(`[webhook] ${userRef.id} downgraded to free (${reason})`)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const sig = req.headers['stripe-signature'] as string
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const rawBody = await getRawBody(req)

  let event: Stripe.Event
  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
    } else {
      event = JSON.parse(rawBody.toString()) as Stripe.Event
    }
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err instanceof Error ? err.message : 'unknown'}`)
  }

  const adminDb = getAdminDb()
  if (!adminDb) {
    console.error('[webhook] Admin DB unavailable; asking Stripe to retry')
    return res.status(500).json({ error: 'Database unavailable' })
  }

  try {
    switch (event.type) {
      // Kept for Stripe Checkout redirects. The in-app Payment Element flow
      // never fires this — `invoice.payment_succeeded` below is what activates
      // those subscriptions.
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id
        if (!subscriptionId) break

        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const customerId = typeof session.customer === 'string'
          ? session.customer
          : (session.customer as Stripe.Customer)?.id

        // client_reference_id is how Checkout carries the Firebase uid.
        if (session.client_reference_id && !subscription.metadata?.firebaseUid) {
          subscription.metadata = { ...subscription.metadata, firebaseUid: session.client_reference_id }
        }
        await activateFromSubscription(adminDb, subscription, customerId)
        break
      }

      // The one event that covers BOTH the first payment
      // (billing_reason: 'subscription_create') and every renewal
      // ('subscription_cycle'). Previously only renewals were handled, which
      // left the initial upgrade entirely dependent on the browser.
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = getInvoiceSubscriptionId(invoice)
        if (!subscriptionId) break

        const reason = invoice.billing_reason
        if (reason !== 'subscription_create' && reason !== 'subscription_cycle' && reason !== 'subscription_update') {
          break
        }

        const customerId = typeof invoice.customer === 'string'
          ? invoice.customer
          : (invoice.customer as Stripe.Customer)?.id
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        await activateFromSubscription(adminDb, subscription, customerId)
        break
      }

      // A renewal failed. Stripe will retry, so we record the state and keep
      // access until the period actually ends rather than cutting it off
      // mid-cycle — but the account is now visibly past due.
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = getInvoiceSubscriptionId(invoice)
        const customerId = typeof invoice.customer === 'string'
          ? invoice.customer
          : (invoice.customer as Stripe.Customer)?.id

        const subscription = subscriptionId
          ? await stripe.subscriptions.retrieve(subscriptionId)
          : null
        const userRef = await findUserRef(adminDb, subscription, customerId)
        if (userRef) {
          await userRef.set({ subscriptionStatus: subscription?.status ?? 'past_due' }, { merge: true })
          console.log(`[webhook] ${userRef.id} payment failed → status ${subscription?.status ?? 'past_due'}`)
        }
        break
      }

      // Covers plan changes, and the `unpaid`/`incomplete_expired` end-states
      // Stripe moves a subscription into when retries are exhausted. Without
      // this, a permanently failed subscription kept paid access until the
      // stored expiry date passed.
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer?.id

        if (subscription.status === 'active' || subscription.status === 'trialing') {
          await activateFromSubscription(adminDb, subscription, customerId)
        } else if (['unpaid', 'incomplete_expired', 'canceled'].includes(subscription.status)) {
          await downgrade(adminDb, subscription, customerId, `status=${subscription.status}`)
        } else {
          const userRef = await findUserRef(adminDb, subscription, customerId)
          if (userRef) await userRef.set({ subscriptionStatus: subscription.status }, { merge: true })
        }
        break
      }

      // Fires at period end for a cancel-at-period-end, or immediately for a
      // hard cancel — which is exactly the "access until the end of your
      // billing period" promise on the pricing page.
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer?.id
        await downgrade(adminDb, subscription, customerId, 'subscription deleted')
        break
      }

      default:
        break
    }
  } catch (e) {
    console.error(`[webhook] Handler failed for ${event.type}:`, e)
    // Non-2xx tells Stripe to retry, which is what we want for a transient
    // Firestore or Stripe error.
    return res.status(500).json({ error: 'Webhook handler failed' })
  }

  return res.json({ received: true })
}
