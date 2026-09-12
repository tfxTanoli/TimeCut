import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from './_lib/auth.js'
import { resolveSubscriptionRequest } from './_lib/subscriptions.js'

// Thin wrapper. Every decision — duplicate guard, switch confirmation, price —
// lives in _lib/subscriptions.ts, which the local dev server calls too. Keeping
// the logic in one module is deliberate: it previously existed here and again
// inline in server/index.ts, and only this copy received the duplicate-
// subscription fix, so local runs still created a new subscription every call.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // The subscription is created for the signed-in caller, not for whatever uid
  // the request body claims.
  const authed = await verifyAuth(req)
  if (!authed) {
    return res.status(401).json({ code: 'UNAUTHENTICATED', error: 'Please sign in to subscribe.' })
  }

  const { plan, email, name, confirmSwitch } = req.body ?? {}

  try {
    const { status, body } = await resolveSubscriptionRequest({
      uid: authed.uid,
      plan,
      email,
      name,
      confirmSwitch: confirmSwitch === true,
    })
    return res.status(status).json(body)
  } catch (err) {
    console.error('[create-subscription] Error:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Subscription creation failed' })
  }
}
