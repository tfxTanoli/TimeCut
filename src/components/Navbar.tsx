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
  const [menuOpen, setMenuOpen] = useState(false)

  function handleLogo() {
    onLogoClick?.()
    setMenuOpen(false)
    navigate('/')
  }

  function closeMenu() {
    setMenuOpen(false)
  }

  const initials = displayName
    ? displayName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
    : (user?.email?.[0] ?? 'U').toUpperCase()

  return (
    <nav className="navbar">
      <div className="navbar-inner container">
        {/* Logo */}
        <button className="navbar-logo" onClick={handleLogo}>
          <span className="navbar-logo-text">TIMECUT</span>
        </button>

        {/* Desktop nav links */}
        <ul className="navbar-links">
          <li><Link to="/">{t('nav.home')}</Link></li>
          <li><Link to="/how-it-works">{t('nav.howItWorks')}</Link></li>
          <li><Link to="/features">{t('nav.features')}</Link></li>
          <li><Link to="/examples">{t('nav.examples')}</Link></li>
          <li><Link to="/pricing">{t('nav.pricing')}</Link></li>
          <li><Link to="/blog">{t('nav.blog')}</Link></li>
        </ul>

        {/* Desktop actions */}
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
                <span>{initials}</span>
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

        {/* Mobile right group: lang switcher + hamburger tightly together */}
        <div className="navbar-mobile-right">
          <select
            className="lang-switcher lang-switcher--mobile-nav"
            value={lang}
            onChange={e => setLang(e.target.value)}
            title="UI Language"
          >
            <option value="English">EN</option>
            <option value="Chinese (Simplified)">简体</option>
            <option value="Chinese (Traditional)">繁體</option>
          </select>
          <button
            className="hamburger-btn"
            onClick={() => setMenuOpen(prev => !prev)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <IconX /> : <IconMenu />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="mobile-menu">
          <ul className="mobile-menu-links">
            <li><Link to="/" onClick={closeMenu}>{t('nav.home')}</Link></li>
            <li><Link to="/how-it-works" onClick={closeMenu}>{t('nav.howItWorks')}</Link></li>
            <li><Link to="/features" onClick={closeMenu}>{t('nav.features')}</Link></li>
            <li><Link to="/examples" onClick={closeMenu}>{t('nav.examples')}</Link></li>
            <li><Link to="/pricing" onClick={closeMenu}>{t('nav.pricing')}</Link></li>
            <li><Link to="/blog" onClick={closeMenu}>{t('nav.blog')}</Link></li>
          </ul>
          <div className="mobile-menu-actions">
            {user ? (
              <div className="mobile-menu-user">
                <span className="mobile-menu-email">{displayName || user.email}</span>
              </div>
            ) : (
              <>
                <button className="mobile-menu-login" onClick={() => { openLogin(); closeMenu() }}>
                  {t('nav.logIn')}
                </button>
                <button className="btn-primary mobile-menu-signup" onClick={() => { openSignup(); closeMenu() }}>
                  {t('nav.getStarted')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}

function IconMenu() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function IconX() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
