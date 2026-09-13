import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'
import { getAdminDb } from './_lib/stripe-admin.js'
import {
  sendContactEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  NoSuchAccountError,
} from './_lib/resend.js'
import { verifyAuth } from './_lib/auth.js'
import { clientIp, consumeRateLimit, emailKey } from './_lib/rateLimit.js'

// ── All outbound mail, in one function ───────────────────────────────────────
// This used to be four separate files — one per endpoint — which is how the
// project ended up with 13 serverless functions and hit Vercel's 12-function
// cap on the Hobby plan, failing every deploy at "Deploying outputs..." with
// no code-level error to point at.
//
// The four still exist as URLs: vercel.json rewrites each of
//   /api/send-contact-email, /api/send-verification-email,
//   /api/send-welcome-email, /api/send-password-reset-email
// onto /api/send-email?type=<name>, so nothing in the client changed and every
// behaviour below — rate limits, auth requirements, response shapes, status
// codes — is copied verbatim from the file it replaces. server/index.ts (local
// dev) keeps its own four Express routes calling the same _lib functions,
// since Express has no function-count limit to work around.

const EMAIL_PATTERN = /^[^\s@]{1,254}@[^\s@]{1,254}\.[^\s@]{2,}$/
const MAX_MESSAGE_LENGTH = 4_000
const MAX_FIELD_LENGTH = 200

type MailType = 'contact' | 'verification' | 'welcome' | 'reset'

function isMailType(v: unknown): v is MailType {
  return v === 'contact' || v === 'verification' || v === 'welcome' || v === 'reset'
}

/** Was api/send-contact-email.ts. Open to signed-out senders on purpose — see
 *  that file's former comment: Contact Sales is the one path a prospect
 *  without an account has. */
async function handleContact(req: VercelRequest, res: VercelResponse) {
  const { name, email, subject, message } = req.body ?? {}

  if (typeof name !== 'string' || !name.trim()
    || typeof message !== 'string' || !message.trim()
    || typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    return res.status(400).json({ error: 'Please provide your name, a valid email address and a message.' })
  }

  const cleanEmail = email.trim()

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

  const record = {
    name: name.trim().slice(0, MAX_FIELD_LENGTH),
    email: cleanEmail.slice(0, MAX_FIELD_LENGTH),
    subject: (typeof subject === 'string' ? subject : '').slice(0, MAX_FIELD_LENGTH),
    message: message.trim().slice(0, MAX_MESSAGE_LENGTH),
  }
  const plan = typeof req.body?.plan === 'string' ? req.body.plan.slice(0, 40) : null
  // Signing in is not required to send a message; the uid is recorded only
  // when a verified session happens to be present.
  const authed = await verifyAuth(req)

  // The Firestore copy used to be written by the browser, which meant the
  // collection had to accept unauthenticated creates — so anyone could script
  // unlimited documents into it, bypassing the rate limits above entirely.
  // The copy is written here now, behind those limits, and the rules refuse
  // client writes. Either delivery path succeeding is enough: the stored copy
  // is what the admin dashboard reads if the mail bounces.
  let stored = false
  const adb = getAdminDb()
  if (adb) {
    try {
      await adb.collection('contacts').add({
        ...record,
        ...(plan ? { plan } : {}),
        ...(authed ? { uid: authed.uid } : {}),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      stored = true
    } catch (err) {
      console.error('[send-email:contact] Firestore copy failed:', err)
    }
  }

  let emailed = false
  try {
    await sendContactEmail(record.name, record.email, record.subject, record.message)
    emailed = true
  } catch (err) {
    console.error('[send-email:contact] Error:', err)
  }

  if (stored || emailed) return res.json({ success: true })
  return res.status(500).json({ error: 'Failed to send your message. Please email support@timecut.online directly.' })
}

/** Was api/send-verification-email.ts. Necessarily open to signed-out callers
 *  — the resend button lives on a screen that signs you back out. Every
 *  outcome returns 200 so the route cannot be used to test which addresses
 *  are registered; a genuine delivery failure is the one exception. */
async function handleVerification(req: VercelRequest, res: VercelResponse) {
  const { email, name } = req.body ?? {}
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email address is required' })
  }
  const to = email.trim()

  const byEmail = await consumeRateLimit(`verify:${emailKey(to)}`, { limit: 5, windowSeconds: 3_600 })
  if (!byEmail.allowed) {
    res.setHeader('Retry-After', String(byEmail.retryAfterSeconds))
    return res.status(429).json({
      code: 'RATE_LIMITED',
      error: 'Too many verification emails requested for this address. Please wait a little and try again.',
    })
  }
  const byIp = await consumeRateLimit(`verify-ip:${clientIp(req.headers)}`, { limit: 20, windowSeconds: 3_600 })
  if (!byIp.allowed) {
    res.setHeader('Retry-After', String(byIp.retryAfterSeconds))
    return res.status(429).json({ code: 'RATE_LIMITED', error: 'Too many requests. Please try again later.' })
  }

  try {
    await sendVerificationEmail(to, typeof name === 'string' ? name.slice(0, 100) : '')
    return res.json({ success: true })
  } catch (err) {
    if (err instanceof NoSuchAccountError) {
      console.log(`[send-email:verification] No account for ${to}; reporting success`)
      return res.json({ success: true })
    }
    console.error('[send-email:verification] Error:', err)
    return res.status(500).json({ error: 'Could not send the verification email. Please try again.' })
  }
}

/** Was api/send-welcome-email.ts. Requires a verified token and sends only to
 *  that token's own address — a caller cannot redirect this mail anywhere
 *  else, which is what stops the route being usable as a relay. */
async function handleWelcome(req: VercelRequest, res: VercelResponse) {
  const authed = await verifyAuth(req)
  if (!authed?.email) {
    return res.status(401).json({ code: 'UNAUTHENTICATED', error: 'Not signed in' })
  }

  const to = authed.email
  const { name } = req.body ?? {}

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
    console.error('[send-email:welcome] Error:', err)
    return res.status(500).json({ error: 'Failed to send welcome email' })
  }
}

/** Was api/send-password-reset-email.ts. Necessarily open — the one person who
 *  needs this is someone who cannot log in. Enumeration-safe like
 *  verification, except a genuine delivery failure is reported honestly
 *  rather than shown as a fake "email sent". */
async function handleReset(req: VercelRequest, res: VercelResponse) {
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
      console.log(`[send-email:reset] No account for ${to}; reporting success`)
      return res.json({ success: true })
    }
    console.error('[send-email:reset] Error:', err)
    return res.status(500).json({ error: 'Could not send the reset email. Please try again.' })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const type = req.query.type
  if (!isMailType(type)) {
    // Only reachable by calling this URL directly with a bad or missing
    // `type` — every real caller goes through the vercel.json rewrite, which
    // always sets one.
    return res.status(400).json({ error: 'Unknown mail type' })
  }

  switch (type) {
    case 'contact': return handleContact(req, res)
    case 'verification': return handleVerification(req, res)
    case 'welcome': return handleWelcome(req, res)
    case 'reset': return handleReset(req, res)
  }
}
