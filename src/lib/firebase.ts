import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()

/**
 * Fresh Firebase ID token for the signed-in user, or null when signed out.
 * Every call to a metered or billing API must carry this — the server derives
 * the account from the token and ignores any uid sent in the request body.
 */
export async function getIdToken(): Promise<string | null> {
  const current = auth.currentUser
  if (!current) return null
  try {
    return await current.getIdToken()
  } catch (e) {
    console.warn('[auth] could not get ID token:', e)
    return null
  }
}

/** Authorization header for an authenticated fetch, or {} when signed out. */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getIdToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
