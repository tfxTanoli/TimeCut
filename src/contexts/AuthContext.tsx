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
  updateLastLogin,
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
  refreshUsage: () => void
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, name: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  updateDisplayName: (name: string) => Promise<void>
  changePassword: (newPassword: string) => Promise<void>
  reauthAndChangePassword: (currentPassword: string, newPassword: string) => Promise<void>
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
    const cred = await signInWithEmailAndPassword(auth, email, password)
    if (!cred.user.emailVerified) {
      await signOut(auth)
      throw Object.assign(new Error('Email not verified'), { code: 'auth/email-not-verified' })
    }
    await updateLastLogin(cred.user.uid)
    await logActivity(cred.user.uid, 'login', { provider: 'email' })
    // Snapshot listener attached by onAuthStateChanged above; no manual setUserData needed
  }

  async function signup(email: string, password: string, name: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName: name })
    await createUserDocument(cred.user, name)
    await logActivity(cred.user.uid, 'signup', { provider: 'email' })
    const emailPayload = JSON.stringify({ email, name })
    fetch('/api/send-verification-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: emailPayload,
    }).catch(e => console.warn('[verify-email] send failed:', e))
    fetch('/api/send-welcome-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: emailPayload,
    }).catch(e => console.warn('[welcome-email] send failed:', e))
    // Sign out immediately:user must verify email before accessing the app
    await signOut(auth)
  }

  async function loginWithGoogle() {
    const cred = await signInWithPopup(auth, googleProvider)
    const isNew = cred.user.metadata.creationTime === cred.user.metadata.lastSignInTime
    await createUserDocument(cred.user)
    if (isNew) {
      await logActivity(cred.user.uid, 'signup', { provider: 'google' })
      fetch('/api/send-welcome-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cred.user.email, name: cred.user.displayName ?? '' }),
      }).catch(e => console.warn('[welcome-email] send failed:', e))
    } else {
      await updateLastLogin(cred.user.uid)
      await logActivity(cred.user.uid, 'login', { provider: 'google' })
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

  return (
    <AuthContext.Provider value={{
      user, userData, displayName, loading,
      plan, planExpiresAt, features,
      planConfig, creditsAllocated, creditsRemaining, creditsUsage, freeReportsRemaining,
      refreshUsage,
      login, signup, loginWithGoogle, logout,
      updateDisplayName, changePassword, reauthAndChangePassword,
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
