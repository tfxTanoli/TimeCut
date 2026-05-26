import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useAuthModal } from '../contexts/AuthModalContext'
import UserDropdown from './UserDropdown'

interface Props {
  onLogoClick?: () => void
}

export default function Navbar({ onLogoClick }: Props) {
  const navigate = useNavigate()
  const { user, displayName } = useAuth()
  const { openLogin, openSignup } = useAuthModal()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  function handleLogo() {
    onLogoClick?.()
    navigate('/')
  }

  const initials = displayName
    ? displayName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
    : (user?.email?.[0] ?? 'U').toUpperCase()

  return (
    <nav className="navbar">
      <div className="navbar-inner container">
        <button className="navbar-logo" onClick={handleLogo}>
          <span className="logo-icon">⏱</span>
          TIMECUT
        </button>
        <ul className="navbar-links">
          <li><Link to="/how-it-works">How it Works</Link></li>
          <li><Link to="/features">Features</Link></li>
          <li><Link to="/examples">Examples</Link></li>
          <li><Link to="/pricing">Pricing</Link></li>
          <li><Link to="/blog">Blog</Link></li>
        </ul>
        <div className="navbar-actions">
          {user ? (
            <div className="navbar-avatar-wrap">
              <button
                className={`navbar-avatar ${dropdownOpen ? 'navbar-avatar--active' : ''}`}
                onClick={() => setDropdownOpen(prev => !prev)}
                title={displayName || (user.email ?? '')}
                aria-label="Account menu"
              >
                {user.photoURL
                  ? <img src={user.photoURL} alt={initials} className="navbar-avatar-img" />
                  : <span>{initials}</span>
                }
              </button>
              {dropdownOpen && (
                <UserDropdown onClose={() => setDropdownOpen(false)} />
              )}
            </div>
          ) : (
            <>
              <button className="btn-login" onClick={openLogin}>Log in</button>
              <button className="btn-primary btn-sm nav-cta" onClick={openSignup}>Get Started</button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
