import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  onClose: () => void
}

export default function UserDropdown({ onClose }: Props) {
  const { user, displayName, logout } = useAuth()
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onMouse(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const initials = displayName
    ? displayName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
    : (user?.email?.[0] ?? 'U').toUpperCase()

  function handleProfile() {
    onClose()
    navigate('/profile')
  }

  async function handleLogout() {
    onClose()
    await logout()
    navigate('/')
  }

  return (
    <div className="udrop" ref={ref}>
      {/* Identity header */}
      <div className="udrop-header">
        <div className="udrop-avatar">
          {user?.photoURL
            ? <img src={user.photoURL} alt={initials} className="udrop-avatar-img" />
            : <span>{initials}</span>}
        </div>
        <div className="udrop-identity">
          <p className="udrop-name">{displayName || 'Your Account'}</p>
          <p className="udrop-email">{user?.email}</p>
        </div>
      </div>

      <div className="udrop-divider" />

      {/* Menu items */}
      <div className="udrop-menu">
        <button className="udrop-item" onClick={handleProfile}>
          <IconUser /> Profile
        </button>
        <button className="udrop-item udrop-item--danger" onClick={handleLogout}>
          <IconLogout /> Log out
        </button>
      </div>
    </div>
  )
}

function IconUser() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function IconLogout() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}
