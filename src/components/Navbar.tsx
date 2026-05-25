import { Link, useNavigate } from 'react-router-dom'

interface Props {
  onLogoClick?: () => void
}

export default function Navbar({ onLogoClick }: Props) {
  const navigate = useNavigate()

  function handleLogo() {
    onLogoClick?.()
    navigate('/')
  }

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
          <Link to="/login" className="btn-login">Log in</Link>
          <Link to="/get-started" className="btn-primary btn-sm nav-cta">Get Started</Link>
        </div>
      </div>
    </nav>
  )
}
