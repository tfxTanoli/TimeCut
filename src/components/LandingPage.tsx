import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { InputTab } from '../types'
import Footer from './Footer'

const LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Arabic',
  'Portuguese', 'Chinese', 'Japanese', 'Turkish', 'Italian',
]

interface Props {
  onSubmit: (tab: InputTab, value: string | File, language: string) => void
  isLoading: boolean
  error: string | null
}

export default function LandingPage({ onSubmit, isLoading, error }: Props) {
  const [activeTab, setActiveTab] = useState<InputTab>('text')
  const [textValue, setTextValue] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [language, setLanguage] = useState('English')
  const fileRef = useRef<HTMLInputElement>(null)

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
          <span className="hero-badge">Time Intelligence Engine</span>
          <h1 className="hero-title">
            Don't Waste Time on<br />
            <span className="hero-accent">Low-Value Content</span>
          </h1>
          <p className="hero-subtitle">
            Our AI detects what's truly worth your attention.<br />
            Know the value before you spend your time.
          </p>

          {/* Input card */}
          <form className="input-card" onSubmit={handleSubmit}>
            <div className="input-tabs">
              <button
                type="button"
                className={`tab-btn ${activeTab === 'text' ? 'tab-btn--active' : ''}`}
                onClick={() => setActiveTab('text')}
              >
                <IconDoc /> Paste Text
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'pdf' ? 'tab-btn--active' : ''}`}
                onClick={() => setActiveTab('pdf')}
              >
                <IconUpload /> Upload PDF
              </button>
            </div>

            <div className="input-body">
              {activeTab === 'text' && (
                <textarea
                  className="text-area"
                  placeholder="Paste any content here — article, email, video description, book chapter..."
                  value={textValue}
                  onChange={e => setTextValue(e.target.value)}
                  rows={6}
                  disabled={isLoading}
                />
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
                          Remove
                        </span>
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="pdf-drop-title">Click to select a PDF file</p>
                      <p className="pdf-drop-hint">Max 10 MB</p>
                    </>
                  )}
                  <input ref={fileRef} type="file" accept=".pdf" hidden onChange={e => setPdfFile(e.target.files?.[0] ?? null)} />
                </div>
              )}

              <div className="input-footer">
                <select className="lang-select" value={language} onChange={e => setLanguage(e.target.value)} disabled={isLoading}>
                  {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                </select>
                <button type="submit" className="btn-primary btn-cta" disabled={!canSubmit}>
                  {isLoading ? 'Analyzing...' : 'Save My Time'}
                </button>
              </div>
            </div>

            {error && <p className="error-banner">{error}</p>}

            <p className="trust-line">
              <IconShield /> Instant Time Intelligence Report &nbsp;•&nbsp; No sign up required
            </p>
          </form>
        </div>
      </section>

      {/* ── Feature Cards ── */}
      <section className="features">
        <div className="container">
          <p className="section-eyebrow">Why TimeCut?</p>
          <h2 className="section-title">Save Time. Protect Attention.</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon feature-icon--purple"><IconClock /></div>
              <h3>Save Time</h3>
              <p>Know exactly how many minutes you can safely skip before you even start reading.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon feature-icon--amber"><IconTarget /></div>
              <h3>Clear Decisions</h3>
              <p>Get a definitive verdict — Must Read, Skim Only, or Skip It — backed by AI analysis.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon feature-icon--green"><IconShieldCheck /></div>
              <h3>Protect Attention</h3>
              <p>Identify fluff, repetition, and low-value filler so you only absorb what matters.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Demo Section ── */}
      <section className="demo">
        <div className="container">
          <p className="section-eyebrow">Live Example</p>
          <h2 className="demo-title">See TimeCut in Action</h2>
          <div className="demo-card">
            <div className="demo-input">
              <p className="demo-label">INPUT</p>
              <p className="demo-field-label">Paste Text</p>
              <p className="demo-url demo-url--text">
                "Most people waste 2–3 hours daily on content that adds no real value to their work or life.
                Here are 10 productivity habits that will change everything..."
              </p>
            </div>
            <div className="demo-arrow"></div>
            <div className="demo-output">
              <p className="demo-label">RESULT PREVIEW</p>
              <div className="demo-results">
                <span className="verdict-badge verdict-badge--skim">SKIM ONLY</span>
                <div className="demo-stat">
                  <span className="demo-stat-label">Time Saved</span>
                  <span className="demo-stat-value">18 mins</span>
                </div>
                <div className="demo-stat">
                  <span className="demo-stat-label">Value Score</span>
                  <span className="demo-stat-value">6.5 <span className="demo-stat-sub">/10</span></span>
                </div>
              </div>
            </div>
          </div>
          <div className="demo-cta">
            <Link to="/examples" className="btn-outline">View Full Examples</Link>
          </div>
        </div>
      </section>

      {/* ── Social Proof ── */}
      <section className="social-proof">
        <div className="container">
          <div className="stats-row">
            <div className="stat-item">
              <p className="stat-value">50,000+</p>
              <p className="stat-label">Reports Generated</p>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <p className="stat-value">10 Languages</p>
              <p className="stat-label">Supported</p>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <p className="stat-value">GPT-4o</p>
              <p className="stat-label">Powered By</p>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <p className="stat-value">~15 sec</p>
              <p className="stat-label">Analysis Time</p>
            </div>
          </div>
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
