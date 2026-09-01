import type { IncomingHttpHeaders } from 'node:http'
import admin from 'firebase-admin'
import { getAdminDb } from './stripe-admin.js'

// ── Request authentication ───────────────────────────────────────────────────
// Every route that spends money (OpenAI calls) or changes a user's plan must
// know *which* user is calling and must not take their word for it. The client
// sends a Firebase ID token as `Authorization: Bearer <token>`; we verify it
// with the Admin SDK and use the uid from the verified token — never a uid
// supplied in the request body.

export interface AuthedUser {
  uid: string
  email?: string
}

/**
 * Anything with request headers. Typed structurally so the same verifier works
 * for Vercel handlers and the Express dev server — only `headers` is read.
 */
export interface AuthableRequest {
  headers: IncomingHttpHeaders
}

/**
 * Verify the caller's Firebase ID token. Returns null when the header is
 * missing, malformed, expired, or the Admin SDK is unavailable.
 */
export async function verifyAuth(req: AuthableRequest): Promise<AuthedUser | null> {
  // getAdminDb() performs the one-time initializeApp() that admin.auth() needs.
  if (!getAdminDb()) return null

  const header = req.headers.authorization
  const raw = Array.isArray(header) ? header[0] : header
  if (!raw || !raw.startsWith('Bearer ')) return null

  const token = raw.slice(7).trim()
  if (!token) return null

  try {
    const decoded = await admin.auth().verifyIdToken(token)
    return { uid: decoded.uid, email: decoded.email }
  } catch (e) {
    console.warn('[auth] ID token verification failed:', e instanceof Error ? e.message : e)
    return null
  }
}

/** Error carrying the HTTP status and a machine-readable code for the client. */
export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}
