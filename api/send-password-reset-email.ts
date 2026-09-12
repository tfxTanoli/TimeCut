import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendPasswordResetEmail, NoSuchAccountError } from './_lib/resend.js'
import { clientIp, consumeRateLimit, emailKey } from './_lib/rateLimit.js'

// ── Password reset ───────────────────────────────────────────────────────────
// Necessarily open to signed-out callers — someone who cannot log in is the
// only person who ever needs it. The same two protections as the verification
// route apply:
//
//  1. The mail only goes to the address in the request, and contains only a
//     link that resets *that* address. Rate limits bound the nuisance value.
//  2. An address with no account returns the same 200 as one with an account,
//     so this cannot be used to discover who has registered.
//
// A genuine delivery failure is NOT hidden, though: it returns 500 so the
// browser can tell the user to try again instead of showing a confirmation for
// an email that was never sent.

const EMAIL_PATTERN = /^[^\s@]{1,254}@[^\s@]{1,254}\.[^\s@]{2,}$/

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email, name } = req.body ?? {}
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email address is required' })
  }
  const to = email.trim()

  const byEmail = await consumeRateLimit(`reset:${emailKey(to)}`, { limit: 5, windowSeconds: 3_600 })
  if (!byEmail.allowed) {
    res.setHeader('Retry-After', String(byEmail.retryAfterSeconds))
    return res.status(429).json({
      code: 'RATE_LIMITED',
      error: 'Too many reset emails requested for this address. Please wait a little and try again.',
    })
  }

  const byIp = await consumeRateLimit(`reset-ip:${clientIp(req.headers)}`, { limit: 20, windowSeconds: 3_600 })
  if (!byIp.allowed) {
    res.setHeader('Retry-After', String(byIp.retryAfterSeconds))
    return res.status(429).json({ code: 'RATE_LIMITED', error: 'Too many requests. Please try again later.' })
  }

  try {
    await sendPasswordResetEmail(to, typeof name === 'string' ? name.slice(0, 100) : '')
    return res.json({ success: true })
  } catch (err) {
    if (err instanceof NoSuchAccountError) {
      // Nothing was sent, and the caller is told the same thing as a success.
      console.log(`[send-password-reset-email] No account for ${to}; reporting success`)
      return res.json({ success: true })
    }
    console.error('[send-password-reset-email] Error:', err)
    return res.status(500).json({ error: 'Could not send the reset email. Please try again.' })
  }
}
