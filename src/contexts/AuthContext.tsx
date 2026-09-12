import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  type User,
} from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db, googleProvider } from '../lib/firebase'
import {
  createUserDocument,
  logActivity,
  updateUserName,
  getCurrentMonthKey,
  type UserData,
  type PlanType,
  type CreditsUsage,
} from '../lib/userService'
import { getCachedPlanConfig, getPlanConfig, planFeatures, type PlanConfig, type PlanFeatures } from '../lib/planConfig'

interface AuthContextValue {
  user: User | null
  userData: UserData | null
  displayName: string
  loading: boolean
  plan: PlanType
  planExpiresAt: Date | null
  /** Which premium report sections the current plan unlocks. */
  features: PlanFeatures
  // AI Credits
  planConfig: PlanConfig
  creditsAllocated: number
  creditsRemaining: number
  creditsUsage: CreditsUsage
  freeReportsRemaining: number
  /** Total free reports this account is entitled to (base allowance + referral rewards). */
  freeReportsAllowed: number
  refreshUsage: () => void
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, name: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  updateDisplayName: (name: string) => Promise<void>
  changePassword: (newPassword: string) => Promise<void>
  reauthAndChangePassword: (currentPassword: string, newPassword: string) => Promise<void>
  resetPassword: (email: string) => Promise<void>
}

/**
 * Minimum password length, shared by the signup form and the profile page's
 * change-password form so the two never disagree. Firebase Auth's own floor is
 * 6; we ask for 8 and impose no character-class rules on top. Requiring an
 * uppercase letter and a digit was rejecting passwords that are perfectly
 * strong (a long passphrase) while adding a failure mode to every signup, so
 * length is the only rule now.
 */
export const MIN_PASSWORD_LENGTH = 8

/**
 * Ask the API to send the welcome email.
 *
 * The recipient is no longer in the request: the endpoint reads it from the
 * verified ID token and refuses the call without one. So this is only ever
 * useful while the browser is actually signed in — which it is at both call
 * sites, immediately after the account is created.
 *
 * Awaited rather than fired and forgotten, because the signup path signs out a
 * moment later and a pending request would lose its token. Failures are
 * swallowed: the account exists either way, and a missing welcome email must
 * never read back to the user as a failed signup.
 */
