import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { stripe, STRIPE_PLAN_MAP, getAdminDb } from './_lib/stripe-admin.js'

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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const uid = session.client_reference_id
    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id

    if (uid && adminDb && subscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const productId = subscription.items.data[0]?.price.product as string
        const product = await stripe.products.retrieve(productId)
        const planKey = STRIPE_PLAN_MAP[product.name.toLowerCase().replace(/\s+/g, '')]
          ?? (product.metadata?.plan as string | undefined)
        if (planKey) {
          await adminDb.doc(`users/${uid}`).update({
            plan: planKey,
            stripeCustomerId: session.customer,
            stripeSubscriptionId: subscriptionId,
          })
          console.log(`[webhook] Updated user ${uid} to plan: ${planKey}`)
        }
      } catch (e) {
        console.error('[webhook] Firestore update failed:', e)
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id
    if (customerId && adminDb) {
      try {
        const users = await adminDb.collection('users')
          .where('stripeCustomerId', '==', customerId).limit(1).get()
        if (!users.empty) {
          await users.docs[0].ref.update({ plan: 'free' })
          console.log(`[webhook] Downgraded customer ${customerId} to free`)
        }
      } catch (e) {
        console.error('[webhook] Subscription cancel update failed:', e)
      }
    }
  }

  return res.json({ received: true })
}
