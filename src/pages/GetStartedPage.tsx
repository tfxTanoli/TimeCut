import { useState } from 'react'
import { Link } from 'react-router-dom'

export default function GetStartedPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">
            <Link to="/" className="auth-logo-link">⏱ TIMECUT</Link>
          </div>
          <div className="auth-success">
            <span className="auth-success-icon">✓</span>
            <h2>You're on the list!</h2>
            <p>We'll send your account details to <strong>{email}</strong> shortly.</p>
            <p style={{ marginTop: 8 }}>In the meantime, start analyzing content right now — no account needed.</p>
            <Link to="/" className="btn-primary btn-cta" style={{ display: 'inline-block', marginTop: 16 }}>
              Start Analyzing
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="get-started-page">
      <div className="gs-layout">
        {/* Left: Form */}
        <div className="gs-form-panel">
          <div className="auth-logo">
            <Link to="/" className="auth-logo-link">⏱ TIMECUT</Link>
          </div>
          <h1 className="auth-title">Start Protecting<br />Your Time</h1>
          <p className="auth-sub">Create a free account. No credit card required.</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Full name</label>
              <input className="form-input" type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Email address</label>
              <input className="form-input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="Create a password" required />
            </div>
            <button type="submit" className="btn-primary btn-cta btn-full">Create Free Account</button>
          </form>

          <div className="auth-divider"><span>or</span></div>

          <button className="btn-social" type="button">
            <GoogleIcon /> Continue with Google
          </button>

          <p className="auth-switch">
            Already have an account? <Link to="/login" className="form-link">Log in</Link>
          </p>

          <p className="auth-note">
            No account? <Link to="/" className="form-link">Analyze content instantly</Link>
          </p>
        </div>

        {/* Right: Features */}
        <div className="gs-features-panel">
          <h2 className="gs-panel-title">What you get with TimeCut</h2>
          <ul className="gs-feature-list">
            {[
              { icon: '⚡', text: 'Instant Time Intelligence Reports on any content' },
              { icon: '📄', text: 'PDF upload support for documents and reports' },
              { icon: '🌍', text: '10 language support for global content' },
              { icon: '📊', text: 'Full analysis: verdict, score, insights, decisions' },
              { icon: '🔒', text: 'Private and secure — your content is never stored' },
              { icon: '🎯', text: 'Clear verdicts: MUST READ, SKIM ONLY, or SKIP IT' },
            ].map((f, i) => (
              <li key={i} className="gs-feature-item">
                <span className="gs-feature-icon">{f.icon}</span>
                <span>{f.text}</span>
              </li>
            ))}
          </ul>

          <div className="gs-trust-block">
            <p className="gs-trust-title">Trusted by thousands</p>
            <div className="gs-verdict-demos">
              <span className="verdict-badge verdict-badge--must">MUST READ</span>
              <span className="verdict-badge verdict-badge--skim">SKIM ONLY</span>
              <span className="verdict-badge verdict-badge--skip">SKIP IT</span>
            </div>
            <p className="gs-trust-sub">50,000+ reports generated. No sign-up required to try.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
