import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { InputTab } from '../types'
import type { PlanType } from '../lib/userService'
import Footer from './Footer'
import { useTranslation } from '../hooks/useTranslation'

const LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Arabic',
  'Portuguese', 'Chinese (Simplified)', 'Chinese (Traditional)', 'Japanese', 'Turkish', 'Italian', 'Korean',
]

interface Props {
  onSubmit: (tab: InputTab, value: string | File, language: string) => void
  isLoading: boolean
  error: string | null
  plan?: PlanType
  planLimit?: number
  monthlyUsage?: number
  remaining?: number
  isLoggedIn?: boolean
  onOpenAuth?: () => void
  isAtLimit?: boolean
}

export default function LandingPage({
  onSubmit, isLoading, error,
  plan = 'free', planLimit = 5, monthlyUsage = 0, remaining = 5,
  isLoggedIn = false, onOpenAuth, isAtLimit = false,
}: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<InputTab>('text')
  const [textValue, setTextValue] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [language, setLanguage] = useState('English')
  const [showPdfUpgrade, setShowPdfUpgrade] = useState(false)
  const [activeCard, setActiveCard] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const seenFadeEls = useRef<Set<Element>>(new Set())

  const canUsePdf = plan === 'starter' || plan === 'pro' || plan === 'custom'

  function handlePdfTabClick() {
    setActiveTab('pdf')
    if (!canUsePdf) {
      setShowPdfUpgrade(true)
      return
    }
    setShowPdfUpgrade(false)
  }

  useEffect(() => {
    const els = document.querySelectorAll<Element>('.fade-up')
    const seen = seenFadeEls.current
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible')
          seen.add(e.target)
          observer.unobserve(e.target)
        }
      }),
      { threshold: 0.12 }
    )
    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  // Re-apply is-visible after React re-renders wipe DOM-mutated classes
  useEffect(() => {
    seenFadeEls.current.forEach(el => el.classList.add('is-visible'))
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isLoggedIn) {
      onOpenAuth?.()
      return
    }
    if (activeTab === 'text' && textValue.trim()) onSubmit('text', textValue.trim(), language)
    if (activeTab === 'pdf' && pdfFile && canUsePdf) onSubmit('pdf', pdfFile, language)
  }

  const canSubmit =
    !isLoading &&
    !showPdfUpgrade &&
    !isAtLimit &&
    ((activeTab === 'text' && textValue.trim().length > 0) ||
      (activeTab === 'pdf' && pdfFile !== null && canUsePdf))

  return (
    <>
      {/* ── Hero (text only) ── */}
      <section className="hero hero--text-only">
        <div className="container hero-inner hero-inner--center">
          <div className="hero-text hero-text--center">
            <p className="hero-worth-question">{t('home.worthQuestion')}</p>
            <p className="hero-find-out">Find out before you spend another minute.</p>
            <h1 className="hero-title">
              {t('home.title').split(t('home.titleAccent'))[0]}
              <br />
              <span className="hero-accent">{t('home.titleAccent')}</span>
              {t('home.title').split(t('home.titleAccent'))[1]}
            </h1>
            <p className="hero-subtitle">
              {t('home.subtitle').split('\n').map((line, i) => (
                <span key={i}>{line}{i === 0 ? <br /> : null}</span>
              ))}
            </p>
          </div>
        </div>
      </section>

      {/* ── Example Analysis Preview (now first, above input) ── */}
      <section className="examples-preview">
        <div className="container">
          <div className="examples-preview-grid">
            {/* SKIP IT card */}
            <div className="rpc rpc--skip fade-up" style={{ transitionDelay: '60ms' }}>
              <div className="rpc-article">"10 Morning Habits That Will Change Your Life"</div>
              <div className="rpc-header">
                <span className="rpc-verdict rpc-verdict--skip rpc-verdict--big">SKIP IT</span>
                <div className="rpc-scores">
                  <div className="rpc-score-item">
                    <span className="rpc-score-label">Reading Time</span>
                    <span className="rpc-score-value">24 mins</span>
                  </div>
                  <div className="rpc-score-item">
                    <span className="rpc-score-label">Time Saved</span>
                    <span className="rpc-score-value rpc-score-value--saved">22 mins</span>
                  </div>
                  <div className="rpc-score-item">
                    <span className="rpc-score-label">Originality</span>
                    <span className="rpc-score-value">3.1<span className="rpc-score-sub"> / 10</span></span>
                  </div>
                  <div className="rpc-score-item">
                    <span className="rpc-score-label">Info Density</span>
                    <span className="rpc-score-value">2.6<span className="rpc-score-sub"> / 10</span></span>
                  </div>
                </div>
              </div>
              <div className="rpc-tags">
                <span className="rpc-tag rpc-tag--bad">Repeated ideas</span>
                <span className="rpc-tag rpc-tag--bad">Low originality</span>
                <span className="rpc-tag rpc-tag--bad">Low information density</span>
              </div>
              <div className="rpc-final">
                <span className="rpc-final-label">Final Decision</span>
                <p className="rpc-final-text">Most ideas are widely known and can be summarized in one sentence. Not worth your time.</p>
              </div>
            </div>

            {/* MUST READ card */}
            <div className="rpc rpc--read fade-up" style={{ transitionDelay: '180ms' }}>
              <div className="rpc-article">"Deep Work - Cal Newport"</div>
              <div className="rpc-header">
                <span className="rpc-verdict rpc-verdict--read rpc-verdict--big">MUST READ</span>
                <div className="rpc-scores">
                  <div className="rpc-score-item">
                    <span className="rpc-score-label">Reading Time</span>
                    <span className="rpc-score-value">24 mins</span>
                  </div>
                  <div className="rpc-score-item">
                    <span className="rpc-score-label">Time Saved</span>
                    <span className="rpc-score-value rpc-score-value--saved">22 mins</span>
                  </div>
                  <div className="rpc-score-item">
                    <span className="rpc-score-label">Attention Quality</span>
                    <span className="rpc-score-value">High</span>
                  </div>
                  <div className="rpc-score-item">
                    <span className="rpc-score-label">Value Score</span>
                    <span className="rpc-score-value rpc-score-value--high">9.1<span className="rpc-score-sub"> / 10</span></span>
                  </div>
                </div>
              </div>
              <div className="rpc-tags">
                <span className="rpc-tag rpc-tag--good">Original thinking</span>
                <span className="rpc-tag rpc-tag--good">Research-backed</span>
                <span className="rpc-tag rpc-tag--good">High information density</span>
              </div>
              <div className="rpc-final">
                <span className="rpc-final-label">Final Decision</span>
                <p className="rpc-final-text">Read this fully. High chance of permanently changing how you structure your workday.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Input Section ── */}
      <section className="input-section">
        <div className="container input-section-inner">
          <form className="input-card" onSubmit={handleSubmit}>
            <div className="input-tabs">
              <button
                type="button"
                className={`tab-btn ${activeTab === 'text' ? 'tab-btn--active' : ''}`}
                onClick={() => { setActiveTab('text'); setShowPdfUpgrade(false) }}
              >
                <IconDoc /> {t('home.pasteText')}
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'pdf' ? 'tab-btn--active' : ''} ${!canUsePdf ? 'tab-btn--locked' : ''}`}
                onClick={handlePdfTabClick}
              >
                <IconUpload /> {t('home.uploadPDF')}
                {!canUsePdf && <span className="tab-lock-icon">🔒</span>}
              </button>
            </div>

            <div className="input-body">
              <div key={activeTab} className="tab-fade">
                {activeTab === 'text' && !showPdfUpgrade && (
                  <>
                    <textarea
                      className="text-area"
                      placeholder={t('home.textPlaceholder')}
                      value={textValue}
                      onChange={e => setTextValue(e.target.value)}
                      rows={6}
                      disabled={isLoading}
                    />
                    <p className={`char-count ${textValue.length > 13000 ? 'char-count--warn' : ''}`}>
                      {textValue.length.toLocaleString()} / 15,000
                    </p>
                  </>
                )}

                {showPdfUpgrade && (
                  <div className="pdf-upgrade-prompt">
                    <span className="pdf-upgrade-icon">🔒</span>
                    <p className="pdf-upgrade-title">PDF Upload is a paid feature</p>
                    <p className="pdf-upgrade-sub">Upgrade to Starter or Pro to analyze PDF documents.</p>
                    <div className="pdf-upgrade-actions">
                      {!isLoggedIn && (
                        <button type="button" className="btn-primary btn-sm" onClick={onOpenAuth}>
                          Sign up free
                        </button>
                      )}
                      <a href="/pricing" className="btn-primary btn-sm">
                        View Plans
                      </a>
                      <button
                        type="button"
                        className="pdf-upgrade-dismiss"
                        onClick={() => { setShowPdfUpgrade(false); setActiveTab('text') }}
                      >
                        Back to text
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'pdf' && canUsePdf && (
                  <div className="pdf-drop" onClick={() => fileRef.current?.click()}>
                    <IconUpload className="pdf-drop-icon" />
                    {pdfFile ? (
                      <>
                        <p className="pdf-name">{pdfFile.name}</p>
                        <p className="pdf-size">
                          {(pdfFile.size / 1024).toFixed(0)} KB &nbsp;·&nbsp;
                          <span className="pdf-remove" onClick={e => { e.stopPropagation(); setPdfFile(null) }}>
                            {t('home.pdfRemove')}
                          </span>
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="pdf-drop-title">{t('home.pdfClick')}</p>
                        <p className="pdf-drop-hint">{t('home.pdfMax')}</p>
                      </>
                    )}
                    <input ref={fileRef} type="file" accept=".pdf" hidden onChange={e => setPdfFile(e.target.files?.[0] ?? null)} />
                  </div>
                )}
              </div>

              <div className="input-footer">
                <select className="lang-select" value={language} onChange={e => setLanguage(e.target.value)} disabled={isLoading}>
                  {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                </select>
                {isAtLimit ? (
                  <button
                    type="button"
                    className="btn-primary btn-cta save-cta save-cta--limit"
                    onClick={() => navigate('/pricing')}
                  >
                    🔒 Limit Reached: Upgrade
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="btn-primary btn-cta save-cta"
                    disabled={isLoading || showPdfUpgrade || !canSubmit}
                  >
                    {isLoading
                      ? <><span className="btn-spinner" />{t('home.analyzing')}</>
                      : t('home.saveMyTime')}
                  </button>
                )}
              </div>
            </div>

            {error && <p className="error-banner">{error}</p>}

            {/* Plan usage indicator */}
            <div className="plan-usage-bar">
              <div className="plan-usage-left">
                <span className={`plan-badge plan-badge--${plan}`}>
                  {plan.toUpperCase()}
                </span>
                <span className="plan-usage-text">
                  {monthlyUsage} / {planLimit} used this month
                </span>
                {remaining === 0 && (
                  <span className="plan-usage-limit-tag">Limit reached</span>
                )}
              </div>
              {!isLoggedIn && (
                <button className="plan-usage-upgrade" onClick={onOpenAuth} type="button">
                  🎁 1 Free Analysis Available. Sign up to unlock 3 more.
                </button>
              )}
              {isLoggedIn && remaining === 0 && (
                <Link to="/pricing" className="plan-usage-upgrade">
                  Upgrade
                </Link>
              )}
            </div>

            <p className="trust-line">
              <IconShield /> {t('home.trustLine')}
            </p>
          </form>
        </div>
      </section>

      {/* ── How TimeCut Works ── */}
      <section className="hiw-home">
        <div className="container">
          <p className="section-eyebrow fade-up">Simple Process</p>
          <h2 className="section-title fade-up" style={{ transitionDelay: '60ms' }}>How TimeCut Works</h2>
          <div className="hiw-home-steps">
            <div className="hiw-home-step fade-up" style={{ transitionDelay: '0ms' }}>
              <div className="hiw-home-num">01</div>
              <h3 className="hiw-home-step-title">Paste Content</h3>
              <p className="hiw-home-step-desc">Copy any article, email, book chapter, or report and paste it into the box.</p>
            </div>
            <div className="hiw-home-arrow" />
            <div className="hiw-home-step fade-up" style={{ transitionDelay: '120ms' }}>
              <div className="hiw-home-num">02</div>
              <h3 className="hiw-home-step-title">TimeCut Analysis</h3>
              <p className="hiw-home-step-desc">TimeCut analyzes quality, originality, information density, actionability, and time worthiness.</p>
            </div>
            <div className="hiw-home-arrow" />
            <div className="hiw-home-step fade-up" style={{ transitionDelay: '240ms' }}>
              <div className="hiw-home-num">03</div>
              <h3 className="hiw-home-step-title">Get Your Verdict</h3>
              <p className="hiw-home-step-desc">Receive a clear verdict: <strong>READ IT</strong> · <strong>SKIM IT</strong> · <strong>SKIP IT</strong>, in seconds.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature Cards ── */}
      <section className="features">
        <div className="container">
          <p className="section-eyebrow fade-up">{t('home.whyBadge')}</p>
          <h2 className="section-title fade-up" style={{ transitionDelay: '60ms' }}>{t('home.whyTitle')}</h2>
          <div className="features-grid">
            <div
              className={`feature-card fade-up${activeCard === 0 ? ' feature-card--active' : ''}`}
              style={{ transitionDelay: '0ms' }}
              onClick={() => setActiveCard(activeCard === 0 ? null : 0)}
            >
              <div className="feature-icon feature-icon--purple"><IconClock /></div>
              <h3>{t('home.feat1Title')}</h3>
              <p>{t('home.feat1Desc')}</p>
            </div>
            <div
              className={`feature-card fade-up${activeCard === 1 ? ' feature-card--active' : ''}`}
              style={{ transitionDelay: '120ms' }}
              onClick={() => setActiveCard(activeCard === 1 ? null : 1)}
            >
              <div className="feature-icon feature-icon--amber"><IconTarget /></div>
              <h3>{t('home.feat2Title')}</h3>
              <p>{t('home.feat2Desc')}</p>
            </div>
            <div
              className={`feature-card fade-up${activeCard === 2 ? ' feature-card--active' : ''}`}
              style={{ transitionDelay: '240ms' }}
              onClick={() => setActiveCard(activeCard === 2 ? null : 2)}
            >
              <div className="feature-icon feature-icon--green"><IconShieldCheck /></div>
              <h3>{t('home.feat3Title')}</h3>
              <p>{t('home.feat3Desc')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social Proof ── */}
      <section className="social-proof">
        <div className="container">
          <div className="stats-row">
            <div className="stat-item fade-up" style={{ transitionDelay: '0ms' }}>
              <p className="stat-value">527</p>
              <p className="stat-label">{t('home.stat1Label')}</p>
            </div>
            <div className="stat-divider" />
            <div className="stat-item fade-up" style={{ transitionDelay: '100ms' }}>
              <p className="stat-value">8,961</p>
              <p className="stat-label">{t('home.stat2Label')}</p>
            </div>
            <div className="stat-divider" />
            <div className="stat-item fade-up" style={{ transitionDelay: '200ms' }}>
              <p className="stat-value">12</p>
              <p className="stat-label">{t('home.stat3Label')}</p>
            </div>
            <div className="stat-divider" />
            <div className="stat-item fade-up" style={{ transitionDelay: '300ms' }}>
              <p className="stat-value">~10 sec</p>
              <p className="stat-label">{t('home.stat4Label')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Philosophy ── */}
      <section className="philosophy-section">
        <div className="container philosophy-inner">
          <p className="philosophy-line">{t('home.philoLine1')}</p>
          <p className="philosophy-line philosophy-line--accent">{t('home.philoLine2')}</p>
          <p className="philosophy-question">{t('home.philoQuestion')}</p>
        </div>
      </section>

      <Footer />
    </>
  )
}

/* ── Inline SVG Icons ── */
function IconDoc({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}
function IconUpload({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  )
}
function IconClock() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  )
}
function IconTarget() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  )
}
function IconShield() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}
function IconShieldCheck() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  )
}
