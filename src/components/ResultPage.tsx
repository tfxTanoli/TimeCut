import { useState } from 'react'
import type { TimeCutReport } from '../types'
import ScoreGauge from './ScoreGauge'
import { useAuth } from '../contexts/AuthContext'
import { useAuthModal } from '../contexts/AuthModalContext'
import { useTranslation } from '../hooks/useTranslation'
import { logActivity } from '../lib/userService'

interface Props {
  report: TimeCutReport
  onBack: () => void
  language?: string
}

const VERDICT_CLASS: Record<string, string> = {
  'MUST READ':          'verdict-badge--must',
  'HIGHLY RECOMMENDED': 'verdict-badge--highly',
  'GOOD READ':          'verdict-badge--good',
  'LIGHT READ':         'verdict-badge--light',
  'WORTH A GLANCE':     'verdict-badge--glance',
  'SKIM ONLY':          'verdict-badge--skim',
  'DEEP DIVE':          'verdict-badge--deep',
  'HIDDEN GEM':         'verdict-badge--gem',
  'MASTERPIECE':        'verdict-badge--masterpiece',
  'OVERRATED':          'verdict-badge--overrated',
  'SKIP IT':            'verdict-badge--skip',
  'TIME WASTER':        'verdict-badge--waster',
}

const VERDICT_KEY: Record<string, string> = {
  'MUST READ':          'result.verdictMustRead',
  'HIGHLY RECOMMENDED': 'result.verdictHighlyRecommended',
  'GOOD READ':          'result.verdictGoodRead',
  'LIGHT READ':         'result.verdictLightRead',
  'WORTH A GLANCE':     'result.verdictWorthAGlance',
  'SKIM ONLY':          'result.verdictSkimOnly',
  'DEEP DIVE':          'result.verdictDeepDive',
  'HIDDEN GEM':         'result.verdictHiddenGem',
  'MASTERPIECE':        'result.verdictMasterpiece',
  'OVERRATED':          'result.verdictOverrated',
  'SKIP IT':            'result.verdictSkipIt',
  'TIME WASTER':        'result.verdictTimeWaster',
}

