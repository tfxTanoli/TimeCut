import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useAuthModal } from '../contexts/AuthModalContext'

export default function AuthModal() {
  const { mode, close } = useAuthModal()
  const { login, signup } = useAuth()

  const [tab, setTab]         = useState<'login' | 'signup'>('login')
  const [closing, setClosing] = useState(false)
  const [switching, setSwitching] = useState(false)

  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState(false)

  useEffect(() => {
    if (mode) {
      setTab(mode)
      setError(null)
      setSuccess(false)
      setName(''); setEmail(''); setPassword('')
    }
  }, [mode])

  useEffect(() => {
    document.body.style.overflow = mode ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mode])

  if (!mode && !closing) return null

  function handleClose() {
    setClosing(true)
    setTimeout(() => { setClosing(false); close() }, 280)
  }

  function handleTabSwitch(next: 'login' | 'signup') {
    if (next === tab || loading) return
    setSwitching(true)
    setTimeout(() => { setTab(next); setError(null); setSwitching(false) }, 170)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (tab === 'login') {
        await login(email, password)
      } else {
        await signup(email, password, name)
      }
      setSuccess(true)
      setTimeout(handleClose, 900)
    } catch (err: any) {
      setError(authErrorMessage(err.code, tab))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={`auth-modal-backdrop ${closing ? 'auth-modal-backdrop--out' : ''}`}
    >
      <div
        className={`auth-modal-card ${closing ? 'auth-modal-card--out' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Decorative glow */}
        <div className="auth-modal-glow" />

        {/* Header */}
        <div className="auth-modal-header">
          <span className="auth-modal-logo">⏱ TIMECUT</span>
          <button className="auth-modal-close" onClick={handleClose} aria-label="Close">
            <IconX />
          </button>
        </div>

        {success ? (
          <div className="auth-modal-success">
            <div className="auth-modal-success-ring">
              <IconCheck />
            </div>
            <p className="auth-modal-success-title">
              {tab === 'login' ? 'Welcome back!' : 'Account created!'}
            </p>
            <p className="auth-modal-success-sub">Taking you in…</p>
          </div>
        ) : (
          <>
            {/* Heading */}
            <div className="auth-modal-heading">
              <h2 className="auth-modal-title">
                {tab === 'login' ? 'Welcome back' : 'Start protecting your time'}
              </h2>
              <p className="auth-modal-sub">
                {tab === 'login'
                  ? 'Sign in to your TimeCut account.'
                  : 'Free forever. No credit card required.'}
              </p>
            </div>

            {/* Tab switcher */}
            <div className="auth-modal-tabs">
              <div className="auth-modal-tabs-track">
                <div className={`auth-modal-tab-pill ${tab === 'signup' ? 'auth-modal-tab-pill--right' : ''}`} />
                <button
                  className={`auth-modal-tab ${tab === 'login' ? 'auth-modal-tab--active' : ''}`}
                  onClick={() => handleTabSwitch('login')}
                  type="button"
                >
                  Log in
                </button>
                <button
                  className={`auth-modal-tab ${tab === 'signup' ? 'auth-modal-tab--active' : ''}`}
                  onClick={() => handleTabSwitch('signup')}
                  type="button"
                >
                  Sign up
                </button>
              </div>
            </div>

            {/* Form */}
            <div className={`auth-modal-body ${switching ? 'auth-modal-body--fade' : ''}`}>
              <form className="auth-modal-form" onSubmit={handleSubmit} noValidate>
                {tab === 'signup' && (
                  <div className="form-group">
                    <label className="form-label">Full name</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="Your name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                      disabled={loading}
                      autoComplete="name"
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Email address</label>
                  <input
                    className="form-input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="email"
                  />
                </div>

                <div className="form-group">
                  <div className="form-label-row">
                    <label className="form-label">Password</label>
                    {tab === 'login' && (
                      <button type="button" className="form-link" style={{ fontSize: 12 }}>
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    className="form-input"
                    type="password"
                    placeholder={tab === 'signup' ? 'Min 6 characters' : '••••••••'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={tab === 'signup' ? 6 : undefined}
                    disabled={loading}
                    autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                  />
                </div>

                {error && (
                  <p className="error-banner" style={{ margin: 0 }}>{error}</p>
                )}

                <button
                  type="submit"
                  className="btn-primary btn-cta btn-full auth-modal-submit"
                  disabled={loading}
                >
                  {loading
                    ? <><span className="btn-spinner" />{tab === 'login' ? 'Signing in…' : 'Creating account…'}</>
                    : tab === 'login' ? 'Sign In' : 'Create Free Account'
                  }
                </button>
              </form>

              {tab === 'signup' && (
                <div className="auth-modal-trust">
                  <span className="auth-modal-trust-dot">•</span> Your content is never stored
                  <span className="auth-modal-trust-dot">•</span> Cancel anytime
                </div>
              )}

              <p className="auth-modal-switch">
                {tab === 'login' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  className="form-link"
                  type="button"
                  onClick={() => handleTabSwitch(tab === 'login' ? 'signup' : 'login')}
                >
                  {tab === 'login' ? 'Sign up free' : 'Log in'}
                </button>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function authErrorMessage(code: string, tab: 'login' | 'signup'): string {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/invalid-credential':   return 'Invalid email or password.'
    case 'auth/wrong-password':        return 'Incorrect password. Please try again.'
    case 'auth/email-already-in-use':  return 'An account with this email already exists.'
    case 'auth/invalid-email':         return 'Please enter a valid email address.'
    case 'auth/weak-password':         return 'Password must be at least 6 characters.'
    case 'auth/too-many-requests':     return 'Too many attempts. Try again later.'
    case 'auth/popup-closed-by-user':  return 'Sign-in popup was closed.'
    default: return `${tab === 'login' ? 'Sign in' : 'Sign up'} failed. Please try again.`
  }
}


function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}
