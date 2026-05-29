import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { InputTab } from '../types'
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
}

export default function LandingPage({ onSubmit, isLoading, error }: Props) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<InputTab>('text')
  const [textValue, setTextValue] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [language, setLanguage] = useState('English')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const els = document.querySelectorAll<Element>('.fade-up')
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible')
          observer.unobserve(e.target)
        }
      }),
      { threshold: 0.12 }
    )
    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (activeTab === 'text' && textValue.trim()) onSubmit('text', textValue.trim(), language)
    if (activeTab === 'pdf' && pdfFile) onSubmit('pdf', pdfFile, language)
  }

  const canSubmit =
    !isLoading &&
    ((activeTab === 'text' && textValue.trim().length > 0) ||
      (activeTab === 'pdf' && pdfFile !== null))

  return (
    <>
      {/* ── Hero ── */}
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-text">
            <span className="hero-badge">{t('home.badge')}</span>
            <h1 className="hero-title">
              {t('home.title').split(t('home.titleAccent'))[0]}
              <br />
              <span className="hero-accent">{t('home.titleAccent')}</span>
            </h1>
            <p className="hero-subtitle">
              {t('home.subtitle').split('\n').map((line, i) => (
                <span key={i}>{line}{i === 0 ? <br /> : null}</span>
              ))}
            </p>
          </div>

          {/* Input card */}
          <form className="input-card" onSubmit={handleSubmit}>
            <div className="input-tabs">
              <button
                type="button"
                className={`tab-btn ${activeTab === 'text' ? 'tab-btn--active' : ''}`}
                onClick={() => setActiveTab('text')}
              >
                <IconDoc /> {t('home.pasteText')}
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'pdf' ? 'tab-btn--active' : ''}`}
                onClick={() => setActiveTab('pdf')}
              >
                <IconUpload /> {t('home.uploadPDF')}
              </button>
            </div>

            <div className="input-body">
              <div key={activeTab} className="tab-fade">
                {activeTab === 'text' && (
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
                {activeTab === 'pdf' && (
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
                <button type="submit" className="btn-primary btn-cta" disabled={!canSubmit}>
                  {isLoading ? <><span className="btn-spinner" />{t('home.analyzing')}</> : t('home.saveMyTime')}
                </button>
              </div>
            </div>

            {error && <p className="error-banner">{error}</p>}

            <p className="trust-line">
              <IconShield /> {t('home.trustLine')}
            </p>
          </form>
        </div>
      </section>

      {/* ── Feature Cards ── */}
      <section className="features">
        <div className="container">
          <p className="section-eyebrow fade-up">{t('home.whyBadge')}</p>
          <h2 className="section-title fade-up" style={{ transitionDelay: '60ms' }}>{t('home.whyTitle')}</h2>
          <div className="features-grid">
            <div className="feature-card fade-up" style={{ transitionDelay: '0ms' }}>
              <div className="feature-icon feature-icon--purple"><IconClock /></div>
              <h3>{t('home.feat1Title')}</h3>
              <p>{t('home.feat1Desc')}</p>
            </div>
            <div className="feature-card fade-up" style={{ transitionDelay: '120ms' }}>
              <div className="feature-icon feature-icon--amber"><IconTarget /></div>
              <h3>{t('home.feat2Title')}</h3>
              <p>{t('home.feat2Desc')}</p>
            </div>
            <div className="feature-card fade-up" style={{ transitionDelay: '240ms' }}>
              <div className="feature-icon feature-icon--green"><IconShieldCheck /></div>
              <h3>{t('home.feat3Title')}</h3>
              <p>{t('home.feat3Desc')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Demo Section ── */}
      <section className="demo">
        <div className="container">
          <p className="section-eyebrow fade-up">{t('home.demoEyebrow')}</p>
          <h2 className="demo-title fade-up" style={{ transitionDelay: '60ms' }}>{t('home.demoTitle')}</h2>
          <div className="demo-card fade-up" style={{ transitionDelay: '120ms' }}>
            <div className="demo-input">
              <p className="demo-label">{t('home.demoInput')}</p>
              <p className="demo-field-label">{t('home.demoPasteText')}</p>
              <p className="demo-url demo-url--text">{t('home.demoQuote')}</p>
            </div>
            <div className="demo-output">
              <p className="demo-label">{t('home.demoResultPreview')}</p>
              <div className="demo-results">
                <span className="verdict-badge verdict-badge--skim">SKIM ONLY</span>
                <div className="demo-stat">
                  <span className="demo-stat-label">{t('home.demoTimeSaved')}</span>
                  <span className="demo-stat-value">18 mins</span>
                </div>
                <div className="demo-stat">
                  <span className="demo-stat-label">{t('home.demoValueScore')}</span>
                  <span className="demo-stat-value">6.5 <span className="demo-stat-sub">/ 10</span></span>
                </div>
              </div>
            </div>
          </div>
          <div className="demo-cta fade-up" style={{ transitionDelay: '200ms' }}>
            <Link to="/examples" className="btn-outline">{t('home.viewExamples')}</Link>
          </div>
        </div>
      </section>

      {/* ── Social Proof ── */}
      <section className="social-proof">
        <div className="container">
          <div className="stats-row">
            <div className="stat-item fade-up" style={{ transitionDelay: '0ms' }}>
              <p className="stat-value">12,847</p>
              <p className="stat-label">{t('home.stat1Label')}</p>
            </div>
            <div className="stat-divider" />
            <div className="stat-item fade-up" style={{ transitionDelay: '100ms' }}>
              <p className="stat-value">3,420</p>
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
