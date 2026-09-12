import admin from 'firebase-admin'
import { getAdminDb } from './stripe-admin.js'

// ── Request rate limiting ────────────────────────────────────────────────────
// The mail routes are callable without a session by design — a verification
// resend and a sales enquiry both have to work for someone who is not signed
// in. That made them an open relay: an unauthenticated caller could send mail
// from our verified domain to any address, as fast as they could POST, which
// burns the Resend account and the domain's sending reputation.
//
// Counters live in Firestore rather than in module scope because serverless
// instances do not share memory: an in-process counter is reset by every cold
// start and is per-instance, so it limits nothing in practice.

/** Fixed-window counter. Coarser than a sliding window, and enough here. */
export interface RateLimitResult {
  allowed: boolean
  /** Seconds until the current window ends. Only meaningful when blocked. */
  retryAfterSeconds: number
}

const ALLOW: RateLimitResult = { allowed: true, retryAfterSeconds: 0 }

/**
 * Consume one unit against `key`.
 *
 * Fails **open**: if Firestore is unavailable the request is allowed through.
 * A limiter that takes the product down when its own storage hiccups is worse
 * than the abuse it prevents, and every caller here is also bounded by Resend's
 * own account limits.
 */
export async function consumeRateLimit(
  key: string,
  opts: { limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
  const adb = getAdminDb()
  if (!adb) return ALLOW

  const now = Date.now()
  const windowMs = opts.windowSeconds * 1000
  // Bucket boundary, so a window rolls over without needing a cleanup job.
  const windowStart = Math.floor(now / windowMs) * windowMs
  const ref = adb.doc(`rateLimits/${encodeURIComponent(key)}`)

  try {
    return await adb.runTransaction(async tx => {
      const snap = await tx.get(ref)
      const data = snap.exists ? (snap.data() ?? {}) : {}
      const storedStart: number = data.windowStart ?? 0
      const count: number = storedStart === windowStart ? (data.count ?? 0) : 0

      if (count >= opts.limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)),
        }
      }

      tx.set(ref, {
        windowStart,
        count: count + 1,
        // Purely so an operator can see what a counter belongs to, and so a
        // TTL policy can be pointed at this field later if these ever pile up.
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(windowStart + windowMs),
      })
      return ALLOW
    })
  } catch (e) {
    console.warn('[rateLimit] check failed, allowing request:', e)
    return ALLOW
  }
}

/**
 * Best-effort client IP.
 *
 * `x-forwarded-for` is attacker-controllable in general, but on Vercel the
 * platform rewrites it, so the left-most entry is the real client. It is still
 * only one of the two keys every caller is limited on — the other is the email
 * address, which cannot be spoofed into unlimited sends because it is also the
 * address the mail goes to.
 */
export function clientIp(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers['x-forwarded-for'] ?? headers['x-real-ip']
  const value = Array.isArray(raw) ? raw[0] : raw
  const first = value?.split(',')[0]?.trim()
  return first && first.length <= 64 ? first : 'unknown'
}

/** Normalised key part for an email address. */
export function emailKey(email: string): string {
  return email.trim().toLowerCase().slice(0, 120).replace(/[/#[\]]/g, '_')
}
