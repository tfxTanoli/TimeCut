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
  PLAN_LIMITS,
} from '../lib/userService'

interface AuthContextValue {
  user: User | null
  userData: UserData | null
  displayName: string
  loading: boolean
  plan: PlanType
  planLimit: number
  monthlyUsage: number
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
  const [user, setUser]                 = useState<User | null>(null)
  const [userData, setUserData]         = useState<UserData | null>(null)
  const [loading, setLoading]           = useState(true)
  const [monthlyUsage, setMonthlyUsage] = useState(0)

  // Keep refs to active Firestore unsubscribers so we can clean up on sign-out
  const unsubUserRef  = useRef<(() => void) | null>(null)
  const unsubUsageRef = useRef<(() => void) | null>(null)

  function detachListeners() {
    unsubUserRef.current?.()
    unsubUserRef.current = null
    unsubUsageRef.current?.()
    unsubUsageRef.current = null
  }

  function attachListeners(uid: string) {
    detachListeners()

    // Real-time user document (plan, totalAnalyses, etc.)
    unsubUserRef.current = onSnapshot(
      doc(db, 'users', uid),
      snap => {
        setUserData(snap.exists() ? (snap.data() as UserData) : null)
        setLoading(false)
      },
      () => setLoading(false),
    )

    // Real-time monthly usage counter for the current month
    const monthKey = getCurrentMonthKey()
    unsubUsageRef.current = onSnapshot(
      doc(db, 'users', uid, 'usage', monthKey),
      snap => setMonthlyUsage(snap.exists() ? (snap.data().count as number) : 0),
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
        setMonthlyUsage(0)
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
  const planLimit = PLAN_LIMITS[plan]

  // No-op — onSnapshot keeps monthlyUsage live automatically
  function refreshUsage() {}

  async function login(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    await updateLastLogin(cred.user.uid)
    await logActivity(cred.user.uid, 'login', { provider: 'email' })
    // Snapshot listener attached by onAuthStateChanged above; no manual setUserData needed
  }

  async function signup(email: string, password: string, name: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName: name })
    await createUserDocument(cred.user, name)
    await logActivity(cred.user.uid, 'signup', { provider: 'email' })
    fetch('/api/send-verification-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name }),
    }).catch(e => console.warn('[verify-email] send failed:', e))
  }

  async function loginWithGoogle() {
    const cred = await signInWithPopup(auth, googleProvider)
    const isNew = cred.user.metadata.creationTime === cred.user.metadata.lastSignInTime
    await createUserDocument(cred.user)
    if (isNew) {
      await logActivity(cred.user.uid, 'signup', { provider: 'google' })
    } else {
      await updateLastLogin(cred.user.uid)
      await logActivity(cred.user.uid, 'login', { provider: 'google' })
    }
  }

  async function logout() {
    if (auth.currentUser) await logActivity(auth.currentUser.uid, 'logout')
    await signOut(auth)
    setUserData(null)
    setMonthlyUsage(0)
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
      plan, planLimit, monthlyUsage, refreshUsage,
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