export default function ResultPage({ report, onBack }: Props) {
  const { user } = useAuth()
  const { openSignup } = useAuthModal()
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [authPrompt, setAuthPrompt] = useState<'download' | 'share' | null>(null)

  function handleDownload() {
    if (!user) { setAuthPrompt('download'); return }
    logActivity(user.uid, 'report_downloaded', {
      verdict: report.verdict,
      valueScore: report.value_score,
      timeSavedMinutes: report.time_saved_minutes,
    })
    window.print()
  }

  function handleShare() {
    if (!user) { setAuthPrompt('share'); return }
    const text = `Time Intelligence Report\n\nVerdict: ${report.verdict}\n${report.verdict_description}\n\nValue Score: ${report.value_score}/10\nTime Saved: ${report.time_saved_minutes} mins\n\nFinal Decision:\n${report.final_decision}`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      logActivity(user.uid, 'report_shared', {
        verdict: report.verdict,
        valueScore: report.value_score,
      })
    })
  }

  const verdictClass = VERDICT_CLASS[report.verdict] ?? 'verdict-badge--skip'
  const verdictDisplay = t(VERDICT_KEY[report.verdict] ?? 'result.verdictSkipIt')

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
          <button className="back-btn" onClick={onBack}>{t('result.backToHome')}</button>
          <h2 className="result-nav-title">{t('result.title')}</h2>
          <div className="result-nav-actions">
            <button className="icon-btn" onClick={handleDownload}>{t('result.downloadReport')}</button>
            <button className="icon-btn" onClick={handleShare}>{copied ? `✓ ${t('result.copied')}` : t('result.share')}</button>
          </div>
        </div>
      </div>

      {authPrompt && (
        <div className="auth-prompt-banner">
          <span className="auth-prompt-icon">🔒</span>
          <p className="auth-prompt-msg">
            {authPrompt === 'download' ? t('result.downloadPrompt') : t('result.sharePrompt')}
          </p>
          <div className="auth-prompt-actions">
            <button className="btn-primary btn-sm" onClick={() => { setAuthPrompt(null); openSignup() }}>
              {t('result.signUpFree')}
            </button>
            <button className="auth-prompt-dismiss" onClick={() => setAuthPrompt(null)}>{t('result.dismiss')}</button>
          </div>
        </div>
      )}

      <div className="container result-content">
        {/* ── Verdict Card ── */}
        <div className="verdict-card">
          <div className="verdict-icon">
            <IconDoc />
          </div>
          <div className="verdict-body">
            <p className="verdict-eyebrow">{t('result.verdict')}</p>
            <h2 className={`verdict-title verdict-badge ${verdictClass}`}>{verdictDisplay}</h2>
            <p className="verdict-desc">{report.verdict_description}</p>
          </div>
          <ScoreGauge score={report.overall_value_score} label={t('result.overallValueScore')} />
        </div>

        {/* ── Metrics Row ── */}
        <div className="metrics-row">
          <div className="metric-card">
            <div className="metric-icon metric-icon--purple"><IconClock /></div>
            <div>
              <p className="metric-label">{t('result.timeSaved')}</p>
              <p className="metric-value">{report.time_saved_minutes} {t('result.timeSavedMins')}</p>
              <p className="metric-sub">{t('result.timeSavedSub')}</p>
              <p className="metric-enough">{t('result.enoughTime')}</p>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon metric-icon--amber"><IconStar /></div>
            <div>
              <p className="metric-label">{t('result.valueScore')}</p>
              <p className="metric-value">{report.value_score.toFixed(1)} <span className="metric-denom">/ 10</span></p>
              <p className="metric-sub">{t('result.valueSub')}</p>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon metric-icon--green"><IconPulse /></div>
            <div>
              <p className="metric-label">{t('result.attentionQuality')}</p>
              <p className={`metric-value ${attnClass}`}>{report.attention_quality}</p>
              <p className="metric-sub">{report.attention_quality_description}</p>
            </div>
          </div>
        </div>

        {/* ── Content Analysis Metrics ── */}
        <div className="content-analysis-row">
          <div className="ca-card">
            <p className="ca-label">{t('result.originalityDetected')}</p>
            <p className="ca-score">{(report.originality_score ?? 0).toFixed(1)}<span className="ca-denom"> / 10</span></p>
          </div>
          <div className="ca-card">
            <p className="ca-label">{t('result.evidenceDensity')}</p>
            <p className="ca-score">{(report.evidence_density ?? 0).toFixed(1)}<span className="ca-denom"> / 10</span></p>
          </div>
          <div className="ca-card">
            <p className="ca-label">{t('result.repetitionScore')}</p>
            <p className="ca-score">{(report.repetition_score ?? 0).toFixed(1)}<span className="ca-denom"> / 10</span></p>
            <p className="ca-hint">{t('result.repetitionHint')}</p>
          </div>
          <div className="ca-card">
            <p className="ca-label">{t('result.insightUniqueness')}</p>
            <p className="ca-score">{(report.insight_uniqueness ?? 0).toFixed(1)}<span className="ca-denom"> / 10</span></p>
          </div>
        </div>

        {/* ── Analysis Grid ── */}
        <div className="analysis-grid">
          <div className="analysis-card">
            <div className="analysis-header">
              <IconDoc className="analysis-icon analysis-icon--blue" />
              <p className="analysis-label">{t('result.whatAbout')}</p>
            </div>
            <p className="analysis-text">{report.what_this_is_about}</p>
          </div>
          <div className="analysis-card">
            <div className="analysis-header">
              <IconCheck className="analysis-icon analysis-icon--green" />
              <p className="analysis-label">{t('result.keyInsights')}</p>
            </div>
            <ul className="bullet-list">
              {report.key_insights.map((ins, i) => <li key={i}>{ins}</li>)}
            </ul>
          </div>
          <div className="analysis-card">
            <div className="analysis-header">
              <IconX className="analysis-icon analysis-icon--red" />
              <p className="analysis-label">{t('result.whatSkip')}</p>
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
              <p className="analysis-label">{t('result.bestFor')}</p>
            </div>
            <ul className="bullet-list">
              {report.best_for.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </div>
          <div className="bottom-card bottom-card--final">
            <div className="analysis-header">
              <IconDecision className="analysis-icon analysis-icon--purple" />
              <p className="analysis-label">{t('result.finalDecision')}</p>
            </div>
            <p className="analysis-text">{report.final_decision}</p>
          </div>
        </div>

        {/* ── Bottom Banner ── */}
        <div className="bottom-banner">
          <div className="banner-left">
            <span className="banner-icon">💜</span>
            <div>
              <p className="banner-title">{t('result.bannerTitle')}</p>
              <p className="banner-sub">{t('result.bannerSub')}</p>
            </div>
          </div>
          <button className="btn-primary btn-cta" onClick={onBack}>
            {t('result.analyzeAnother')}
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
