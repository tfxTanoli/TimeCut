import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendWelcomeEmail } from './_lib/resend.js'
import { verifyAuth } from './_lib/auth.js'
import { clientIp, consumeRateLimit, emailKey } from './_lib/rateLimit.js'

// ── Welcome email ────────────────────────────────────────────────────────────
// This route used to accept any `email` in the body with no authentication at
// all, so anyone could send mail from our verified domain to any address they
// liked, with an attacker-controlled name rendered into the body. It is only
// ever called immediately after an account is created, at which point the
// browser is signed in — so it now requires a verified ID token and sends to
// the address on that token rather than to whatever the body asked for.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authed = await verifyAuth(req)
  if (!authed?.email) {
    return res.status(401).json({ code: 'UNAUTHENTICATED', error: 'Not signed in' })
  }

  // The recipient is the token's own address. A caller cannot redirect this
  // mail anywhere else, which is what makes the route useless as a relay.
  const to = authed.email
  const { name } = req.body ?? {}

  // One welcome per account per day. A welcome email is sent once in the
  // normal flow; anything beyond this is a retry loop or an attempt to use a
  // real account to spam its own owner.
  const limited = await consumeRateLimit(`welcome:${emailKey(to)}`, { limit: 3, windowSeconds: 86_400 })
  if (!limited.allowed) {
    return res.status(429).json({ code: 'RATE_LIMITED', error: 'Too many requests. Please try again later.' })
  }
  const byIp = await consumeRateLimit(`welcome-ip:${clientIp(req.headers)}`, { limit: 30, windowSeconds: 3_600 })
  if (!byIp.allowed) {
    return res.status(429).json({ code: 'RATE_LIMITED', error: 'Too many requests. Please try again later.' })
  }

  try {
    await sendWelcomeEmail(to, typeof name === 'string' ? name.slice(0, 100) : '')
    return res.json({ success: true })
  } catch (err) {
    console.error('[send-welcome-email] Error:', err)
    // Deliberately generic: the caller is a fire-and-forget browser call that
    // ignores the body, and a provider error message is not theirs to read.
    return res.status(500).json({ error: 'Failed to send welcome email' })
  }
}
