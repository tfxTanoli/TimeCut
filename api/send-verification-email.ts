import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendVerificationEmail, NoSuchAccountError } from './_lib/resend.js'
import { clientIp, consumeRateLimit, emailKey } from './_lib/rateLimit.js'

// ── Verification email ───────────────────────────────────────────────────────
// The one mail route that genuinely cannot require a session: an account that
// has not verified its address is signed straight back out, so the "resend"
// button on the verify screen is always pressed by a signed-out visitor.
//
// Two things make it safe to leave open:
//
//  1. The mail only ever goes to the address in the request, and its only
//     content is a link that verifies *that* address. There is nothing an
//     attacker gains by sending it to someone, beyond nuisance — which is what
//     the rate limits below bound.
//
//  2. Every outcome returns 200. It used to return 500 when Firebase had no
//     such user, which made the endpoint a free oracle for testing whether an
//     address had an account here.

const EMAIL_PATTERN = /^[^\s@]{1,254}@[^\s@]{1,254}\.[^\s@]{2,}$/

/** What the caller is told regardless of what actually happened. */
const ACCEPTED = { success: true } as const

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email, name } = req.body ?? {}
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    // A malformed address is the caller's own bug, not an enumeration signal.
    return res.status(400).json({ error: 'A valid email address is required' })
  }
  const to = email.trim()

  // Per address: enough for a genuine "I didn't get it, send it again", far
  // short of a mailbox flood.
  const byEmail = await consumeRateLimit(`verify:${emailKey(to)}`, { limit: 5, windowSeconds: 3_600 })
  if (!byEmail.allowed) {
    res.setHeader('Retry-After', String(byEmail.retryAfterSeconds))
    return res.status(429).json({
      code: 'RATE_LIMITED',
      error: 'Too many verification emails requested for this address. Please wait a little and try again.',
    })
  }

  // Per caller: what actually stops the address list being walked.
  const byIp = await consumeRateLimit(`verify-ip:${clientIp(req.headers)}`, { limit: 20, windowSeconds: 3_600 })
  if (!byIp.allowed) {
    res.setHeader('Retry-After', String(byIp.retryAfterSeconds))
    return res.status(429).json({
      code: 'RATE_LIMITED',
      error: 'Too many requests. Please try again later.',
    })
  }

  try {
    await sendVerificationEmail(to, typeof name === 'string' ? name.slice(0, 100) : '')
    return res.json(ACCEPTED)
  } catch (err) {
    // Two very different failures, which must not be collapsed into one answer.
    //
    // "No account for that address" is reported as success on purpose: saying
    // otherwise is exactly the enumeration leak this route used to have, and
    // there is nothing the caller could usefully do with the distinction.
    if (err instanceof NoSuchAccountError) {
      console.log(`[send-verification-email] No account for ${to}; reporting success`)
      return res.json(ACCEPTED)
    }
    // A real delivery failure is reported honestly. Swallowing it showed
    // "Email resent!" to someone who was never going to receive anything.
    console.error('[send-verification-email] Error:', err)
    return res.status(500).json({ error: 'Could not send the verification email. Please try again.' })
  }
}
