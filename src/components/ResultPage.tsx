import { useState } from 'react'
import type { TimeCutReport } from '../types'
import ScoreGauge from './ScoreGauge'

interface Props {
  report: TimeCutReport
  onBack: () => void
}

export default function ResultPage({ report, onBack }: Props) {
  const [copied, setCopied] = useState(false)

  function handleDownload() {
    window.print()
  }

  function handleShare() {
    const text = `Time Intelligence Report\n\nVerdict: ${report.verdict}\n${report.verdict_description}\n\nValue Score: ${report.value_score}/10\nTime Saved: ${report.time_saved_minutes} mins\n\nFinal Decision:\n${report.final_decision}`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const verdictClass =
    report.verdict === 'MUST READ'
      ? 'verdict-badge--must'
      : report.verdict === 'SKIM ONLY'
        ? 'verdict-badge--skim'
        : 'verdict-badge--skip'

  const attnClass =
    report.attention_quality === 'High'
      ? 'attn--high'
      : report.attention_quality === 'Medium'
        ? 'attn--medium'
        : 'attn--low'

  return (
    <div className="result-page">
      {/* ── Result Nav ── */}
      <div className="result-nav">
        <div className="container result-nav-inner">
          <button className="back-btn" onClick={onBack}>← Back to home</button>
          <h2 className="result-nav-title">TIME INTELLIGENCE REPORT</h2>
          <div className="result-nav-actions">
            <button className="icon-btn" onClick={handleDownload}>↓ Download Report</button>
            <button className="icon-btn" onClick={handleShare}>{copied ? '✓ Copied!' : '↗ Share'}</button>
          </div>
        </div>
      </div>

      <div className="container result-content">
        {/* ── Verdict Card ── */}
        <div className="verdict-card">
          <div className="verdict-icon">
            <IconDoc />
          </div>
          <div className="verdict-body">
            <p className="verdict-eyebrow">VERDICT</p>
            <h2 className={`verdict-title verdict-badge ${verdictClass}`}>{report.verdict}</h2>
            <p className="verdict-desc">{report.verdict_description}</p>
          </div>
          <ScoreGauge score={report.overall_value_score} label="OVERALL VALUE SCORE" />
        </div>

        {/* ── Metrics Row ── */}
        <div className="metrics-row">
          <div className="metric-card">
            <div className="metric-icon metric-icon--purple"><IconClock /></div>
            <div>
              <p className="metric-label">TIME SAVED</p>
              <p className="metric-value">{report.time_saved_minutes} mins</p>
              <p className="metric-sub">Estimated time you can safely skip</p>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon metric-icon--amber"><IconStar /></div>
            <div>
              <p className="metric-label">VALUE SCORE</p>
              <p className="metric-value">{report.value_score.toFixed(1)} <span className="metric-denom">/ 10</span></p>
              <p className="metric-sub">Based on information density, originality &amp; usefulness</p>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon metric-icon--green"><IconPulse /></div>
            <div>
              <p className="metric-label">ATTENTION QUALITY</p>
              <p className={`metric-value ${attnClass}`}>{report.attention_quality}</p>
              <p className="metric-sub">{report.attention_quality_description}</p>
            </div>
          </div>
        </div>

        {/* ── Analysis Grid ── */}
        <div className="analysis-grid">
          <div className="analysis-card">
            <div className="analysis-header">
              <IconDoc className="analysis-icon analysis-icon--blue" />
              <p className="analysis-label">WHAT THIS IS ABOUT</p>
            </div>
            <p className="analysis-text">{report.what_this_is_about}</p>
          </div>
          <div className="analysis-card">
            <div className="analysis-header">
              <IconCheck className="analysis-icon analysis-icon--green" />
              <p className="analysis-label">KEY INSIGHTS</p>
            </div>
            <ul className="bullet-list">
              {report.key_insights.map((ins, i) => <li key={i}>{ins}</li>)}
            </ul>
          </div>
          <div className="analysis-card">
            <div className="analysis-header">
              <IconX className="analysis-icon analysis-icon--red" />
              <p className="analysis-label">WHAT TO SKIP</p>
            </div>
            <ul className="bullet-list">
              {report.what_to_skip.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        </div>

        {/* ── Best For + Final Decision ── */}
        <div className="bottom-section">
          <div className="bottom-card">
            <div className="analysis-header">
              <IconUsers className="analysis-icon analysis-icon--purple" />
              <p className="analysis-label">BEST FOR</p>
            </div>
            <ul className="bullet-list">
              {report.best_for.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </div>
          <div className="bottom-card bottom-card--final">
            <div className="analysis-header">
              <IconDecision className="analysis-icon analysis-icon--purple" />
              <p className="analysis-label">FINAL DECISION</p>
            </div>
            <p className="analysis-text">{report.final_decision}</p>
          </div>
        </div>

        {/* ── Bottom Banner ── */}
        <div className="bottom-banner">
          <div className="banner-left">
            <span className="banner-icon">💜</span>
            <div>
              <p className="banner-title">You just saved time and protected your attention.</p>
              <p className="banner-sub">Focus on what truly matters.</p>
            </div>
          </div>
          <button className="btn-primary btn-cta" onClick={onBack}>
            Analyze Another
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Inline SVG Icons ── */
function IconDoc({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}
function IconClock() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  )
}
function IconStar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}
function IconPulse() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}
function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}
function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  )
}
function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
function IconDecision({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}