async function sendWelcomeEmail(name: string): Promise<void> {
  try {
    const token = await auth.currentUser?.getIdToken()
    if (!token) return
    await fetch('/api/send-welcome-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    })
  } catch (e) {
    console.warn('[welcome-email] send failed:', e)
  }
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]                   = useState<User | null>(null)
  const [userData, setUserData]           = useState<UserData | null>(null)
  const [loading, setLoading]             = useState(true)
  const [planExpiresAt, setPlanExpiresAt] = useState<Date | null>(null)
  const [planConfig, setPlanConfig]       = useState<PlanConfig>(getCachedPlanConfig())
  const [creditsUsage, setCreditsUsage]   = useState<CreditsUsage>({ used: 0, reportsUsed: 0, assistantUsed: 0, documentsUploaded: 0 })

  // Keep refs to active Firestore unsubscribers so we can clean up on sign-out
  const unsubUserRef    = useRef<(() => void) | null>(null)
  const unsubCreditsRef = useRef<(() => void) | null>(null)

  // Load live, admin-editable plan/credit config once.
  useEffect(() => { getPlanConfig().then(setPlanConfig).catch(() => {}) }, [])

  function detachListeners() {
    unsubUserRef.current?.()
    unsubUserRef.current = null
    unsubCreditsRef.current?.()
    unsubCreditsRef.current = null
  }

  function attachListeners(uid: string) {
    detachListeners()

    // Real-time user document (plan, totalAnalyses, etc.)
    unsubUserRef.current = onSnapshot(
      doc(db, 'users', uid),
      snap => {
        if (snap.exists()) {
          const data = snap.data() as UserData
          setUserData(data)
          const expiresAt = data.planExpiresAt?.toDate?.() ?? null
          setPlanExpiresAt(expiresAt)
          // Auto-downgrade only after a 48-hour grace period past the expiry date
          // to avoid false-positive downgrades due to webhook delays or clock skew
          const GRACE_MS = 48 * 60 * 60 * 1000
          if (expiresAt && (expiresAt.getTime() + GRACE_MS) < Date.now() && data.plan !== 'free') {
            // The endpoint reads the account from the ID token, so no uid is
            // sent. Server-side metering re-checks expiry on every request too,
            // so this is a housekeeping nudge rather than the enforcement point.
            auth.currentUser?.getIdToken()
              .then(token => fetch('/api/expire-plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              }))
              .catch(e => console.warn('[expire-plan] call failed:', e))
          }
        } else {
          setUserData(null)
          setPlanExpiresAt(null)
        }
        setLoading(false)
      },
      () => setLoading(false),
    )

    // Real-time AI Credits ledger for the current month. Read-only to the
    // client — every debit is written server-side after the plan is verified.
    const monthKey = getCurrentMonthKey()
    unsubCreditsRef.current = onSnapshot(
      doc(db, 'users', uid, 'credits', monthKey),
      snap => {
        const d = snap.exists() ? snap.data() : {}
        setCreditsUsage({
          used: d.used ?? 0,
          reportsUsed: d.reportsUsed ?? 0,
          assistantUsed: d.assistantUsed ?? 0,
          documentsUploaded: d.documentsUploaded ?? 0,
        })
      },
    )
  }

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, firebaseUser => {
      setUser(firebaseUser)
      if (firebaseUser) {
        attachListeners(firebaseUser.uid)
      } else {
        detachListeners()
        setUserData(null)
        setCreditsUsage({ used: 0, reportsUsed: 0, assistantUsed: 0, documentsUploaded: 0 })
        setPlanExpiresAt(null)
        setLoading(false)
      }
    })

    return () => {
      unsubAuth()
      detachListeners()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const displayName = user?.displayName || userData?.name || ''
  const plan: PlanType = (userData?.plan as PlanType) ?? 'free'
  const features = planFeatures(planConfig, plan)

  // ── AI Credits derived values ──
  // A per-account allocation (Business "Custom Credit Allocation") overrides
  // the plan default. The server applies the same rule when charging.
  const creditsOverride = (userData as { creditsOverride?: number } | null)?.creditsOverride
  const creditsAllocated = plan !== 'free' && typeof creditsOverride === 'number' && creditsOverride >= 0
    ? creditsOverride
    : planConfig.plans[plan]?.credits ?? 0
  const creditsRemaining = Math.max(0, creditsAllocated - creditsUsage.used)
  const baseFreeReports = planConfig.plans.free.freeReports ?? 1
  const freeReportsAllowed = baseFreeReports + ((userData as { freeReportsEarned?: number } | null)?.freeReportsEarned ?? 0)
  const freeReportsUsed = (userData as { freeReportsUsed?: number } | null)?.freeReportsUsed ?? 0
  const freeReportsRemaining = Math.max(0, freeReportsAllowed - freeReportsUsed)

  // No-op: onSnapshot keeps the credit ledger live automatically.
  function refreshUsage() {}

  async function login(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password)
    if (!cred.user.emailVerified) {
      await signOut(auth)
      throw Object.assign(new Error('Email not verified'), { code: 'auth/email-not-verified' })
    }
    // `createUserDocument` rather than `updateLastLogin`: it creates the
    // document when it is missing instead of throwing. An account whose
    // Firestore document never got written (a signup interrupted mid-flight)
    // used to fail every subsequent login here — the credentials were correct,
    // but the bare `updateDoc` threw `not-found` and the modal reported a login
    // failure. Now the first login after such a signup repairs the account.
    // Best-effort like the signup steps: the user is already signed in by this
    // point, so bookkeeping must never read back as a failed login.
    await Promise.allSettled([
      createUserDocument(cred.user),
      logActivity(cred.user.uid, 'login', { provider: 'email' }),
    ]).then(results => {
      results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .forEach(r => console.warn('[login] non-fatal post-login step failed:', r.reason))
    })
    // Snapshot listener attached by onAuthStateChanged above; no manual setUserData needed
  }

  /**
   * Create an account.
   *
   * Only `createUserWithEmailAndPassword` may fail the signup. Everything after
   * it — the display name, the Firestore user document, the activity log — is
   * best-effort, because by that point the Auth account already exists and
   * cannot be un-created from the client. Letting those steps throw was the
   * bug behind "Sign up failed. Please try again.": a transient Firestore
   * hiccup (slow mobile connection, or the auth token not yet propagated to the
   * Firestore channel) surfaced as a generic failure even though the account
   * had been created, and the retry then hit `auth/email-already-in-use` — a
   * dead end with no way forward for that address.
   *
   * The user document is recreated on the next successful login by
   * `createUserDocument`, so a miss here is self-healing rather than fatal.
   */
  async function signup(email: string, password: string, name: string) {
    const cleanEmail = email.trim()
    const cleanName = name.trim()
    const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password)

    await Promise.allSettled([
      updateProfile(cred.user, { displayName: cleanName }),
      createUserDocument(cred.user, cleanName),
      logActivity(cred.user.uid, 'signup', { provider: 'email' }),
    ]).then(results => {
      results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .forEach(r => console.warn('[signup] non-fatal post-create step failed:', r.reason))
    })

    // The verification mail is the one that has to work for a signed-out
    // caller too (the resend button on the verify screen), so it carries no
    // token. The welcome mail now requires one and sends to the address on it
    // — that is what stops the route being usable as an open relay — so it
    // must be sent *before* the sign-out below, while a token still exists.
    fetch('/api/send-verification-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, name: cleanName }),
    }).catch(e => console.warn('[verify-email] send failed:', e))

    await sendWelcomeEmail(cleanName)

    // Sign out immediately: user must verify email before accessing the app.
    // Best-effort too — the account exists either way, and a failure here must
    // not read back to the user as a failed signup.
    await signOut(auth).catch(e => console.warn('[signup] sign-out failed:', e))
  }

  async function loginWithGoogle() {
    const cred = await signInWithPopup(auth, googleProvider)
    const isNew = cred.user.metadata.creationTime === cred.user.metadata.lastSignInTime
    // Best-effort for the same reason as email login: the popup has already
    // signed the user in, so a Firestore hiccup must not report a failed login.
    // `createUserDocument` refreshes lastLoginAt on the existing-user path, so
    // no separate updateLastLogin call is needed.
    await Promise.allSettled([
      createUserDocument(cred.user),
      logActivity(cred.user.uid, isNew ? 'signup' : 'login', { provider: 'google' }),
    ]).then(results => {
      results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .forEach(r => console.warn('[google-login] non-fatal post-login step failed:', r.reason))
    })
    if (isNew) {
      await sendWelcomeEmail(cred.user.displayName ?? '')
    }
  }

  async function logout() {
    if (auth.currentUser) await logActivity(auth.currentUser.uid, 'logout')
    await signOut(auth)
    setUserData(null)
    setCreditsUsage({ used: 0, reportsUsed: 0, assistantUsed: 0, documentsUploaded: 0 })
    setPlanExpiresAt(null)
  }

  async function updateDisplayName(name: string) {
    if (!auth.currentUser) return
    await updateProfile(auth.currentUser, { displayName: name })
    await updateUserName(auth.currentUser.uid, name)
    await auth.currentUser.reload()
    setUser(auth.currentUser)
    setUserData(prev => prev ? { ...prev, name } : prev)
  }

  async function changePassword(newPassword: string) {
    if (!auth.currentUser) throw new Error('Not authenticated')
    await updatePassword(auth.currentUser, newPassword)
  }

  async function reauthAndChangePassword(currentPassword: string, newPassword: string) {
    if (!auth.currentUser?.email) throw new Error('Not authenticated')
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword)
    await reauthenticateWithCredential(auth.currentUser, credential)
    await updatePassword(auth.currentUser, newPassword)
  }


  /**
   * Send a password-reset link.
   *
   * This is the only route back into an account whose password has been
   * forgotten — the modal used to render a "Forgot password?" link with no
   * handler at all, so there was no recovery path anywhere in the product.
   *
   * `auth/user-not-found` is deliberately swallowed by the caller rather than
   * here: the modal reports the same "check your inbox" message either way, so
   * the form cannot be used to discover which addresses have accounts.
   */
  async function resetPassword(email: string) {
    const res = await fetch('/api/send-password-reset-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    })
    if (!res.ok) {
      // `fetch` resolves for a 4xx/5xx, so without this a failed send would
      // read back as a sent email. 429 is surfaced separately because "wait and
      // retry" is different advice from "try again now".
      const body = await res.json().catch(() => ({}))
      throw Object.assign(
        new Error(body.error ?? 'Password reset failed'),
        { code: res.status === 429 ? 'auth/too-many-requests' : 'reset/send-failed' },
      )
    }
  }

  return (
    <AuthContext.Provider value={{
      user, userData, displayName, loading,
      plan, planExpiresAt, features,
      planConfig, creditsAllocated, creditsRemaining, creditsUsage, freeReportsRemaining,
      freeReportsAllowed,
      refreshUsage,
      login, signup, loginWithGoogle, logout,
      updateDisplayName, changePassword, reauthAndChangePassword, resetPassword,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
