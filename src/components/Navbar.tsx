import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useAuthModal } from '../contexts/AuthModalContext'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import UserDropdown from './UserDropdown'

interface Props {
  onLogoClick?: () => void
}

export default function Navbar({ onLogoClick }: Props) {
  const navigate = useNavigate()
  const { user, displayName } = useAuth()
  const { openLogin, openSignup } = useAuthModal()
  const { lang, setLang } = useLanguage()
  const { t } = useTranslation()
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
          <img src="/timecut-logo.webp" alt="TimeCut" className="navbar-logo-img" />
        </button>
        <ul className="navbar-links">
          <li><Link to="/how-it-works">{t('nav.howItWorks')}</Link></li>
          <li><Link to="/features">{t('nav.features')}</Link></li>
          <li><Link to="/examples">{t('nav.examples')}</Link></li>
          <li><Link to="/pricing">{t('nav.pricing')}</Link></li>
          <li><Link to="/blog">{t('nav.blog')}</Link></li>
        </ul>
        <div className="navbar-actions">
          <select
            className="lang-switcher"
            value={lang}
            onChange={e => setLang(e.target.value)}
            title="UI Language"
          >
            <option value="English">EN</option>
            <option value="Chinese (Simplified)">简体</option>
            <option value="Chinese (Traditional)">繁體</option>
          </select>

          {user ? (
            <div className="navbar-avatar-wrap">
              <button
                className={`navbar-avatar ${dropdownOpen ? 'navbar-avatar--active' : ''}`}
                onClick={() => setDropdownOpen(prev => !prev)}
                title={displayName || (user.email ?? '')}
                aria-label={t('nav.accountMenu')}
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
              <button className="btn-login" onClick={openLogin}>{t('nav.logIn')}</button>
              <button className="btn-primary btn-sm nav-cta" onClick={openSignup}>{t('nav.getStarted')}</button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
