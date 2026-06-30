import { doc, getDoc, setDoc, arrayUnion } from 'firebase/firestore'
import { db } from './firebase'

// ── Admin allowlist ──────────────────────────────────────────────────────────
// An email is an admin if it appears in either:
//   1. VITE_ADMIN_EMAILS env var (comma-separated), or
//   2. the Firestore doc config/admins  ->  { emails: string[] }
// The Firestore source lets the client add admins without a redeploy; the env
// var guarantees there is always at least one bootstrap admin.

export function envAdminEmails(): string[] {
  const raw = import.meta.env.VITE_ADMIN_EMAILS as string | undefined
  return (raw ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
}

let cachedRemote: string[] | null = null

async function remoteAdminEmails(): Promise<string[]> {
  if (cachedRemote) return cachedRemote
  try {
    const snap = await getDoc(doc(db, 'config', 'admins'))
    const emails = (snap.exists() ? (snap.data().emails as string[]) : []) ?? []
    cachedRemote = emails.map(e => e.toLowerCase())
    return cachedRemote
  } catch {
    return []
  }
}

export async function isAdminEmail(email: string | null | undefined): Promise<boolean> {
  if (!email) return false
  const lower = email.toLowerCase()
  if (envAdminEmails().includes(lower)) return true
  return (await remoteAdminEmails()).includes(lower)
}

/**
 * Bring the Firestore `config/admins` allowlist in sync with the env allowlist.
 * The security rules trust ONLY config/admins, so an env-configured admin must
 * be written there before they can read feedback or save config. The bootstrap
 * rule permits this write when no admins doc exists yet OR by an existing admin,
 * and requires the writer to keep their own email in the list.
 *
 * Returns true if the current user is now present in config/admins.
 */
export async function ensureAdminDoc(email: string | null | undefined): Promise<boolean> {
  if (!email) return false
  const lower = email.toLowerCase()
  const desired = Array.from(new Set([...envAdminEmails(), lower]))
  try {
    await setDoc(doc(db, 'config', 'admins'), { emails: arrayUnion(...desired) }, { merge: true })
    cachedRemote = null // force re-read next time
    return true
  } catch (e) {
    console.warn('[admin] could not sync config/admins:', e)
    return false
  }
}
