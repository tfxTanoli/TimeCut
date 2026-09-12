import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendContactEmail } from './_lib/resend.js'
import { clientIp, consumeRateLimit, emailKey } from './_lib/rateLimit.js'

// ── Contact form ─────────────────────────────────────────────────────────────
// Open to signed-out visitors on purpose: "Contact Sales" on the Business plan
// is aimed at prospects who have no account yet, so requiring one would close
// the only path they have. What it is not allowed to be is an unmetered pipe
// into the support inbox, so every submission is bounded by address and by
// caller, and the fields are capped before they reach the mail template (which
// escapes them — see _lib/resend.ts).

const MAX_MESSAGE_LENGTH = 4_000
const MAX_FIELD_LENGTH = 200
const EMAIL_PATTERN = /^[^\s@]{1,254}@[^\s@]{1,254}\.[^\s@]{2,}$/

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { name, email, subject, message } = req.body ?? {}

  if (typeof name !== 'string' || !name.trim()
    || typeof message !== 'string' || !message.trim()
    || typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    return res.status(400).json({ error: 'Please provide your name, a valid email address and a message.' })
  }

  const cleanEmail = email.trim()

  // A person sending a handful of enquiries an hour is normal; a script is not.
  const byEmail = await consumeRateLimit(`contact:${emailKey(cleanEmail)}`, { limit: 5, windowSeconds: 3_600 })
  if (!byEmail.allowed) {
    res.setHeader('Retry-After', String(byEmail.retryAfterSeconds))
    return res.status(429).json({
      code: 'RATE_LIMITED',
      error: 'You have sent several messages already. Please wait a little before sending another.',
    })
  }
  const byIp = await consumeRateLimit(`contact-ip:${clientIp(req.headers)}`, { limit: 15, windowSeconds: 3_600 })
  if (!byIp.allowed) {
    res.setHeader('Retry-After', String(byIp.retryAfterSeconds))
    return res.status(429).json({ code: 'RATE_LIMITED', error: 'Too many requests. Please try again later.' })
  }

  try {
    await sendContactEmail(
      name.trim().slice(0, MAX_FIELD_LENGTH),
      cleanEmail,
      (typeof subject === 'string' ? subject : '').slice(0, MAX_FIELD_LENGTH),
      message.trim().slice(0, MAX_MESSAGE_LENGTH),
    )
    return res.json({ success: true })
  } catch (err) {
    console.error('[send-contact-email] Error:', err)
    return res.status(500).json({ error: 'Failed to send your message. Please email support@timecut.online directly.' })
  }
}
