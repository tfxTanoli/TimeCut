import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTranslation } from '../hooks/useTranslation'
import Footer from '../components/Footer'

export default function ProfilePage() {
  const { user, userData, displayName, updateDisplayName, reauthAndChangePassword, plan, planLimit, monthlyUsage } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [name, setName]             = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameStatus, setNameStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [nameError, setNameError]   = useState('')

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw]         = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwSaving, setPwSaving]   = useState(false)
  const [pwStatus, setPwStatus]   = useState<'idle' | 'success' | 'error'>('idle')
  const [pwError, setPwError]     = useState('')

  useEffect(() => {
    if (!user) navigate('/', { replace: true })
  }, [user, navigate])

  useEffect(() => {
    if (displayName) setName(displayName)
    else if (user?.email) setName('')
  }, [displayName, user])

  const resolvedName = displayName

  const initials = (() => {
    if (resolvedName) {
      return resolvedName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
    }
    return (user?.email?.[0] ?? 'U').toUpperCase()
  })()

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || name.trim() === resolvedName) return
    setNameSaving(true)
    setNameError('')
    try {
      await updateDisplayName(name.trim())
      setNameStatus('success')
      setTimeout(() => setNameStatus('idle'), 3000)
    } catch {
      setNameError(t('profile.nameError'))
      setNameStatus('error')
    } finally {
      setNameSaving(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwError('')
    if (newPw.length < 6) { setPwError(t('profile.pwTooShort')); return }
    if (newPw !== confirmPw) { setPwError(t('profile.pwNoMatch')); return }
    if (!currentPw) { setPwError(t('profile.pwMissing')); return }
    setPwSaving(true)
    try {
      await reauthAndChangePassword(currentPw, newPw)
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      setPwStatus('success')
      setTimeout(() => setPwStatus('idle'), 3000)
    } catch (err: any) {
      const msg =
        err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
          ? t('profile.pwWrong')
          : err.code === 'auth/weak-password'
          ? t('profile.pwTooShort')
          : err.code === 'auth/too-many-requests'
          ? t('profile.pwTooMany')
          : t('profile.pwError')
      setPwError(msg)
      setPwStatus('error')
    } finally {
      setPwSaving(false)
    }
  }

  if (!user) return null

  return (
    <>
      <div className="profile-page">
        <div className="container profile-container">
          <div className="profile-hero">
            <div className="profile-hero-avatar">
              <span>{initials}</span>
            </div>
            <div className="profile-hero-info">
              <h1 className="profile-hero-name">{resolvedName || t('profile.yourAccount')}</h1>
              <p className="profile-hero-email">{user.email}</p>
            </div>
            {userData && (
              <div className="profile-hero-stats">
                <div className="profile-stat">
                  <span className="profile-stat-val">{monthlyUsage}</span>
                  <span className="profile-stat-label">Used This Month</span>
                </div>
                <div className="profile-stat-divider" />
                <div className="profile-stat">
                  <span className="profile-stat-val">{planLimit}</span>
                  <span className="profile-stat-label">Monthly Limit</span>
                </div>
                <div className="profile-stat-divider" />
                <div className="profile-stat">
                  <span className="profile-stat-val">{userData.totalAnalyses}</span>
                  <span className="profile-stat-label">Total All Time</span>
                </div>
                <div className="profile-stat-divider" />
                <div className="profile-stat">
                  <span className={`plan-badge plan-badge--${plan}`} style={{ fontSize: 13, padding: '4px 12px' }}>
                    {plan.toUpperCase()}
                  </span>
                  <span className="profile-stat-label">Your Plan</span>
                </div>
              </div>
            )}
          </div>

          <div className="profile-grid">
            <div className="profile-card">
              <div className="profile-card-header">
                <IconUser />
                <h2 className="profile-card-title">{t('profile.personalInfo')}</h2>
              </div>

              <form onSubmit={handleSaveName} className="profile-form">
                <div className="form-group">
                  <label className="form-label">{t('profile.fullName')}</label>
                  <input
                    className="form-input"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={t('profile.namePlaceholder')}
                    disabled={nameSaving}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t('profile.emailAddress')}</label>
                  <div className="profile-readonly-field">
                    <span>{user.email}</span>
                    <span className="profile-readonly-badge">{t('profile.cannotChange')}</span>
                  </div>
                </div>

                {nameStatus === 'success' && (
                  <p className="profile-msg profile-msg--success">{t('profile.nameSuccess')}</p>
                )}
                {nameError && (
                  <p className="profile-msg profile-msg--error">{nameError}</p>
                )}

                <button
                  type="submit"
                  className="btn-primary btn-cta profile-btn"
                  disabled={nameSaving || !name.trim() || name.trim() === resolvedName}
                >
                  {nameSaving ? <><span className="btn-spinner" />{t('profile.saving')}</> : t('profile.saveName')}
                </button>
              </form>
            </div>

            <div className="profile-card">
              <div className="profile-card-header">
                <IconLock />
                <h2 className="profile-card-title">{t('profile.changePassword')}</h2>
              </div>

              <form onSubmit={handleChangePassword} className="profile-form">
                <div className="form-group">
                  <label className="form-label">{t('profile.currentPassword')}</label>
                  <input
                    className="form-input"
                    type="password"
                    value={currentPw}
                    onChange={e => setCurrentPw(e.target.value)}
                    placeholder={t('profile.currentPasswordPlaceholder')}
                    disabled={pwSaving}
                    autoComplete="current-password"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t('profile.newPassword')}</label>
                  <input
                    className="form-input"
                    type="password"
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    placeholder={t('profile.newPasswordPlaceholder')}
                    disabled={pwSaving}
                    autoComplete="new-password"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t('profile.confirmPassword')}</label>
                  <input
                    className="form-input"
                    type="password"
                    value={confirmPw}
                    onChange={e => setConfirmPw(e.target.value)}
                    placeholder={t('profile.confirmPasswordPlaceholder')}
                    disabled={pwSaving}
                    autoComplete="new-password"
                  />
                </div>

                {pwStatus === 'success' && (
                  <p className="profile-msg profile-msg--success">{t('profile.pwSuccess')}</p>
                )}
                {pwError && (
                  <p className="profile-msg profile-msg--error">{pwError}</p>
                )}

                <button
                  type="submit"
                  className="btn-primary btn-cta profile-btn"
                  disabled={pwSaving || !currentPw || !newPw || !confirmPw}
                >
                  {pwSaving ? <><span className="btn-spinner" />{t('profile.updating')}</> : t('profile.updatePassword')}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}

function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function IconLock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}
