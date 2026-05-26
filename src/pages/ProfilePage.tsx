import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Footer from '../components/Footer'

export default function ProfilePage() {
  const { user, userData, displayName, updateDisplayName, reauthAndChangePassword } = useAuth()
  const navigate = useNavigate()

  // Name form
  const [name, setName]             = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameStatus, setNameStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [nameError, setNameError]   = useState('')

  // Password form
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw]         = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwSaving, setPwSaving]   = useState(false)
  const [pwStatus, setPwStatus]   = useState<'idle' | 'success' | 'error'>('idle')
  const [pwError, setPwError]     = useState('')

  // Redirect if not logged in
  useEffect(() => {
    if (!user) navigate('/', { replace: true })
  }, [user, navigate])

  // Pre-fill name from context (fires when displayName is ready)
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
      setNameError('Failed to update name. Please try again.')
      setNameStatus('error')
    } finally {
      setNameSaving(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwError('')
    if (newPw.length < 6) { setPwError('New password must be at least 6 characters.'); return }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return }
    if (!currentPw) { setPwError('Please enter your current password.'); return }
    setPwSaving(true)
    try {
      await reauthAndChangePassword(currentPw, newPw)
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      setPwStatus('success')
      setTimeout(() => setPwStatus('idle'), 3000)
    } catch (err: any) {
      const msg =
        err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
          ? 'Current password is incorrect.'
          : err.code === 'auth/weak-password'
          ? 'New password must be at least 6 characters.'
          : err.code === 'auth/too-many-requests'
          ? 'Too many attempts. Please try again later.'
          : 'Failed to update password. Please try again.'
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

          {/* Hero */}
          <div className="profile-hero">
            <div className="profile-hero-avatar">
              {user.photoURL
                ? <img src={user.photoURL} alt={initials} className="profile-hero-avatar-img" />
                : <span>{initials}</span>}
            </div>
            <div className="profile-hero-info">
              <h1 className="profile-hero-name">{resolvedName || 'Your Account'}</h1>
              <p className="profile-hero-email">{user.email}</p>
            </div>
            {userData && (
              <div className="profile-hero-stats">
                <div className="profile-stat">
                  <span className="profile-stat-val">{userData.totalAnalyses}</span>
                  <span className="profile-stat-label">Analyses</span>
                </div>
                <div className="profile-stat-divider" />
                <div className="profile-stat">
                  <span className="profile-stat-val">{userData.totalTimeSaved}</span>
                  <span className="profile-stat-label">Mins Saved</span>
                </div>
              </div>
            )}
          </div>

          {/* Cards grid */}
          <div className="profile-grid">

            {/* Personal Info */}
            <div className="profile-card">
              <div className="profile-card-header">
                <IconUser />
                <h2 className="profile-card-title">Personal Info</h2>
              </div>

              <form onSubmit={handleSaveName} className="profile-form">
                <div className="form-group">
                  <label className="form-label">Full name</label>
                  <input
                    className="form-input"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Your name"
                    disabled={nameSaving}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email address</label>
                  <div className="profile-readonly-field">
                    <span>{user.email}</span>
                    <span className="profile-readonly-badge">Cannot change</span>
                  </div>
                </div>

                {nameStatus === 'success' && (
                  <p className="profile-msg profile-msg--success">Name updated successfully.</p>
                )}
                {nameError && (
                  <p className="profile-msg profile-msg--error">{nameError}</p>
                )}

                <button
                  type="submit"
                  className="btn-primary btn-cta profile-btn"
                  disabled={nameSaving || !name.trim() || name.trim() === resolvedName}
                >
                  {nameSaving ? <><span className="btn-spinner" />Saving…</> : 'Save Name'}
                </button>
              </form>
            </div>

            {/* Change Password */}
            <div className="profile-card">
              <div className="profile-card-header">
                <IconLock />
                <h2 className="profile-card-title">Change Password</h2>
              </div>

              <form onSubmit={handleChangePassword} className="profile-form">
                <div className="form-group">
                  <label className="form-label">Current password</label>
                  <input
                    className="form-input"
                    type="password"
                    value={currentPw}
                    onChange={e => setCurrentPw(e.target.value)}
                    placeholder="Enter current password"
                    disabled={pwSaving}
                    autoComplete="current-password"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">New password</label>
                  <input
                    className="form-input"
                    type="password"
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    placeholder="Min 6 characters"
                    disabled={pwSaving}
                    autoComplete="new-password"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm new password</label>
                  <input
                    className="form-input"
                    type="password"
                    value={confirmPw}
                    onChange={e => setConfirmPw(e.target.value)}
                    placeholder="Repeat new password"
                    disabled={pwSaving}
                    autoComplete="new-password"
                  />
                </div>

                {pwStatus === 'success' && (
                  <p className="profile-msg profile-msg--success">Password updated successfully.</p>
                )}
                {pwError && (
                  <p className="profile-msg profile-msg--error">{pwError}</p>
                )}

                <button
                  type="submit"
                  className="btn-primary btn-cta profile-btn"
                  disabled={pwSaving || !currentPw || !newPw || !confirmPw}
                >
                  {pwSaving ? <><span className="btn-spinner" />Updating…</> : 'Update Password'}
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
