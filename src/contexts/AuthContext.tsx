import {
  createContext,
  useContext,
  useEffect,
  useState,
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
import { auth, googleProvider } from '../lib/firebase'
import {
  createUserDocument,
  updateLastLogin,
  logActivity,
  updateUserName,
  getUserData,
  type UserData,
} from '../lib/userService'

interface AuthContextValue {
  user: User | null
  userData: UserData | null
  displayName: string
  loading: boolean
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
  const [user, setUser]         = useState<User | null>(null)
  const [userData, setUserData] = useState<UserData | null>(null)
  const [loading, setLoading]   = useState(true)

  // Fetch Firestore profile as soon as auth state is known
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async firebaseUser => {
      setUser(firebaseUser)
      if (firebaseUser) {
        const data = await getUserData(firebaseUser.uid)
        setUserData(data)
      } else {
        setUserData(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  // Best available name: Firebase Auth displayName > Firestore name > ''
  const displayName = user?.displayName || userData?.name || ''

  async function login(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    await updateLastLogin(cred.user.uid)
    await logActivity(cred.user.uid, 'login', { provider: 'email' })
    const data = await getUserData(cred.user.uid)
    setUserData(data)
  }

  async function signup(email: string, password: string, name: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName: name })
    await createUserDocument(cred.user, name)
    await logActivity(cred.user.uid, 'signup', { provider: 'email' })
    const data = await getUserData(cred.user.uid)
    setUserData(data)
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
    const data = await getUserData(cred.user.uid)
    setUserData(data)
  }

  async function logout() {
    if (auth.currentUser) {
      await logActivity(auth.currentUser.uid, 'logout')
    }
    await signOut(auth)
    setUserData(null)
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
