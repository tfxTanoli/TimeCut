import { createContext, useContext, useState, type ReactNode } from 'react'

type ModalMode = 'login' | 'signup' | null

interface AuthModalContextValue {
  mode: ModalMode
  openLogin: () => void
  openSignup: () => void
  close: () => void
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null)

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ModalMode>(null)

  return (
    <AuthModalContext.Provider value={{
      mode,
      openLogin:  () => setMode('login'),
      openSignup: () => setMode('signup'),
      close:      () => setMode(null),
    }}>
      {children}
    </AuthModalContext.Provider>
  )
}

export function useAuthModal() {
  const ctx = useContext(AuthModalContext)
  if (!ctx) throw new Error('useAuthModal must be used inside AuthModalProvider')
  return ctx
}
