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

/* ── Savings Calculator Constants ── */
const CALC = {
  weeksPerYear: 52.18,   // 365.25 / 7 — exact average
}

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

  /* ── Savings Calculator State (defaults → ~317 hrs/year) ── */
  const [articlesPerWeek, setArticlesPerWeek] = useState(20)
  const [avgReadingTime, setAvgReadingTime] = useState(25)
  const [lowValuePct, setLowValuePct] = useState(73)

  const canUsePdf = plan === 'starter' || plan === 'pro' || plan === 'custom'

  function handlePdfTabClick() {
    setActiveTab('pdf')
    if (!canUsePdf) { setShowPdfUpgrade(true); return }
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

  useEffect(() => {
    seenFadeEls.current.forEach(el => el.classList.add('is-visible'))
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isLoggedIn) { onOpenAuth?.(); return }
    if (activeTab === 'text' && textValue.trim()) onSubmit('text', textValue.trim(), language)
    if (activeTab === 'pdf' && pdfFile && canUsePdf) onSubmit('pdf', pdfFile, language)
  }

  const canSubmit =
    !isLoading && !showPdfUpgrade && !isAtLimit &&
    ((activeTab === 'text' && textValue.trim().length > 0) ||
      (activeTab === 'pdf' && pdfFile !== null && canUsePdf))

  /* ── Calculator (yearly, using 52.18 wks/yr) ── */
  const lowValueMinsPerWeek = articlesPerWeek * avgReadingTime * (lowValuePct / 100)
  const hoursSavedPerYear = Math.round((lowValueMinsPerWeek / 60) * CALC.weeksPerYear)
  const hoursSavedPerMonth = parseFloat((hoursSavedPerYear / 12).toFixed(1))

  /* ── Comparison chart (yearly) ── */
  const totalHoursPerYear = Math.round((articlesPerWeek * avgReadingTime / 60) * CALC.weeksPerYear)
  const withTimecutHoursPerYear = totalHoursPerYear - hoursSavedPerYear
  const maxBarHours = Math.max(totalHoursPerYear, 1)

  return (
    <>
      {/* ── Hero: headline left · paste box right ── */}
      <section className="hero hero--split">
        <div className="container hero-split-grid">
          {/* LEFT · headline + supporting text */}
          <div className="hero-text-col">
            <p className="hero-worth-question">{t('home.worthQuestion')}</p>
            <h1 className="hero-title hero-title--find-out">
              Find out before you spend another minute.
            </h1>
            <p className="hero-support">{t('home.subtitle')}</p>
          </div>

          {/* RIGHT · paste box + analysis CTA */}
          <div className="hero-input-col">
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
                        rows={4}
                        disabled={isLoading}
                      />
                      <div className="text-area-meta">
                        <span className="analysis-speed-note">
                          <IconClock /> {t('home.analysisSpeed')}
                        </span>
                        <span className={`char-count ${textValue.length > 13000 ? 'char-count--warn' : ''}`}>
                          {textValue.length.toLocaleString()} / 15,000
                        </span>
                      </div>
                    </>
                  )}

                  {showPdfUpgrade && (
                    <div className="pdf-upgrade-prompt">
                      <span className="pdf-upgrade-icon">🔒</span>
                      <p className="pdf-upgrade-title">PDF Upload is a paid feature</p>
                      <p className="pdf-upgrade-sub">Upgrade to Starter or Pro to analyze PDF documents.</p>
                      <div className="pdf-upgrade-actions">
                        {!isLoggedIn && (
                          <button type="button" className="btn-primary btn-sm" onClick={onOpenAuth}>Sign up free</button>
                        )}
                        <a href="/pricing" className="btn-primary btn-sm">View Plans</a>
                        <button type="button" className="pdf-upgrade-dismiss"
                          onClick={() => { setShowPdfUpgrade(false); setActiveTab('text') }}>
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
                    <button type="button" className="btn-primary btn-cta save-cta save-cta--limit"
                      onClick={() => navigate('/pricing')}>
                      🔒 Limit Reached: Upgrade
                    </button>
                  ) : (
                    <button type="submit" className="btn-primary btn-cta save-cta"
                      disabled={isLoading || showPdfUpgrade || !canSubmit}>
                      {isLoading
                        ? <><span className="btn-spinner" />{t('home.analyzing')}</>
                        : t('home.saveMyTime')}
                    </button>
                  )}
                </div>
              </div>

              {error && <p className="error-banner">{error}</p>}

              {/* Plan usage / free CTA */}
              <div className="plan-usage-bar">
                {isLoggedIn ? (
                  <>
                    <div className="plan-usage-left">
                      <span className={`plan-badge plan-badge--${plan}`}>{plan.toUpperCase()}</span>
                      <span className="plan-usage-text">{monthlyUsage} / {planLimit} used this month</span>
                      {remaining === 0 && <span className="plan-usage-limit-tag">Limit reached</span>}
                    </div>
                    {remaining === 0 && (
                      <Link to="/pricing" className="plan-usage-upgrade">Upgrade</Link>
                    )}
                  </>
                ) : (
                  <div className="input-free-cta">
                    <div className="input-free-cta-text">
                      <span className="input-free-label">Free analysis available.</span>
                      <span className="input-free-sub"> Sign up to unlock 3 more.</span>
                      <span className="input-no-cc"> · No credit card required</span>
                    </div>
                    <button type="button" className="btn-primary btn-sm input-free-btn" onClick={onOpenAuth}>
                      {t('nav.getStarted')}
                    </button>
                  </div>
                )}
              </div>

              <p className="trust-line">
                <IconShield /> {t('home.trustLine')}
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* ── Result Card · directly below hero ── */}
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

      {/* ── Impact Chart (left) + Savings Calculator (right) ── */}
      <section className="impact-savings-section">
        <div className="container">
          <div className="impact-savings-grid">

            {/* LEFT · Impact Chart */}
            <div className="impact-col fade-up">
              <div className="comp-chart-header">
                <p className="section-eyebrow">The Impact</p>
                <h2 className="section-title">See Your Time, Reclaimed</h2>
              </div>
              <div className="comp-chart-bars">
                <div className="comp-bar-row">
                  <span className="comp-bar-label comp-bar-label--bad">Without TimeCut</span>
                  <div className="comp-bar-track">
                    <div className="comp-bar comp-bar--bad"
                      style={{ width: `${Math.min((totalHoursPerYear / maxBarHours) * 100, 100)}%` }} />
                  </div>
                  <span className="comp-bar-value">{totalHoursPerYear}h/yr</span>
                </div>
                <div className="comp-bar-row">
                  <span className="comp-bar-label comp-bar-label--good">With TimeCut</span>
                  <div className="comp-bar-track">
                    <div className="comp-bar comp-bar--good"
                      style={{ width: `${Math.min((withTimecutHoursPerYear / maxBarHours) * 100, 100)}%` }} />
                  </div>
                  <span className="comp-bar-value">{withTimecutHoursPerYear}h/yr</span>
                </div>
                <div className="comp-bar-row">
                  <span className="comp-bar-label comp-bar-label--saved">Time Reclaimed</span>
                  <div className="comp-bar-track">
                    <div className="comp-bar comp-bar--saved"
                      style={{ width: `${Math.min((hoursSavedPerYear / maxBarHours) * 100, 100)}%` }} />
                  </div>
                  <span className="comp-bar-value comp-bar-value--saved">{hoursSavedPerYear}h/yr</span>
                </div>
              </div>
              <p className="comp-chart-note">Figures update live as you adjust the calculator.</p>
            </div>

            {/* RIGHT · Savings Calculator */}
            <div className="savings-col fade-up" style={{ transitionDelay: '120ms' }}>
              <div className="comp-chart-header">
                <p className="section-eyebrow">Savings Calculator</p>
                <h2 className="section-title">How Much Can You Reclaim?</h2>
              </div>

              {/* Inputs */}
              <div className="savings-inputs">
              <div className="savings-input-group">
                <div className="savings-input-header">
                  <label className="savings-input-label">Articles read per week</label>
                  <span className="savings-input-val">{articlesPerWeek}</span>
                </div>
                <input type="range" min={1} max={50} value={articlesPerWeek}
                  onChange={e => setArticlesPerWeek(Number(e.target.value))}
                  className="savings-slider" />
                <div className="savings-slider-ticks"><span>1</span><span>50</span></div>
              </div>

              <div className="savings-input-group">
                <div className="savings-input-header">
                  <label className="savings-input-label">Average reading time</label>
                  <span className="savings-input-val">{avgReadingTime} min</span>
                </div>
                <input type="range" min={2} max={60} value={avgReadingTime}
                  onChange={e => setAvgReadingTime(Number(e.target.value))}
                  className="savings-slider" />
                <div className="savings-slider-ticks"><span>2 min</span><span>60 min</span></div>
              </div>

              <div className="savings-input-group">
                <div className="savings-input-header">
                  <label className="savings-input-label">Low-value content</label>
                  <span className="savings-input-val">{lowValuePct}%</span>
                </div>
                <input type="range" min={10} max={90} value={lowValuePct}
                  onChange={e => setLowValuePct(Number(e.target.value))}
                  className="savings-slider" />
                <div className="savings-slider-ticks"><span>10%</span><span>90%</span></div>
              </div>

              <div className="savings-formula-note">
                <IconInfo />
                <span>Based on industry research: ~73% of online content contains no original insight.</span>
              </div>
            </div>

            {/* Outputs */}
            <div className="savings-outputs">
              <div className="savings-headline">
                <span className="savings-headline-num">{hoursSavedPerYear}</span>
                <span className="savings-headline-unit"> hours saved per year</span>
              </div>
              <div className="savings-monthly">
                <span className="savings-monthly-item">
                  <strong>{hoursSavedPerMonth}h</strong> saved this month
                </span>
              </div>
              <button className="btn-primary btn-cta savings-cta" onClick={onOpenAuth} type="button">
                Start Reclaiming Your Time
              </button>
            </div>
            </div>{/* /savings-col */}

          </div>{/* /impact-savings-grid */}
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
            {[
              { icon: <IconClock />, cls: 'feature-icon--purple', i: 0, title: t('home.feat1Title'), desc: t('home.feat1Desc') },
              { icon: <IconTarget />, cls: 'feature-icon--amber', i: 1, title: t('home.feat2Title'), desc: t('home.feat2Desc') },
              { icon: <IconShieldCheck />, cls: 'feature-icon--green', i: 2, title: t('home.feat3Title'), desc: t('home.feat3Desc') },
            ].map(({ icon, cls, i, title, desc }) => (
              <div key={i}
                className={`feature-card fade-up${activeCard === i ? ' feature-card--active' : ''}`}
                style={{ transitionDelay: `${i * 120}ms` }}
                onClick={() => setActiveCard(activeCard === i ? null : i)}>
                <div className={`feature-icon ${cls}`}>{icon}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
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
function IconInfo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}
