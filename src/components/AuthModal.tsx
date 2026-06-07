import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useAuthModal } from '../contexts/AuthModalContext'
import { useTranslation } from '../hooks/useTranslation'

export default function AuthModal() {
  const { mode, close } = useAuthModal()
  const { login, signup, loginWithGoogle } = useAuth()
  const { t } = useTranslation()

  const [tab, setTab]         = useState<'login' | 'signup'>('login')
  const [closing, setClosing] = useState(false)
  const [switching, setSwitching] = useState(false)

  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [loading, setLoading]     = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [success, setSuccess]       = useState(false)
  const [verifyScreen, setVerifyScreen] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSent, setResendSent]   = useState(false)
  const [signupEmail, setSignupEmail] = useState('')

  useEffect(() => {
    if (mode) {
      setTab(mode)
      setError(null)
      setSuccess(false)
      setVerifyScreen(false)
      setResendSent(false)
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
        setSuccess(true)
        setTimeout(handleClose, 900)
      } else {
        await signup(email, password, name)
        setSignupEmail(email)
        setVerifyScreen(true)
      }
    } catch (err: any) {
      setError(authErrorMessage(err.code, tab, t))
    } finally {
      setLoading(false)
    }
  }

  async function handleResendVerification() {
    setResendLoading(true)
    try {
      await fetch('/api/send-verification-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: signupEmail }),
      })
      setResendSent(true)
    } catch {
      // silently fail:user can try again
    } finally {
      setResendLoading(false)
    }
  }

  async function handleGoogleLogin() {
    setError(null)
    setGoogleLoading(true)
    try {
      await loginWithGoogle()
      setSuccess(true)
      setTimeout(handleClose, 900)
    } catch (err: any) {
      setError(authErrorMessage(err.code, tab, t))
    } finally {
      setGoogleLoading(false)
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
          <span className="auth-modal-logo">TIMECUT</span>
          <button className="auth-modal-close" onClick={handleClose} aria-label="Close">
            <IconX />
          </button>
        </div>

        {verifyScreen ? (
          <div className="auth-modal-success">
            <div className="auth-modal-success-ring" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
              <IconMail />
            </div>
            <p className="auth-modal-success-title">Check your inbox</p>
            <p className="auth-modal-success-sub">
              We sent a verification link to <strong>{signupEmail}</strong>.<br />
              Click it to activate your account.
            </p>
            <button
              type="button"
              className="btn-primary btn-cta btn-full"
              style={{ marginTop: 20 }}
              onClick={resendSent ? undefined : handleResendVerification}
              disabled={resendLoading || resendSent}
            >
              {resendLoading ? <><span className="btn-spinner" />Sending…</> : resendSent ? '✓ Email resent!' : 'Resend verification email'}
            </button>
            <p className="auth-modal-switch" style={{ marginTop: 12 }}>
              Already verified?{' '}
              <button className="form-link" type="button" onClick={() => { setVerifyScreen(false); setTab('login') }}>
                Log in
              </button>
            </p>
          </div>
        ) : success ? (
          <div className="auth-modal-success">
            <div className="auth-modal-success-ring">
              <IconCheck />
            </div>
            <p className="auth-modal-success-title">{t('auth.successLogin')}</p>
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
              <form className="auth-modal-form" onSubmit={handleSubmit} noValidate autoComplete="off">
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
                    autoComplete="off"
                    readOnly
                    onFocus={e => e.currentTarget.removeAttribute('readonly')}
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
                    autoComplete="new-password"
                    readOnly
                    onFocus={e => e.currentTarget.removeAttribute('readonly')}
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

              <div className="auth-divider">{t('auth.orDivider')}</div>
              <button
                type="button"
                className="btn-social"
                onClick={handleGoogleLogin}
                disabled={loading || googleLoading}
              >
                {googleLoading
                  ? <><span className="btn-spinner" />{t('auth.signingIn')}</>
                  : <><IconGoogle />{t('auth.continueWithGoogle')}</>
                }
              </button>

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
    case 'auth/email-not-verified':    return 'Please verify your email before logging in. Check your inbox for the verification link.'
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

function IconMail() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <polyline points="2,4 12,13 22,4"/>
    </svg>
  )
}

function IconGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  )
}
