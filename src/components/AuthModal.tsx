import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useAuthModal } from '../contexts/AuthModalContext'
import { useTranslation } from '../hooks/useTranslation'

export default function AuthModal() {
  const { mode, close } = useAuthModal()
  const { login, signup } = useAuth()
  const { t } = useTranslation()

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
    if (tab === 'signup') {
      if (!name.trim()) { setError('Please enter your full name.'); return }
      if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
      if (!/[A-Z]/.test(password)) { setError('Password must contain at least one uppercase letter.'); return }
      if (!/[0-9]/.test(password)) { setError('Password must contain at least one number.'); return }
    }
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
      setError(authErrorMessage(err.code, tab, t))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`auth-modal-backdrop ${closing ? 'auth-modal-backdrop--out' : ''}`}>
      <div
        className={`auth-modal-card ${closing ? 'auth-modal-card--out' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="auth-modal-glow" />

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
              {tab === 'login' ? t('auth.successLogin') : t('auth.successSignup')}
            </p>
            <p className="auth-modal-success-sub">{t('auth.takingYouIn')}</p>
          </div>
        ) : (
          <>
            <div className="auth-modal-heading">
              <h2 className="auth-modal-title">
                {tab === 'login' ? t('auth.welcomeBack') : t('auth.startProtecting')}
              </h2>
              <p className="auth-modal-sub">
                {tab === 'login' ? t('auth.signInSub') : t('auth.signUpSub')}
              </p>
            </div>

            <div className="auth-modal-tabs">
              <div className="auth-modal-tabs-track">
                <div className={`auth-modal-tab-pill ${tab === 'signup' ? 'auth-modal-tab-pill--right' : ''}`} />
                <button
                  className={`auth-modal-tab ${tab === 'login' ? 'auth-modal-tab--active' : ''}`}
                  onClick={() => handleTabSwitch('login')}
                  type="button"
                >
                  {t('auth.logIn')}
                </button>
                <button
                  className={`auth-modal-tab ${tab === 'signup' ? 'auth-modal-tab--active' : ''}`}
                  onClick={() => handleTabSwitch('signup')}
                  type="button"
                >
                  {t('auth.signUp')}
                </button>
              </div>
            </div>

            <div className={`auth-modal-body ${switching ? 'auth-modal-body--fade' : ''}`}>
              <form className="auth-modal-form" onSubmit={handleSubmit} noValidate>
                {tab === 'signup' && (
                  <div className="form-group">
                    <label className="form-label">{t('auth.fullName')}</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder={t('auth.namePlaceholder')}
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                      disabled={loading}
                      autoComplete="name"
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">{t('auth.emailAddress')}</label>
                  <input
                    className="form-input"
                    type="email"
                    placeholder={t('auth.emailPlaceholder')}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="email"
                  />
                </div>

                <div className="form-group">
                  <div className="form-label-row">
                    <label className="form-label">{t('auth.password')}</label>
                    {tab === 'login' && (
                      <button type="button" className="form-link" style={{ fontSize: 12 }}>
                        {t('auth.forgotPassword')}
                      </button>
                    )}
                  </div>
                  <input
                    className="form-input"
                    type="password"
                    placeholder={tab === 'signup' ? t('auth.passwordSignupPlaceholder') : t('auth.passwordPlaceholder')}
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
                    ? <><span className="btn-spinner" />{tab === 'login' ? t('auth.signingIn') : t('auth.creatingAccount')}</>
                    : tab === 'login' ? t('auth.signIn') : t('auth.createAccount')
                  }
                </button>
              </form>

              {tab === 'signup' && (
                <div className="auth-modal-trust">
                  <span className="auth-modal-trust-dot">•</span> {t('auth.trustLine').split(' · ')[0]}
                  <span className="auth-modal-trust-dot">•</span> {t('auth.trustLine').split(' · ')[1]}
                </div>
              )}

              <p className="auth-modal-switch">
                {tab === 'login' ? t('auth.noAccount') : t('auth.haveAccount')}{' '}
                <button
                  className="form-link"
                  type="button"
                  onClick={() => handleTabSwitch(tab === 'login' ? 'signup' : 'login')}
                >
                  {tab === 'login' ? t('auth.signUpFree') : t('auth.logIn')}
                </button>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function authErrorMessage(code: string, tab: 'login' | 'signup', t: (k: string) => string): string {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/invalid-credential':   return t('auth.errInvalidCredential')
    case 'auth/wrong-password':        return t('auth.errWrongPassword')
    case 'auth/email-already-in-use':  return t('auth.errEmailInUse')
    case 'auth/invalid-email':         return t('auth.errInvalidEmail')
    case 'auth/weak-password':         return t('auth.errWeakPassword')
    case 'auth/too-many-requests':     return t('auth.errTooManyRequests')
    case 'auth/popup-closed-by-user':  return t('auth.errPopupClosed')
    default: return tab === 'login' ? t('auth.errLoginFailed') : t('auth.errSignupFailed')
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
