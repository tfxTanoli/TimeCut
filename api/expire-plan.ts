import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminDb } from './_lib/stripe-admin.js'
import { verifyAuth } from './_lib/auth.js'

// Downgrades the *caller's own* account when their plan has lapsed. The uid
// comes from the verified ID token, so this can no longer be used to force a
// downgrade on someone else's account.
//
// This is a convenience path only — api/_lib/entitlements.ts also re-checks
// expiry on every metered request, so a lapsed plan cannot be used even if
// this endpoint is never called.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authed = await verifyAuth(req)
  if (!authed) {
    return res.status(401).json({ code: 'UNAUTHENTICATED', error: 'Not signed in' })
  }
  const uid = authed.uid

  const adminDb = getAdminDb()
  if (!adminDb) return res.status(500).json({ error: 'Database unavailable' })

  try {
    const snap = await adminDb.doc(`users/${uid}`).get()
    if (!snap.exists) return res.json({ expired: false })

    const data = snap.data()!
    const planExpiresAt = data.planExpiresAt?.toDate?.() as Date | undefined
    const plan = data.plan as string | undefined

    if (!planExpiresAt || !plan || plan === 'free') {
      return res.json({ expired: false })
    }

    if (planExpiresAt < new Date()) {
      await adminDb.doc(`users/${uid}`).update({
        plan: 'free',
        planStartDate: null,
        planExpiresAt: null,
      })
      console.log(`[expire-plan] ✓ uid=${uid} plan expired, downgraded to free`)
      return res.json({ expired: true })
    }

    return res.json({ expired: false })
  } catch (err) {
    console.error('[expire-plan] Error:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' })
  }
}
