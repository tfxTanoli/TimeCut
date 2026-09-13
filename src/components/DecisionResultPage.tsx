import { useState, useRef, useEffect } from 'react'
import type { DecisionReport, RiskItem, RankedDocument, EvidenceItem, MissingInfoItem, VerificationQuestion, RecommendedAction, NegotiationSuggestion, WeakEvidenceItem, DecisionPlaybook, OverallDecision, SkippedDocument } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { useAuthModal } from '../contexts/AuthModalContext'
import { useTranslation } from '../hooks/useTranslation'
import { logActivity } from '../lib/userService'
import { challengeAI } from '../api'
import ReportFeedback from './ReportFeedback'

/* ── Client-side field normalization ───────────────────────────────────────
   GPT-4o sometimes returns snake_case or variant field names. We normalize
   here so every report renders correctly regardless of exact key names.
   ─────────────────────────────────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nm(item: any, ...keys: string[]): string {
  for (const k of keys) {
    const v = item?.[k]
    if (v && typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeMissing(raw: any[]): MissingInfoItem[] {
  return (raw ?? []).map((m, i) => {
    if (typeof m === 'string' && m.trim()) {
      return { title: m.trim(), whyItMatters: '', action: '', evidence: 'Not found' }
    }
    return {
      title:        nm(m, 'title', 'name', 'item', 'topic', 'category', 'information', 'requirement') || `Item ${i + 1}`,
      whyItMatters: nm(m, 'whyItMatters', 'why_it_matters', 'why', 'importance', 'impact', 'significance', 'reason'),
      action:       nm(m, 'action', 'recommended_action', 'recommendation', 'next_step', 'steps', 'advice', 'suggestion'),
      evidence:     nm(m, 'evidence', 'evidence_status', 'status', 'availability', 'found', 'present'),
    }
  })
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeRisks(raw: any[]): RiskItem[] {
  return (raw ?? []).map(r => ({
    description: nm(r, 'description', 'risk', 'text', 'detail') || '—',
    severity:    (r?.severity ?? 'Medium') as RiskItem['severity'],
    reasoning:   Array.isArray(r?.reasoning) ? r.reasoning : (Array.isArray(r?.reasons) ? r.reasons : []),
  }))
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeEvidence(raw: any[]): EvidenceItem[] {
  return (raw ?? []).map(e => ({
    section:    nm(e, 'section', 'area', 'topic', 'name') || 'Document reference',
    page:       e?.page ?? e?.page_number ?? undefined,
    clause:     e?.clause ?? e?.clause_reference ?? undefined,
    confidence: typeof e?.confidence === 'number' ? e.confidence : (typeof e?.confidence_score === 'number' ? e.confidence_score : undefined),
    context:    nm(e, 'context', 'surrounding_text', 'excerpt', 'text') || undefined,
    document:   nm(e, 'document', 'document_name', 'source', 'file') || undefined,
  }))
}
/**
 * Verdict to show when the report carries none.
 *
 * The server normalizes `overall_decision` onto every report, so this is a
 * fallback rather than the usual path — but it must never reduce to
 * `confidence_score`, which measures certainty about the analysis and not the
 * quality of the deal. Mirrors deriveOverallDecision() in api/_lib/shared.ts,
 * duplicated across the API/browser build boundary the same way planConfig is.
 */
function deriveOverallDecision(report: DecisionReport): OverallDecision {
  const risks = report.hidden_risks ?? []
  const high = risks.filter(r => r.severity === 'High').length
  const medium = risks.filter(r => r.severity === 'Medium').length
  const missing = (report.missing_information ?? []).length
  if (high >= 2) return 'Do Not Proceed'
  if (high === 1) return 'Proceed with Caution'
  if (medium >= 1 || missing >= 1) return 'Proceed with Caution'
  return 'Proceed'
}

function normalizeReport(report: DecisionReport): DecisionReport {
  return {
    ...report,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    missing_information: normalizeMissing(report.missing_information as any),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hidden_risks: normalizeRisks(report.hidden_risks as any),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    evidence_found: normalizeEvidence(report.evidence_found as any),
    verification_questions: (report.verification_questions ?? []).filter(
      (q: VerificationQuestion) => q.question
    ),
    recommended_actions: (report.recommended_actions ?? []).filter(
      (a: RecommendedAction) => a.action
    ),
    negotiation_suggestions: (report.negotiation_suggestions ?? []).filter(
      (n: NegotiationSuggestion) => n.clause
    ),
    weak_evidence: (report.weak_evidence ?? []).filter(
      (w: WeakEvidenceItem) => w.claim
    ),
    interview_red_flags: Array.isArray(report.interview_red_flags) ? report.interview_red_flags : [],
  }
}

interface Props {
  report: DecisionReport
  onBack: () => void
  language?: string
  uploadedFiles?: File[]
  decisionGoal?: string
  /**
   * Firestore id of the saved copy. Present once the report has been persisted,
   * which is what lets the page offer a permanent link to itself — a report used
   * to exist only in memory and vanished on the next navigation.
   */
  reportId?: string | null
  /** Label for the back button when this was opened from somewhere else. */
  backLabelKey?: string
}

/* ── Inline icons ── */
function IconShield({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}
function IconList({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}
function IconTarget({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  )
}
function IconAlertTriangle({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}
function IconBook({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}
function IconChevronDown({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
function IconCheckGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}
function IconStar({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}
function IconMessageCircle({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
function IconSend() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}
function IconArrowRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  )
}
function IconLock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

/* ── Section card wrapper ── */
function SectionCard({ icon, title, className = '', badge, children }: {
  icon: React.ReactNode; title: string; className?: string; badge?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className={`dr-section-card ${className}`}>
      <div className="dr-section-header">
        <span className="dr-section-icon">{icon}</span>
        <h3 className="dr-section-title">{title}</h3>
        {badge && <span className="dr-section-badge">{badge}</span>}
      </div>
      <div className="dr-section-body">{children}</div>
    </div>
  )
}

/* ── Truncation notice ───────────────────────────────────────────────────────
   Documents longer than their character budget are analysed only up to that
   point. Saying so is part of the product being trustworthy: a reader who
   believes a 40-page contract was reviewed in full, when it was not, is worse
   off than one who knows to check the rest themselves.
*/
function TruncationNotice({ names }: { names?: string[] }) {
  const { t } = useTranslation()
  if (!names || names.length === 0) return null
  const one = names.length === 1
  return (
    <div className="dr-truncation-notice" role="status">
      <span className="dr-truncation-icon" aria-hidden="true">⚠</span>
      <div>
        <p className="dr-truncation-title">
          {one
            ? t('report.truncatedTitleOne')
            : t('report.truncatedTitleMany').replace('{n}', String(names.length))}
        </p>
        <p className="dr-truncation-body">
          {t(one ? 'report.truncatedBodyOne' : 'report.truncatedBodyMany').replace('{names}', names.join(', '))}
        </p>
      </div>
    </div>
  )
}

/* ── Skipped-file notice ─────────────────────────────────────────────────────
   A file that could not be read — wrong type, a scan with no text, damaged —
   is left out of the analysis. The server used to log that and say nothing,
   so a report built from one of three uploads looked exactly like a report
   built from all three. It is stated before any finding now.
*/
function SkippedNotice({ items }: { items?: SkippedDocument[] }) {
  const { t } = useTranslation()
  if (!items || items.length === 0) return null
  return (
    <div className="dr-truncation-notice" role="alert">
      <span className="dr-truncation-icon" aria-hidden="true">⚠</span>
      <div>
        <p className="dr-truncation-title">
          {items.length === 1
            ? t('report.skippedTitleOne')
            : t('report.skippedTitleMany').replace('{n}', String(items.length))}
        </p>
        <p className="dr-truncation-body">{t('report.skippedBody')}</p>
        <ul className="dr-truncation-body">
          {items.map((s, i) => (
            <li key={i}><strong>{s.name}</strong> — {skipReason(s, t)}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** The reason in the reader's language when we have it, else the server's English. */
function skipReason(s: SkippedDocument, t: (k: string) => string): string {
  if (s.code) {
    const key = `report.skipReason_${s.code}`
    const translated = t(key)
    if (translated !== key) return translated
  }
  return s.reason
}

/* ── Executive Summary ── */
/** Star rating to show when the report carries no explicit decision_strength. */
const DECISION_STARS: Record<OverallDecision, number> = {
  'Proceed': 5,
  'Proceed with Caution': 3,
  'Do Not Proceed': 1,
}

/** The verdict is an English identifier on the wire; the UI localises it. */
const DECISION_STYLE: Record<OverallDecision, { emoji: string; color: string; labelKey: string }> = {
  'Proceed':              { emoji: '🟢', color: '#22C55E', labelKey: 'report.decisionProceed' },
  'Proceed with Caution': { emoji: '🟡', color: '#F59E0B', labelKey: 'report.decisionCaution' },
  'Do Not Proceed':       { emoji: '🔴', color: '#EF4444', labelKey: 'report.decisionStop' },
}

function ExecutiveSummary({ report, t }: { report: DecisionReport; t: (k: string) => string }) {
  const score = report.confidence_score
  // The verdict rates the deal; `confidence_score` rates the analysis. Deriving
  // it from the score, as this once did, turned a well-documented bad offer
  // into a green "Proceed" — the two are shown side by side but never conflated.
  const decision = report.overall_decision ?? deriveOverallDecision(report)
  const { emoji: decisionEmoji, color: decisionColor, labelKey } = DECISION_STYLE[decision]
  const decisionLabel = t(labelKey)

  const highCount = report.hidden_risks.filter(r => r.severity === 'High').length
  const medCount = report.hidden_risks.filter(r => r.severity === 'Medium').length
  const lowCount = report.hidden_risks.filter(r => r.severity === 'Low').length
  const bestOption = report.ranking[0]?.name ?? '—'
  const pages = report.pages_analyzed ?? 0
  const timeSaved = pages > 0
    ? t('report.hoursValue').replace('{n}', (Math.round(pages * 4 / 60 * 10) / 10).toFixed(1))
    : '—'

  return (
    <div className="dr-exec-summary">
      <div className="dr-exec-top">
        <div className="dr-exec-decision-block">
          <p className="dr-exec-eyebrow">{t('report.overallDecision')}</p>
          <div className="dr-exec-verdict">
            <span className="dr-exec-emoji">{decisionEmoji}</span>
            <span className="dr-exec-verdict-text" style={{ color: decisionColor }}>{decisionLabel}</span>
          </div>
        </div>
        <div className="dr-exec-quick-stats">
          <div className="dr-exec-qs-item">
            <span className="dr-exec-qs-val">{score}%</span>
            <span className="dr-exec-qs-label">{t('report.statConfidence')}</span>
          </div>
          <div className="dr-exec-qs-item dr-exec-qs-item--wide">
            <span className="dr-exec-qs-val dr-exec-qs-val--sm">{bestOption}</span>
            <span className="dr-exec-qs-label">{t('report.statBestOption')}</span>
          </div>
        </div>
      </div>

      {/* Risk breakdown dashboard */}
      <div className="dr-exec-risk-dashboard">
        <span className="dr-exec-risk-pill dr-exec-risk-pill--high">
          🔴 {t('report.pillHighRisk')} <strong>{highCount}</strong>
        </span>
        <span className="dr-exec-risk-pill dr-exec-risk-pill--medium">
          🟠 {t('report.pillMediumRisk')} <strong>{medCount}</strong>
        </span>
        <span className="dr-exec-risk-pill dr-exec-risk-pill--low">
          🟢 {t('report.pillLowRisk')} <strong>{lowCount}</strong>
        </span>
        <span className="dr-exec-risk-pill dr-exec-risk-pill--missing">
          ⚠ {t('report.pillMissingInfo')} <strong>{report.missing_information.length}</strong>
        </span>
        <span className="dr-exec-risk-pill dr-exec-risk-pill--evidence">
          📄 {t('report.pillEvidence')} <strong>{report.evidence_found.length}</strong>
        </span>
      </div>

      <div className="dr-exec-divider" />
      <div className="dr-exec-stats-row">
        {timeSaved !== '—' && (
          <div className="dr-exec-stat">
            <span className="dr-exec-stat-val">{timeSaved}</span>
            <span className="dr-exec-stat-label">{t('report.statTimeSaved')}</span>
          </div>
        )}
        <div className="dr-exec-stat">
          <span className="dr-exec-stat-val">{report.documents_analyzed}</span>
          <span className="dr-exec-stat-label">{t('report.statDocsCompared')}</span>
        </div>
        {pages > 0 && (
          <div className="dr-exec-stat">
            <span className="dr-exec-stat-val">{pages}</span>
            <span className="dr-exec-stat-label">{t('report.statPagesAnalyzed')}</span>
          </div>
        )}
        {report.compared_categories && (
          <div className="dr-exec-stat">
            <span className="dr-exec-stat-val">{report.compared_categories.length}</span>
            <span className="dr-exec-stat-label">{t('report.statCategoriesCompared')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── 1. Recommendation Card ── */
function RecommendationCard({
  recommendation, defense, whatWouldChange, t, onChallenge
}: {
  recommendation: string
  defense: string
  whatWouldChange?: string
  t: (k: string) => string
  onChallenge?: (q: string) => void
}) {
  return (
    <div className="dr-recommendation-card">
      <div className="dr-rec-header">
        <IconShield className="dr-rec-icon" />
        <span className="dr-rec-label">{t('report.recommendation')}</span>
      </div>
      <p className="dr-rec-text">{recommendation}</p>

      {defense && (
        <blockquote className="dr-rec-defense">{defense}</blockquote>
      )}

      {whatWouldChange && (
        <div className="dr-change-decision">
          <p className="dr-change-label">💡 {t('report.whatWouldChange')}</p>
          <p className="dr-change-text">{whatWouldChange}</p>
        </div>
      )}

      <div className="dr-rec-footer">
        <p className="dr-rec-disclaimer">{t('report.recommendationDisclaimer')}</p>
        {onChallenge && (
          <button
            className="dr-challenge-btn"
            onClick={() => onChallenge(t('report.challengeRecommendationQ'))}
          >
            <IconMessageCircle /> {t('report.challengeAi')}
          </button>
        )}
      </div>
    </div>
  )
}

/* ── 2. Ranking + Decision Strength (2-col) ── */
function RankingSection({ ranking, t }: { ranking: RankedDocument[]; t: (k: string) => string }) {
  const medals = ['🥇', '🥈', '🥉']
  return (
    <SectionCard icon={<IconList />} title={t('report.ranking')}>
      <div className="dr-ranking-list">
        {ranking.map((doc) => (
          <div key={doc.rank} className="dr-ranking-item">
            <span className="dr-rank-medal">{medals[doc.rank - 1] ?? `#${doc.rank}`}</span>
            <div className="dr-rank-info">
              <p className="dr-rank-name">{doc.name}</p>
              <p className="dr-rank-summary">{doc.summary}</p>
            </div>
            <span className="dr-rank-num">#{doc.rank}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

/* ── Decision Strength card ── */
function DecisionStrengthCard({ report, t }: { report: DecisionReport; t: (k: string) => string }) {
  const pct = Math.min(Math.max(report.confidence_score, 0), 100)
  // The gauge is a confidence gauge, so it stays keyed to the score.
  const color = pct >= 70 ? '#22C55E' : pct >= 40 ? '#F59E0B' : '#EF4444'
  // The label underneath is the verdict on the deal, not a restatement of the
  // gauge — it reads from the same field as the Executive Summary so the two
  // cards cannot contradict each other.
  const decision = report.overall_decision ?? deriveOverallDecision(report)
  const decisionLabel = t(DECISION_STYLE[decision].labelKey)
  const decisionColor = DECISION_STYLE[decision].color
  // When the model gives no decision_strength, fall back to the verdict rather
  // than to confidence/20 as this once did — that put five gold stars beside a
  // red "Do Not Proceed" whenever the analysis was merely certain.
  const stars = report.decision_strength ?? DECISION_STARS[decision]
  const clampedStars = Math.min(5, Math.max(1, stars))

  const breakdown = report.confidence_breakdown

  const radius = 38
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (pct / 100) * circumference

  return (
    <SectionCard icon={<IconTarget />} title={t('report.decisionStrength')}>
      <div className="dr-strength-top">
        <div className="dr-strength-gauge">
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r={radius} fill="none" stroke="#1F2937" strokeWidth="9" />
            <circle
              cx="48" cy="48" r={radius} fill="none"
              stroke={color} strokeWidth="9"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform="rotate(-90 48 48)"
              style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
            <text x="48" y="44" textAnchor="middle" fill="#FFFFFF" fontSize="18" fontWeight="700">{pct}</text>
            <text x="48" y="58" textAnchor="middle" fill="#6B7280" fontSize="10">/ 100</text>
          </svg>
        </div>
        <div className="dr-strength-right">
          <p className="dr-strength-decision" style={{ color: decisionColor }}>{decisionLabel}</p>
          <div className="dr-strength-stars" style={{ color: '#F59E0B' }}>
            {[1, 2, 3, 4, 5].map(n => <IconStar key={n} filled={n <= clampedStars} />)}
          </div>
          <p className="dr-strength-reason">
            {report.decision_strength_reason ?? report.confidence_rationale}
          </p>
        </div>
      </div>

      {breakdown && (
        <div className="dr-confidence-breakdown">
          <p className="dr-breakdown-label">{t('report.confidenceBasedOn')}</p>
          {[
            { label: t('report.cbDocumentCompleteness'), value: breakdown.document_completeness },
            { label: t('report.cbEvidenceConsistency'), value: breakdown.evidence_consistency },
            { label: t('report.cbRiskSeverity'), value: breakdown.risk_severity },
            { label: t('report.cbMissingInformation'), value: breakdown.missing_information },
          ].map(({ label, value }) => {
            const barColor = value >= 70 ? '#22C55E' : value >= 40 ? '#F59E0B' : '#EF4444'
            return (
              <div key={label} className="dr-breakdown-row">
                <span className="dr-breakdown-name">{label}</span>
                <div className="dr-breakdown-bar-track">
                  <div
                    className="dr-breakdown-bar-fill"
                    style={{ width: `${value}%`, background: barColor }}
                  />
                </div>
                <span className="dr-breakdown-pct" style={{ color: barColor }}>{value}%</span>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

/* ── What Was Compared ── */
function WhatWasCompared({ categories }: { categories: string[] }) {
  const { t } = useTranslation()
  const n = String(categories.length)
  return (
    <SectionCard
      icon={<IconCheckGrid />}
      title={t('report.whatWasCompared')}
      badge={t('report.categoriesBadge').replace('{n}', n)}
    >
      <div className="dr-compared-grid">
        {categories.map((cat, i) => (
          <div key={i} className="dr-compared-item">
            <span className="dr-compared-check">✓</span>
            <span className="dr-compared-label">{cat}</span>
          </div>
        ))}
      </div>
      <p className="dr-compared-footer">{t('report.comparedFooter').replace('{n}', n)}</p>
    </SectionCard>
  )
}

/* ── Severity badge ── */
const SEVERITY_CLASS: Record<string, string> = {
  High: 'dr-severity--high',
  Medium: 'dr-severity--medium',
  Low: 'dr-severity--low',
}

/* ── 3. Hidden Risks (enhanced with breakdown + per-risk reasoning) ── */
function HiddenRisks({ risks, t, onChallenge }: {
  risks: RiskItem[]
  t: (k: string) => string
  onChallenge?: (q: string) => void
}) {
  const [openReasoning, setOpenReasoning] = useState<number | null>(null)

  const highCount = risks.filter(r => r.severity === 'High').length
  const medCount = risks.filter(r => r.severity === 'Medium').length
  const lowCount = risks.filter(r => r.severity === 'Low').length

  return (
    <SectionCard icon={<IconAlertTriangle className="dr-icon--warning" />} title={t('report.hiddenRisks')}>
      {/* Visual risk breakdown header */}
      {risks.length > 0 && (
        <div className="dr-risk-breakdown">
          {highCount > 0 && <span className="dr-rb-pill dr-rb-pill--high">🔴 {t('report.pillHighRisk')} <strong>{highCount}</strong></span>}
          {medCount > 0 && <span className="dr-rb-pill dr-rb-pill--medium">🟠 {t('report.pillMediumRisk')} <strong>{medCount}</strong></span>}
          {lowCount > 0 && <span className="dr-rb-pill dr-rb-pill--low">🟢 {t('report.pillLowRisk')} <strong>{lowCount}</strong></span>}
        </div>
      )}

      <div className="dr-risk-list">
        {risks.length === 0
          ? <p className="dr-empty">{t('report.noRisksFound')}</p>
          : risks.map((r, i) => (
            <div key={i} className="dr-risk-item-card">
              <div className="dr-risk-item-top">
                <span className={`dr-severity-badge ${SEVERITY_CLASS[r.severity] ?? ''}`}>{t(`report.severity${r.severity}`)}</span>
                <p className="dr-risk-desc">{r.description}</p>
              </div>

              {/* Per-risk AI Reasoning collapsible */}
              {r.reasoning && r.reasoning.length > 0 && (
                <div className="dr-risk-reasoning-block">
                  <button
                    className="dr-risk-reasoning-toggle"
                    onClick={() => setOpenReasoning(openReasoning === i ? null : i)}
                  >
                    <span>🧠 {t('report.whyFlagged')}</span>
                    <IconChevronDown open={openReasoning === i} />
                  </button>
                  {openReasoning === i && (
                    <ul className="dr-risk-reasoning-list">
                      {r.reasoning.map((point, j) => (
                        <li key={j} className="dr-risk-reasoning-item">
                          <span className="dr-risk-reasoning-dot" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {onChallenge && (
                <button
                  className="dr-challenge-inline-btn"
                  onClick={() => onChallenge(
                    t('report.challengeRiskQ')
                      .replace('{severity}', t(`report.severity${r.severity}`))
                      .replace('{risk}', r.description.length > 80 ? `${r.description.slice(0, 80)}…` : r.description),
                  )}
                >
                  {t('report.challengeAi')} <IconArrowRight />
                </button>
              )}
            </div>
          ))
        }
      </div>
    </SectionCard>
  )
}

const EVIDENCE_COLOR: Record<string, string> = {
  'Not found': '#EF4444',
  'Unclear': '#F59E0B',
  'Partially mentioned': '#FB923C',
}
const EVIDENCE_BG: Record<string, string> = {
  'Not found': 'rgba(239,68,68,0.12)',
  'Unclear': 'rgba(245,158,11,0.12)',
  'Partially mentioned': 'rgba(251,146,60,0.12)',
}

/** The model reports evidence status as an English identifier; show it translated. */
function evidenceLabel(evidence: string, t: (k: string) => string): string {
  if (evidence?.startsWith('Not found')) return t('report.evidenceNotFound')
  if (evidence?.startsWith('Partially mentioned')) return t('report.evidencePartial')
  if (evidence?.startsWith('Unclear')) return t('report.evidenceUnclear')
  return evidence
}

/* ── 4. Missing Information ── */
function MissingInformation({ items, t }: { items: MissingInfoItem[]; t: (k: string) => string }) {
  return (
    <SectionCard icon={<IconSearch className="dr-icon--blue" />} title={t('report.missingInfo')}>
      {items.length === 0
        ? <p className="dr-empty">{t('report.noMissingInfo')}</p>
        : (
          <div className="dr-missing-list">
            {items.map((item, i) => {
              const evidenceKey = Object.keys(EVIDENCE_COLOR).find(k => item.evidence?.startsWith(k)) ?? ''
              const evidenceColor = EVIDENCE_COLOR[evidenceKey] ?? '#6B7280'
              const evidenceBg = EVIDENCE_BG[evidenceKey] ?? 'rgba(107,114,128,0.12)'
              return (
                <div key={i} className="dr-missing-item">
                  <div className="dr-missing-header">
                    <span className="dr-missing-icon">⚠</span>
                    <span className="dr-missing-title">{item.title}</span>
                    <span className="dr-missing-evidence-badge" style={{ color: evidenceColor, background: evidenceBg }}>
                      {evidenceLabel(item.evidence, t)}
                    </span>
                  </div>
                  <div className="dr-missing-details">
                    <div className="dr-missing-row">
                      <span className="dr-missing-key">{t('report.whyItMatters')}</span>
                      <span className="dr-missing-val">{item.whyItMatters}</span>
                    </div>
                    <div className="dr-missing-row">
                      <span className="dr-missing-key">{t('report.recommendedAction')}</span>
                      <span className="dr-missing-val">{item.action}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      }
    </SectionCard>
  )
}

/* ── 5. Evidence Found (enhanced with confidence, context, view original) ── */
function EvidenceFound({ evidence, uploadedFiles, t }: {
  evidence: EvidenceItem[]
  uploadedFiles?: File[]
  t: (k: string) => string
}) {
  const [expandedContext, setExpandedContext] = useState<number | null>(null)
  const [viewError, setViewError] = useState<string | null>(null)

  // One object URL per file for the life of this page, released on unmount.
  // A new URL used to be created on every click and never revoked, keeping a
  // copy of the file alive for as long as the tab stayed open.
  const objectUrls = useRef(new Map<File, string>())
  useEffect(() => {
    const urls = objectUrls.current
    return () => {
      urls.forEach(url => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  /**
   * The uploaded PDF an evidence item points at, if it is still available.
   * Only an exact name match counts: falling back to the first upload used to
   * open a different document at a page number that belonged to another file.
   */
  function originalFor(e: EvidenceItem): File | undefined {
    if (!uploadedFiles || uploadedFiles.length === 0 || !e.page) return undefined
    const file = e.document
      ? uploadedFiles.find(f => f.name === e.document)
      : uploadedFiles.length === 1 ? uploadedFiles[0] : undefined
    return file && file.name.toLowerCase().endsWith('.pdf') ? file : undefined
  }

  function handleViewOriginal(e: EvidenceItem) {
    setViewError(null)
    const file = originalFor(e)
    if (!file) { setViewError(t('report.viewOriginalMissing')); return }
    let url = objectUrls.current.get(file)
    if (!url) {
      url = URL.createObjectURL(file)
      objectUrls.current.set(file, url)
    }
    const pageNum = e.page ? parseInt(e.page, 10) : 1
    const opened = window.open(`${url}#page=${isNaN(pageNum) ? 1 : pageNum}`, '_blank')
    // A blocked pop-up used to fail with no sign that anything had happened.
    if (!opened) setViewError(t('report.viewOriginalBlocked'))
  }

  return (
    <SectionCard icon={<IconBook className="dr-icon--blue" />} title={t('report.evidenceFound')}>
      {evidence.length === 0
        ? <p className="dr-empty">{t('report.noEvidence')}</p>
        : (
          <>
          {viewError && <p className="dr-empty" role="status">{viewError}</p>}
          <div className="dr-evidence-cards">
            {evidence.map((e, i) => (
              <div key={i} className="dr-evidence-card">
                <div className="dr-evidence-card-top">
                  <div className="dr-evidence-card-meta">
                    <span className="dr-evidence-doc-icon">📄</span>
                    <div className="dr-evidence-card-info">
                      <span className="dr-evidence-section">{e.section || t('report.evidenceUnstructured')}</span>
                      <span className="dr-evidence-ref">
                        {e.page && t('report.pageRef').replace('{n}', e.page)}{e.page && e.clause && ' · '}{e.clause && `§ ${e.clause}`}
                        {e.document && <span className="dr-evidence-doc-name"> — {e.document}</span>}
                      </span>
                    </div>
                  </div>
                  <div className="dr-evidence-card-right">
                    {e.confidence !== undefined && (
                      <span className="dr-evidence-confidence"
                        style={{ color: e.confidence >= 80 ? '#22C55E' : e.confidence >= 60 ? '#F59E0B' : '#EF4444' }}>
                        {t('report.confidencePct').replace('{n}', String(e.confidence))}
                      </span>
                    )}
                    <div className="dr-evidence-card-actions">
                      {e.context && (
                        <button
                          className="dr-evidence-action-btn"
                          onClick={() => setExpandedContext(expandedContext === i ? null : i)}
                        >
                          {expandedContext === i ? t('report.hideContext') : t('report.showContext')}
                          <IconChevronDown open={expandedContext === i} />
                        </button>
                      )}
                      {originalFor(e) && (
                        <button className="dr-evidence-view-btn" onClick={() => handleViewOriginal(e)}>
                          {t('report.viewOriginal')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {expandedContext === i && e.context && (
                  <div className="dr-evidence-context">
                    <p className="dr-evidence-context-text">{e.context}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
          </>
        )
      }
    </SectionCard>
  )
}

/* ── Locked section placeholder ──
   Shown where the plan does not include a section. The server strips the
   section's data from the response entirely, so this is a genuine upsell for
   content the account did not receive — not a UI-only hide. */
function LockedSection({
  icon, title, blurb, cta,
}: { icon: string; title: string; blurb: string; cta?: string }) {
  const { t } = useTranslation()
  return (
    <div className="dr-section-card dr-locked-section">
      <div className="dr-section-header">
        <span className="dr-section-icon">{icon}</span>
        <h3 className="dr-section-title">{title}</h3>
        <span className="dr-pro-badge"><IconLock /> {t('report.paidPlanBadge')}</span>
      </div>
      <div className="dr-section-body">
        <p className="dr-locked-text">{blurb}</p>
        <a href="/pricing" className="dr-ifiwy-upgrade-btn">{cta ?? t('report.upgradeToUnlock')}</a>
      </div>
    </div>
  )
}

/* ── If I Were You (Pro) ── */
// The server omits `text` for plans without the advisor, so a missing value is
// expected here rather than a sign the section should disappear — non-Pro
// plans still see the locked prompt below.
function IfIWereYou({ text, isPro }: { text?: string; isPro: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="dr-if-i-were-you">
      <div className="dr-section-header">
        <span className="dr-section-icon">🧑‍💼</span>
        <h3 className="dr-section-title">{t('report.ifIWereYou')}</h3>
        {!isPro && <span className="dr-pro-badge"><IconLock /> {t('report.proBadge')}</span>}
      </div>
      {isPro && text ? (
        // Pro user — show the consultant advice
        <p className="dr-ifiwy-text">{text}</p>
      ) : isPro && !text ? (
        // Pro user but AI didn't return this field — reassure them
        <p className="dr-ifiwy-unavailable">{t('report.ifIWereYouUnavailable')}</p>
      ) : (
        // Free / Starter user — show upgrade prompt
        <div className="dr-ifiwy-locked">
          <p className="dr-ifiwy-locked-text">{t('report.ifIWereYouLocked')}</p>
          <a href="/pricing" className="dr-ifiwy-upgrade-btn">{t('report.upgradeToPro')}</a>
        </div>
      )}
    </div>
  )
}

/* ── Before You Sign Checklist ── */
function BeforeSigningChecklist({ items }: { items: string[] }) {
  const { t } = useTranslation()
  const [checked, setChecked] = useState<Record<number, boolean>>({})

  function toggle(i: number) {
    setChecked(prev => ({ ...prev, [i]: !prev[i] }))
  }

  const doneCount = Object.values(checked).filter(Boolean).length

  return (
    <div className="dr-section-card">
      <div className="dr-section-header">
        <span className="dr-section-icon">✅</span>
        <h3 className="dr-section-title">{t('report.beforeYouSign')}</h3>
        {items.length > 0 && (
          <span className="dr-section-badge">
            {t('report.doneCount').replace('{done}', String(doneCount)).replace('{total}', String(items.length))}
          </span>
        )}
      </div>
      <div className="dr-checklist">
        {items.map((item, i) => (
          <label key={i} className={`dr-checklist-item${checked[i] ? ' dr-checklist-item--done' : ''}`}>
            <input
              type="checkbox"
              className="dr-checklist-checkbox"
              checked={!!checked[i]}
              onChange={() => toggle(i)}
            />
            <span className="dr-checklist-text">{item}</span>
          </label>
        ))}
        {items.length === 0 && <p className="dr-empty">{t('report.noChecklist')}</p>}
      </div>
    </div>
  )
}

/* ── Challenge AI Panel ── */
interface ChatMessage {
  role: 'user' | 'ai'
  text: string
  /** Set when the answer was refused for quota reasons — shows an upgrade link. */
  upgrade?: boolean
}

/** Translation keys for the suggested starter questions, per document type. */
const SUGGESTED_QUESTION_KEYS_BY_TYPE: Record<string, string[]> = {
  cv: ['report.sqCv1', 'report.sqCv2', 'report.sqHighestRisk', 'report.sqCv4'],
  supplier_quotation: ['report.sqSupplier1', 'report.sqNegotiate', 'report.sqHighestRisk', 'report.sqEmail'],
  contract: ['report.sqContract1', 'report.sqNegotiate', 'report.sqHighestRisk', 'report.sqEmail'],
  business_proposal: ['report.sqHighestRisk', 'report.sqChangeMine', 'report.sqNegotiate', 'report.sqStrongest'],
  general: ['report.sqGeneral1', 'report.sqStrongest', 'report.sqGeneral3', 'report.sqGeneral4', 'report.sqChangeYours'],
}
function getSuggestedQuestions(docType: string | undefined, t: (k: string) => string): string[] {
  const keys = SUGGESTED_QUESTION_KEYS_BY_TYPE[docType ?? 'general'] ?? SUGGESTED_QUESTION_KEYS_BY_TYPE.general
  return keys.map(k => t(k))
}

/* ── Decision Assistant context ──────────────────────────────────────────────
   The report is re-sent with every question, so its size is a recurring cost,
   not a one-off. These ceilings mirror MAX_ASSISTANT_CONTEXT_CHARS in
   api/_lib/aiConfig.ts, which enforces the same limit server-side — the browser
   is not trusted to be the only thing bounding what we send to OpenAI.
*/
/** Mirrors MAX_ASSISTANT_QUESTION_CHARS in api/_lib/assistant.ts. */
const ASSISTANT_QUESTION_MAX_CHARS = 1000
const ASSISTANT_CONTEXT_MAX_ITEMS = 5
const ASSISTANT_CONTEXT_MAX_FIELD = 300

function clip(text: string | undefined | null, max = ASSISTANT_CONTEXT_MAX_FIELD): string {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
 * Serialise the parts of a report the Assistant actually reasons over.
 *
 * The arrays are bounded *before* serialising rather than by cutting the
 * finished JSON string — truncating JSON mid-structure produces something
 * invalid that the model then has to guess its way through.
 */
function buildAssistantContext(report: DecisionReport): string {
  const context = {
    recommendation: clip(report.recommendation, 600),
    confidence_score: report.confidence_score,
    confidence_rationale: clip(report.confidence_rationale),
    ranking: (report.ranking ?? []).slice(0, ASSISTANT_CONTEXT_MAX_ITEMS).map(r => ({
      rank: r.rank,
      name: r.name,
      summary: clip(r.summary),
    })),
    hidden_risks: (report.hidden_risks ?? []).slice(0, ASSISTANT_CONTEXT_MAX_ITEMS).map(r => ({
      description: clip(r.description),
      severity: r.severity,
    })),
    missing_information: (report.missing_information ?? []).slice(0, ASSISTANT_CONTEXT_MAX_ITEMS).map(m => ({
      title: m.title,
      whyItMatters: clip(m.whyItMatters),
    })),
    evidence_found: (report.evidence_found ?? []).slice(0, ASSISTANT_CONTEXT_MAX_ITEMS).map(e => ({
      section: e.section,
      page: e.page,
      clause: e.clause,
      context: clip(e.context),
    })),
    decision_defense: clip(report.decision_defense, 600),
    what_would_change: clip(report.what_would_change, 600),
    decision_strength: report.decision_strength,
    compared_categories: report.compared_categories,
  }
  // No pretty-printing: indentation is pure token cost on every question asked.
  // Not cut to length here: slicing the string produced invalid JSON. The
  // server rebuilds the context from these fields and applies the ceiling.
  return JSON.stringify(context)
}

/** A question to place in the Assistant, raised from elsewhere in the report. */
interface ChallengeRequest {
  text: string
  /** Increments on every click, so asking the same question twice still applies. */
  id: number
}

function ChallengeAIPanel({ report, decisionGoal, reportId, request, t }: {
  report: DecisionReport
  decisionGoal?: string
  /** Saved report id; lets the server read the report instead of trusting the browser's copy. */
  reportId?: string | null
  request?: ChallengeRequest | null
  t: (k: string) => string
}) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const SUGGESTED_QUESTIONS = getSuggestedQuestions(report.document_type, t)

  // Open and pre-fill when a "Challenge AI" button elsewhere is pressed. This
  // used to call the parent's state setter during render, which React warns
  // about and which can loop. Remembering the last request handled is React's
  // documented way to respond to a prop change during render, and it only
  // touches this component's own state.
  const [handledRequestId, setHandledRequestId] = useState<number | null>(null)
  if (request && request.id !== handledRequestId) {
    setHandledRequestId(request.id)
    setOpen(true)
    setQuestion(request.text.slice(0, ASSISTANT_QUESTION_MAX_CHARS))
  }

  async function handleSend() {
    const q = question.trim()
    if (!q || loading) return

    setMessages(prev => [...prev, { role: 'user', text: q }])
    setQuestion('')
    setLoading(true)

    // The question quota and per-question credit charge are enforced by
    // /api/challenge-ai against the verified account — the browser cannot be
    // the place that decides whether a question is allowed.
    const reportContext = buildAssistantContext(report)

    try {
      const result = await challengeAI(q, reportContext, decisionGoal ?? '', reportId)

      // Quota and credit failures come back with a code so the panel can point
      // the user at the fix rather than showing a raw error.
      const answer =
        result.answer
        ?? (result.code === 'UNAUTHENTICATED' ? t('report.assistantSignIn') : result.error)
        ?? t('report.assistantNoAnswer')

      setMessages(prev => [...prev, {
        role: 'ai',
        text: answer,
        upgrade: result.code === 'ASSISTANT_LIMIT' || result.code === 'INSUFFICIENT_CREDITS',
      }])
    } catch (e) {
      // There was no catch here, so any network failure left the panel on
      // "Thinking…" forever: nothing ever cleared the loading flag.
      console.warn('[assistant] request failed:', e)
      setMessages(prev => [...prev, { role: 'ai', text: t('report.assistantNetworkError') }])
      // Give the question back so it can be sent again without retyping.
      setQuestion(current => current || q)
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={`dr-challenge-panel${open ? ' dr-challenge-panel--open' : ''}`}>
      <button
        className="dr-challenge-toggle"
        onClick={() => setOpen(o => !o)}
      >
        <IconMessageCircle />
        <span>{t('report.challengeTitle')}</span>
        <span className="dr-challenge-toggle-sub">{t('report.challengeSubtitle')}</span>
        <IconChevronDown open={open} />
      </button>

      {open && (
        <div className="dr-challenge-body">
          <p className="dr-challenge-intro">{t('report.challengeIntro')}</p>

          {messages.length === 0 && (
            <div className="dr-challenge-suggestions">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  className="dr-challenge-suggestion"
                  onClick={() => setQuestion(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {messages.length > 0 && (
            <div className="dr-challenge-messages">
              {messages.map((m, i) => (
                <div key={i} className={`dr-challenge-msg dr-challenge-msg--${m.role}`}>
                  <span className="dr-challenge-msg-badge">{m.role === 'user' ? t('report.chatYou') : t('report.chatAi')}</span>
                  <p className="dr-challenge-msg-text">{m.text}</p>
                  {m.upgrade && (
                    <a href="/pricing" className="dr-challenge-upgrade-link">{t('report.viewPlansLink')}</a>
                  )}
                </div>
              ))}
              {loading && (
                <div className="dr-challenge-msg dr-challenge-msg--ai">
                  <span className="dr-challenge-msg-badge">{t('report.chatAi')}</span>
                  <p className="dr-challenge-msg-text dr-challenge-typing">{t('report.thinking')}</p>
                </div>
              )}
            </div>
          )}

          <div className="dr-challenge-input-row">
            <textarea
              ref={inputRef}
              className="dr-challenge-input"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('report.challengePlaceholder')}
              rows={2}
              maxLength={ASSISTANT_QUESTION_MAX_CHARS}
              disabled={loading}
            />
            <button
              className="dr-challenge-send"
              onClick={handleSend}
              disabled={!question.trim() || loading}
            >
              <IconSend />
            </button>
          </div>
          <p className="dr-challenge-note">{t('report.challengeNote')}</p>
        </div>
      )}
    </div>
  )
}

/* ── Framework type helpers ──
   `label` and `expert` are translation keys. */
const FRAMEWORK_META: Record<string, { label: string; expert: string; icon: string; color: string }> = {
  cv: { label: 'report.fwCvLabel', expert: 'report.fwCvExpert', icon: '👤', color: '#3B82F6' },
  supplier_quotation: { label: 'report.fwSupplierLabel', expert: 'report.fwSupplierExpert', icon: '📦', color: '#F59E0B' },
  contract: { label: 'report.fwContractLabel', expert: 'report.fwContractExpert', icon: '📋', color: '#8B5CF6' },
  business_proposal: { label: 'report.fwProposalLabel', expert: 'report.fwProposalExpert', icon: '📊', color: '#10B981' },
  general: { label: 'report.fwGeneralLabel', expert: 'report.fwGeneralExpert', icon: '🧠', color: '#3B82F6' },
}

function getFrameworkMeta(docType?: string) {
  return FRAMEWORK_META[docType ?? 'general'] ?? FRAMEWORK_META.general
}

/** Translation key for the verification section heading. */
function getVerificationLabel(docType?: string): string {
  if (docType === 'cv') return 'report.vqCv'
  if (docType === 'supplier_quotation') return 'report.vqSupplier'
  if (docType === 'contract') return 'report.vqContract'
  if (docType === 'business_proposal') return 'report.vqProposal'
  return 'report.vqGeneral'
}

/* ── Expert Framework Badge ── */
function ExpertFrameworkBadge({ docType }: { docType?: string }) {
  const { t } = useTranslation()
  const meta = getFrameworkMeta(docType)
  return (
    <div className="dr-framework-badge" style={{ borderColor: `${meta.color}40`, background: `${meta.color}12` }}>
      <span className="dr-framework-icon">{meta.icon}</span>
      <div className="dr-framework-info">
        <span className="dr-framework-label" style={{ color: meta.color }}>{t(meta.label)}</span>
        <span className="dr-framework-expert">{t('report.analyzedBy').replace('{expert}', t(meta.expert))}</span>
      </div>
    </div>
  )
}

/* ── Stage 2: Verification Questions ── */
function VerificationQuestionsSection({ questions, docType }: { questions: VerificationQuestion[]; docType?: string }) {
  const { t } = useTranslation()
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  if (!questions || questions.length === 0) return null

  const label = t(getVerificationLabel(docType))
  const isCV = docType === 'cv'

  return (
    <div className="dr-section-card dr-verification-section">
      <div className="dr-section-header">
        <span className="dr-section-icon">🎯</span>
        <h3 className="dr-section-title">{label}</h3>
        <span className="dr-section-badge">{t('report.questionsCount').replace('{n}', String(questions.length))}</span>
      </div>
      <div className="dr-section-body">
        {isCV && (
          <p className="dr-verification-intro">{t('report.vqCvIntro')}</p>
        )}
        <div className="dr-vq-list">
          {questions.map((q, i) => (
            <div key={i} className="dr-vq-item">
              <button
                className="dr-vq-header"
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
              >
                <span className="dr-vq-num">{i + 1}</span>
                <span className="dr-vq-question">{q.question}</span>
                <IconChevronDown open={openIdx === i} />
              </button>
              {openIdx === i && (
                <div className="dr-vq-body">
                  {q.strong_answer_should_include && q.strong_answer_should_include.length > 0 && (
                    <div className="dr-vq-block dr-vq-block--strong">
                      <p className="dr-vq-block-label">✅ {t('report.strongAnswer')}</p>
                      <ul className="dr-vq-block-list">
                        {q.strong_answer_should_include.map((item, j) => (
                          <li key={j} className="dr-vq-block-item">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {q.red_flags && q.red_flags.length > 0 && (
                    <div className="dr-vq-block dr-vq-block--red">
                      <p className="dr-vq-block-label">🚩 {t('report.redFlagsWatch')}</p>
                      <ul className="dr-vq-block-list">
                        {q.red_flags.map((flag, j) => (
                          <li key={j} className="dr-vq-block-item">{flag}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {q.why_it_matters && (
                    <div className="dr-vq-block dr-vq-block--why">
                      <p className="dr-vq-block-label">💡 {t('report.whyQuestionMatters')}</p>
                      <p className="dr-vq-block-text">{q.why_it_matters}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Interview Red Flags (CV only) ── */
function InterviewRedFlagsSection({ flags }: { flags: string[] }) {
  const { t } = useTranslation()
  if (!flags || flags.length === 0) return null
  return (
    <div className="dr-section-card dr-interview-flags-section">
      <div className="dr-section-header">
        <span className="dr-section-icon">🚩</span>
        <h3 className="dr-section-title">{t('report.interviewRedFlags')}</h3>
        <span className="dr-section-badge">{t('report.flagsCount').replace('{n}', String(flags.length))}</span>
      </div>
      <div className="dr-section-body">
        <p className="dr-verification-intro">{t('report.interviewFlagsIntro')}</p>
        <ul className="dr-flags-list">
          {flags.map((flag, i) => (
            <li key={i} className="dr-flags-item">
              <span className="dr-flags-dot">🔴</span>
              <span>{flag}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ── Stage 3: Recommended Actions ── */
function RecommendedActionsSection({ actions }: { actions: RecommendedAction[] }) {
  const { t } = useTranslation()
  if (!actions || actions.length === 0) return null

  const priorityConfig = {
    High: { color: '#EF4444', bg: 'rgba(239,68,68,0.12)', label: t('report.priorityHigh') },
    Medium: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', label: t('report.priorityMedium') },
    Low: { color: '#22C55E', bg: 'rgba(34,197,94,0.12)', label: t('report.priorityLow') },
  }

  return (
    <div className="dr-section-card dr-actions-section">
      <div className="dr-section-header">
        <span className="dr-section-icon">⚡</span>
        <h3 className="dr-section-title">{t('report.recommendedActions')}</h3>
        <span className="dr-section-badge">{t('report.stepsCount').replace('{n}', String(actions.length))}</span>
      </div>
      <div className="dr-section-body">
        <div className="dr-actions-list">
          {actions.map((action, i) => {
            const cfg = priorityConfig[action.priority] ?? priorityConfig.Medium
            return (
              <div key={i} className="dr-action-item">
                <div className="dr-action-top">
                  <span className="dr-action-num">{i + 1}</span>
                  <p className="dr-action-text">{action.action}</p>
                  <span className="dr-action-priority" style={{ color: cfg.color, background: cfg.bg }}>
                    {cfg.label}
                  </span>
                </div>
                {action.reason && (
                  <p className="dr-action-reason">{action.reason}</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── Stage 4: Negotiation Suggestions ── */
function NegotiationSuggestionsSection({ suggestions, docType }: { suggestions: NegotiationSuggestion[]; docType?: string }) {
  // Hooks have to run in the same order on every render, so this sits above the
  // early returns below — previously it was skipped whenever the section had
  // nothing to show, which is exactly the case React cannot recover from.
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const { t } = useTranslation()

  if (!suggestions || suggestions.length === 0) return null

  const title = docType === 'cv'
    ? ''
    : docType === 'business_proposal' ? t('report.negotiationProposal') : t('report.negotiationSuggestions')
  if (!title) return null

  return (
    <div className="dr-section-card dr-negotiation-section">
      <div className="dr-section-header">
        <span className="dr-section-icon">🤝</span>
        <h3 className="dr-section-title">{title}</h3>
        <span className="dr-section-badge">{t('report.pointsCount').replace('{n}', String(suggestions.length))}</span>
      </div>
      <div className="dr-section-body">
        <div className="dr-neg-list">
          {suggestions.map((s, i) => (
            <div key={i} className="dr-neg-item">
              <button className="dr-neg-header" onClick={() => setOpenIdx(openIdx === i ? null : i)}>
                <span className="dr-neg-clause">{s.clause}</span>
                <IconChevronDown open={openIdx === i} />
              </button>
              {openIdx === i && (
                <div className="dr-neg-body">
                  {s.issue && (
                    <div className="dr-neg-row">
                      <span className="dr-neg-key">{t('report.negIssue')}</span>
                      <span className="dr-neg-val">{s.issue}</span>
                    </div>
                  )}
                  {s.suggested_improvement && (
                    <div className="dr-neg-row dr-neg-row--suggest">
                      <span className="dr-neg-key">{t('report.negRequest')}</span>
                      <span className="dr-neg-val dr-neg-val--suggest">{s.suggested_improvement}</span>
                    </div>
                  )}
                  {s.leverage && (
                    <div className="dr-neg-row">
                      <span className="dr-neg-key">{t('report.negLeverage')}</span>
                      <span className="dr-neg-val dr-neg-val--leverage">{s.leverage}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Weak Evidence (Proposal only) ── */
function WeakEvidenceSection({ items }: { items: WeakEvidenceItem[] }) {
  const { t } = useTranslation()
  if (!items || items.length === 0) return null
  return (
    <div className="dr-section-card dr-weak-evidence-section">
      <div className="dr-section-header">
        <span className="dr-section-icon">⚠️</span>
        <h3 className="dr-section-title">{t('report.weakEvidence')}</h3>
        <span className="dr-section-badge">{t('report.claimsCount').replace('{n}', String(items.length))}</span>
      </div>
      <div className="dr-section-body">
        <p className="dr-verification-intro">{t('report.weakEvidenceIntro')}</p>
        <div className="dr-we-list">
          {items.map((item, i) => (
            <div key={i} className="dr-we-item">
              <div className="dr-we-claim">
                <span className="dr-we-icon">💬</span>
                <p className="dr-we-claim-text">"{item.claim}"</p>
              </div>
              <div className="dr-we-details">
                {item.issue && (
                  <div className="dr-we-row">
                    <span className="dr-we-key">{t('report.whyWeak')}</span>
                    <span className="dr-we-val">{item.issue}</span>
                  </div>
                )}
                {item.recommendation && (
                  <div className="dr-we-row dr-we-row--rec">
                    <span className="dr-we-key">{t('report.evidenceNeeded')}</span>
                    <span className="dr-we-val dr-we-val--rec">{item.recommendation}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Stage 5: Decision Playbook ── */
function DecisionPlaybookSection({ playbook, docType }: { playbook: DecisionPlaybook; docType?: string }) {
  const { t } = useTranslation()
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  if (!playbook || !playbook.final_recommendation) return null

  const doneCount = Object.values(checked).filter(Boolean).length
  const total = playbook.action_checklist?.length ?? 0

  const decisionLabels: Record<string, { color: string; bg: string }> = {
    hire: { color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
    approve: { color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
    sign: { color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
    award: { color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
    conditional: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
    negotiate: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
    caution: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
    reject: { color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
    'do not': { color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
    not: { color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  }

  const finalRecLower = playbook.final_recommendation.toLowerCase()
  const matchedKey = Object.keys(decisionLabels).find(k => finalRecLower.includes(k))
  const decisionStyle = matchedKey ? decisionLabels[matchedKey] : { color: '#9CA3AF', bg: 'rgba(156,163,175,0.1)' }

  const sectionTitle = t(docType === 'cv'
    ? 'report.playbookCv'
    : docType === 'supplier_quotation'
      ? 'report.playbookSupplier'
      : docType === 'contract'
        ? 'report.playbookContract'
        : docType === 'business_proposal'
          ? 'report.playbookProposal'
          : 'report.playbookGeneric')

  return (
    <div className="dr-section-card dr-playbook-section">
      <div className="dr-section-header">
        <span className="dr-section-icon">📖</span>
        <h3 className="dr-section-title">{sectionTitle}</h3>
      </div>
      <div className="dr-section-body">
        {/* Final Recommendation */}
        <div className="dr-playbook-final" style={{ background: decisionStyle.bg, borderColor: `${decisionStyle.color}40` }}>
          <p className="dr-playbook-final-label">{t('report.finalRecommendation')}</p>
          <p className="dr-playbook-final-text" style={{ color: decisionStyle.color }}>
            {playbook.final_recommendation}
          </p>
        </div>

        <div className="dr-playbook-grid">
          {/* Key Reasons */}
          {playbook.key_reasons && playbook.key_reasons.length > 0 && (
            <div className="dr-playbook-block">
              <p className="dr-playbook-block-label">✅ {t('report.keyReasons')}</p>
              <ul className="dr-playbook-block-list">
                {playbook.key_reasons.map((r, i) => (
                  <li key={i} className="dr-playbook-block-item dr-playbook-block-item--green">{r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Remaining Risks */}
          {playbook.remaining_risks && playbook.remaining_risks.length > 0 && (
            <div className="dr-playbook-block">
              <p className="dr-playbook-block-label">⚠️ {t('report.remainingRisks')}</p>
              <ul className="dr-playbook-block-list">
                {playbook.remaining_risks.map((r, i) => (
                  <li key={i} className="dr-playbook-block-item dr-playbook-block-item--orange">{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Action Checklist */}
        {playbook.action_checklist && playbook.action_checklist.length > 0 && (
          <div className="dr-playbook-checklist">
            <p className="dr-playbook-block-label">
              {t('report.actionChecklist')}
              <span className="dr-playbook-checklist-count">
                {' — '}{t('report.doneCount').replace('{done}', String(doneCount)).replace('{total}', String(total))}
              </span>
            </p>
            {playbook.action_checklist.map((item, i) => (
              <label key={i} className={`dr-checklist-item${checked[i] ? ' dr-checklist-item--done' : ''}`}>
                <input
                  type="checkbox"
                  className="dr-checklist-checkbox"
                  checked={!!checked[i]}
                  onChange={() => setChecked(prev => ({ ...prev, [i]: !prev[i] }))}
                />
                <span className="dr-checklist-text">{item}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Bullet list with an empty-state fallback. Defined at module scope, not inside
 * ExecutiveDecisionPackage — a component created during render is a brand-new
 * type on every pass, so React unmounts and remounts the whole subtree each
 * time instead of updating it.
 */
function Bullets({ items, fallback }: { items: string[]; fallback: string }) {
  if (!items.length) return <p className="edp-answer edp-answer--muted">{fallback}</p>
  return (
    <ul className="edp-bullets">
      {items.map((it, i) => (
        <li key={i} className="edp-bullet"><span className="edp-bullet-mark">›</span>{it}</li>
      ))}
    </ul>
  )
}

/* ── Executive Decision Package (closing summary of the 8 decision questions) ── */
function ExecutiveDecisionPackage({
  report,
  t,
  onContinue,
}: {
  report: DecisionReport
  t: (k: string) => string
  onContinue: () => void
}) {
  const SEV_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 }

  // 2 — Why this recommendation
  const why = report.decision_defense?.trim() || report.confidence_rationale?.trim() || ''

  // 3 — Biggest remaining concerns (highest-severity risks first)
  const concerns = [...report.hidden_risks]
    .sort((a, b) => (SEV_RANK[a.severity] ?? 3) - (SEV_RANK[b.severity] ?? 3))
    .slice(0, 3)
    .map(r => r.description)

  // 4 — Verify before deciding
  const verify = (
    report.before_signing_checklist?.length
      ? report.before_signing_checklist
      : report.verification_questions?.length
        ? report.verification_questions.map(q => q.question)
        : report.missing_information.map(m => m.title)
  ).slice(0, 4)

  // 5 — Next actions
  const actions = (
    report.recommended_actions?.length
      ? report.recommended_actions.map(a => a.action)
      : report.before_signing_checklist ?? []
  ).slice(0, 4)

  // 6 — Questions to ask
  const questions = (
    report.smart_skeptic_questions?.length
      ? report.smart_skeptic_questions
      : report.verification_questions?.map(q => q.question) ?? []
  ).slice(0, 4)

  // 7 — What could change the recommendation
  const whatChanges = report.what_would_change?.trim() || ''

  // 8 — Decision readiness
  const conf = report.confidence_score ?? 0
  const strength = report.decision_strength
  const readiness = strength ? Math.round((conf + strength * 20) / 2) : conf
  const readyLabel =
    readiness >= 70 ? t('report.edpReadyHigh') : readiness >= 45 ? t('report.edpReadyMid') : t('report.edpReadyLow')
  const readyColor = readiness >= 70 ? '#22C55E' : readiness >= 45 ? '#F59E0B' : '#EF4444'

  return (
    <section className="edp-card">
      <div className="edp-header">
        <span className="edp-eyebrow">{t('report.edpEyebrow')}</span>
        <h2 className="edp-title">{t('report.edpTitle')}</h2>
        <p className="edp-subtitle">{t('report.edpSubtitle')}</p>
      </div>

      <div className="edp-grid">
        {/* 1 — The recommendation */}
        <div className="edp-item edp-item--highlight">
          <div className="edp-item-head"><span className="edp-num">1</span><span className="edp-icon">✅</span><h3 className="edp-q">{t('report.edpQ1')}</h3></div>
          <p className="edp-answer edp-answer--rec">{report.recommendation}</p>
        </div>

        {/* 2 — Why */}
        <div className="edp-item">
          <div className="edp-item-head"><span className="edp-num">2</span><span className="edp-icon">💡</span><h3 className="edp-q">{t('report.edpQ2')}</h3></div>
          <p className="edp-answer">{why || t('report.edpNoneGeneric')}</p>
        </div>

        {/* 3 — Concerns */}
        <div className="edp-item">
          <div className="edp-item-head"><span className="edp-num">3</span><span className="edp-icon">⚠️</span><h3 className="edp-q">{t('report.edpQ3')}</h3></div>
          <Bullets items={concerns} fallback={t('report.edpNoneConcerns')} />
        </div>

        {/* 4 — Verify */}
        <div className="edp-item">
          <div className="edp-item-head"><span className="edp-num">4</span><span className="edp-icon">🔍</span><h3 className="edp-q">{t('report.edpQ4')}</h3></div>
          <Bullets items={verify} fallback={t('report.edpNoneVerify')} />
        </div>

        {/* 5 — Next actions */}
        <div className="edp-item">
          <div className="edp-item-head"><span className="edp-num">5</span><span className="edp-icon">🎯</span><h3 className="edp-q">{t('report.edpQ5')}</h3></div>
          <Bullets items={actions} fallback={t('report.edpNoneGeneric')} />
        </div>

        {/* 6 — Questions to ask */}
        <div className="edp-item">
          <div className="edp-item-head"><span className="edp-num">6</span><span className="edp-icon">❓</span><h3 className="edp-q">{t('report.edpQ6')}</h3></div>
          <Bullets items={questions} fallback={t('report.edpNoneGeneric')} />
        </div>

        {/* 7 — What could change this */}
        <div className="edp-item">
          <div className="edp-item-head"><span className="edp-num">7</span><span className="edp-icon">🔄</span><h3 className="edp-q">{t('report.edpQ7')}</h3></div>
          <p className="edp-answer">{whatChanges || t('report.edpNoneGeneric')}</p>
        </div>

        {/* 8 — Readiness */}
        <div className="edp-item edp-item--readiness">
          <div className="edp-item-head"><span className="edp-num">8</span><span className="edp-icon">📊</span><h3 className="edp-q">{t('report.edpQ8')}</h3></div>
          <div className="edp-readiness">
            <div className="edp-readiness-top">
              <span className="edp-readiness-pct" style={{ color: readyColor }}>{readiness}%</span>
              <span className="edp-readiness-label" style={{ color: readyColor }}>{readyLabel}</span>
            </div>
            <div className="edp-readiness-track">
              <div className="edp-readiness-fill" style={{ width: `${readiness}%`, background: readyColor }} />
            </div>
          </div>
        </div>
      </div>

      {/* Continue this decision → Decision Advisor */}
      <div className="edp-continue">
        <div className="edp-continue-text">
          <p className="edp-continue-title">{t('report.edpContinueTitle')}</p>
          <p className="edp-continue-sub">{t('report.edpContinueSub')}</p>
        </div>
        <button className="edp-continue-btn" onClick={onContinue}>
          {t('report.edpContinueCta')}
        </button>
      </div>
    </section>
  )
}

/* ── Decision Readiness (standalone, end-of-report) ── */
function DecisionReadinessSection({ report, t }: { report: DecisionReport; t: (k: string) => string }) {
  const [checked, setChecked] = useState<Record<number, boolean>>({})

  function toggle(i: number) {
    setChecked(prev => ({ ...prev, [i]: !prev[i] }))
  }

  const conf = report.confidence_score ?? 0
  const strength = report.decision_strength
  const readiness = strength ? Math.round((conf + strength * 20) / 2) : conf
  const readyLabel =
    readiness >= 70 ? t('report.edpReadyHigh') : readiness >= 45 ? t('report.edpReadyMid') : t('report.edpReadyLow')
  const readyColor = readiness >= 70 ? '#22C55E' : readiness >= 45 ? '#F59E0B' : '#EF4444'

  const verifyItems =
    report.before_signing_checklist?.length
      ? report.before_signing_checklist
      : report.verification_questions?.length
        ? report.verification_questions.map(q => q.question)
        : report.missing_information.map(m => m.title)

  const doneCount = Object.values(checked).filter(Boolean).length

  return (
    <div className="dr-section-card">
      <div className="dr-section-header">
        <span className="dr-section-icon">📊</span>
        <h3 className="dr-section-title">{t('report.readinessTitle')}</h3>
        {verifyItems.length > 0 && (
          <span className="dr-section-badge">
            {t('report.doneCount').replace('{done}', String(doneCount)).replace('{total}', String(verifyItems.length))}
          </span>
        )}
      </div>
      <div className="dr-section-body">
        <p className="dr-readiness-sub">{t('report.readinessSub')}</p>
        <div className="edp-readiness">
          <div className="edp-readiness-top">
            <span className="edp-readiness-pct" style={{ color: readyColor }}>{readiness}%</span>
            <span className="edp-readiness-label" style={{ color: readyColor }}>{readyLabel}</span>
          </div>
          <div className="edp-readiness-track">
            <div className="edp-readiness-fill" style={{ width: `${readiness}%`, background: readyColor }} />
          </div>
        </div>
        <div className="dr-checklist">
          {verifyItems.map((item, i) => (
            <label key={i} className={`dr-checklist-item${checked[i] ? ' dr-checklist-item--done' : ''}`}>
              <input
                type="checkbox"
                className="dr-checklist-checkbox"
                checked={!!checked[i]}
                onChange={() => toggle(i)}
              />
              <span className="dr-checklist-text">{item}</span>
            </label>
          ))}
          {verifyItems.length === 0 && <p className="dr-empty">{t('report.readinessEmpty')}</p>}
        </div>
      </div>
    </div>
  )
}

/* ── Main component ── */
// Plan entitlements come from AuthContext (config-driven) rather than a prop,
// so the report and the rest of the app can never disagree about what the
// account includes.
export default function DecisionResultPage({ report: rawReport, onBack, language, uploadedFiles, decisionGoal, reportId, backLabelKey }: Props) {
  const report = normalizeReport(rawReport)
  const { user, features } = useAuth()
  const { openSignup } = useAuthModal()
  const { t } = useTranslation()
  // Share is switched off for now — see the commented-out handleShare below.
  // const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [authPrompt, setAuthPrompt] = useState<'download' | 'upgrade' | null>(null)
  const [challengeRequest, setChallengeRequest] = useState<ChallengeRequest | null>(null)

  // Which premium sections this account actually receives. Driven by
  // config/plans, and matched by the server, which omits the underlying data
  // for anything not included.
  const canExport = features.export
  const canSeeAdvisor = features.advisor

  function handleDownload() {
    if (!user) { setAuthPrompt('download'); return }
    // Export is a paid feature; the Free plan lists it as excluded.
    if (!canExport) { setAuthPrompt('upgrade'); return }
    logActivity(user.uid, 'report_downloaded', {})
    window.print()
  }

  /* ── Share: disabled until it is implemented properly ─────────────────────
     The button only copied a plain-text summary to the clipboard, despite a
     share icon that promised a link someone else could open. It is hidden (see
     the commented-out button in the nav) and kept here for the future
     implementation, which needs a genuinely shareable, access-controlled link.

  function handleShare() {
    if (!user) { setAuthPrompt('share'); return }
    const text = [
      `${t('report.title')}`,
      '',
      `${t('report.overallDecision')}: ${t(DECISION_STYLE[report.overall_decision ?? deriveOverallDecision(report)].labelKey)}`,
      '',
      `${t('report.recommendation')}: ${report.recommendation}`,
      '',
      `${t('report.confidenceScore')}: ${report.confidence_score}/100`,
      `${report.confidence_rationale}`,
      '',
      `${t('report.hiddenRisks')} (${report.hidden_risks.length}):`,
      ...report.hidden_risks.map(r => `- [${r.severity}] ${r.description}`),
    ].join('\n')
    copyText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        logActivity(user.uid, 'report_shared', {}).catch(() => {})
      })
      .catch(e => {
        // Clipboard access is refused on insecure origins and in some mobile
        // browsers. The button used to reject silently and look broken.
        console.warn('[report] clipboard copy failed:', e)
        window.alert(t('result.copyFailed'))
      })
  }
  ── end of disabled Share ── */

  /** Copy the permanent link to this saved report. */
  function handleCopyLink() {
    if (!reportId) return
    copyText(`${window.location.origin}/report/${reportId}`)
      .then(() => {
        setLinkCopied(true)
        setTimeout(() => setLinkCopied(false), 2000)
      })
      .catch(e => {
        console.warn('[report] link copy failed:', e)
        window.alert(t('result.copyFailed'))
      })
  }

  function handleChallenge(q: string) {
    setChallengeRequest(prev => ({ text: q, id: (prev?.id ?? 0) + 1 }))
    setTimeout(() => {
      document.getElementById('dr-challenge-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  function handleContinueDecision() {
    document.getElementById('dr-challenge-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const hasComparedCategories = report.compared_categories && report.compared_categories.length > 0
  const hasChecklist = report.before_signing_checklist && report.before_signing_checklist.length > 0
  const docType = report.document_type
  const hasVerificationQuestions = report.verification_questions && report.verification_questions.length > 0
  const hasInterviewFlags = report.interview_red_flags && report.interview_red_flags.length > 0
  const hasRecommendedActions = report.recommended_actions && report.recommended_actions.length > 0
  const hasNegotiationSuggestions = report.negotiation_suggestions && report.negotiation_suggestions.length > 0
  const hasWeakEvidence = report.weak_evidence && report.weak_evidence.length > 0
  const hasPlaybook = report.decision_playbook && !!report.decision_playbook.final_recommendation

  return (
    <div className="dr-page">
      {/* Nav */}
      <div className="result-nav">
        <div className="container result-nav-inner">
          <button className="back-btn" onClick={onBack}>{t(backLabelKey ?? 'result.backToHome')}</button>
          <h2 className="result-nav-title">{t('report.title')}</h2>
          <div className="result-nav-actions">
            <button
              className={`icon-btn icon-btn--download${!canExport ? ' icon-btn--locked' : ''}`}
              onClick={handleDownload}
              title={canExport ? undefined : t('report.exportLockedTitle')}
            >
              {canExport
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                : <IconLock />}
              {t('result.exportReport')}
            </button>
            {/* Share is hidden until a real shareable link exists (planned).
            <button className="icon-btn" onClick={handleShare}>
              {copied
                ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> {t('result.copied')}</>
                : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> {t('result.share')}</>
              }
            </button>
            */}
            {/* Only once the report has actually been saved — a link to a
                report that was never persisted would 404. */}
            {reportId && (
              <button className="icon-btn" onClick={handleCopyLink} title={t('result.copyLinkTitle')}>
                {linkCopied
                  ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> {t('result.copied')}</>
                  : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> {t('result.copyLink')}</>
                }
              </button>
            )}
          </div>
        </div>
      </div>

      {authPrompt && (
        <div className="auth-prompt-banner">
          <span className="auth-prompt-icon">🔒</span>
          <p className="auth-prompt-msg">
            {authPrompt === 'upgrade'
              ? t('result.exportUpgradePrompt')
              : t('result.downloadPrompt')}
          </p>
          <div className="auth-prompt-actions">
            {authPrompt === 'upgrade' ? (
              <a className="btn-primary btn-sm" href="/pricing">{t('result.viewPlans')}</a>
            ) : (
              <button className="btn-primary btn-sm" onClick={() => { setAuthPrompt(null); openSignup() }}>
                {t('result.signUpFree')}
              </button>
            )}
            <button className="auth-prompt-dismiss" onClick={() => setAuthPrompt(null)}>{t('result.dismiss')}</button>
          </div>
        </div>
      )}

      <div className="container dr-content">

        {/* Expert Framework Badge */}
        <ExpertFrameworkBadge docType={docType} />

        {/* Say so before the findings if a file was left out or only partly read */}
        <SkippedNotice items={report.skipped_documents} />
        <TruncationNotice names={report.truncated_documents} />

        {/* 1. Executive Summary */}
        <ExecutiveSummary report={report} t={t} />

        {/* 2. Recommendation */}
        <RecommendationCard
          recommendation={report.recommendation}
          defense={report.decision_defense}
          whatWouldChange={report.what_would_change}
          t={t}
          onChallenge={handleChallenge}
        />

        {/* Ranking + Decision Strength (2-col) */}
        <div className="dr-two-col">
          <RankingSection ranking={report.ranking} t={t} />
          <DecisionStrengthCard report={report} t={t} />
        </div>

        {/* What Was Compared (if available) */}
        {hasComparedCategories && (
          <WhatWasCompared categories={report.compared_categories!} />
        )}

        {/* 3. Hidden Risks */}
        <HiddenRisks risks={report.hidden_risks} t={t} onChallenge={handleChallenge} />

        {/* 4. Missing Information */}
        <MissingInformation items={report.missing_information} t={t} />

        {/* 5. Evidence Found */}
        <EvidenceFound evidence={report.evidence_found} uploadedFiles={uploadedFiles} t={t} />

        {/* If I Were You (Pro) */}
        <IfIWereYou text={report.if_i_were_you} isPro={canSeeAdvisor} />

        {/* ── STAGE 2: VERIFICATION (Smart Skeptic Questions) ── */}
        {features.skepticQuestions ? (
          hasVerificationQuestions && (
            <VerificationQuestionsSection
              questions={report.verification_questions!}
              docType={docType}
            />
          )
        ) : (
          <LockedSection
            icon="🕵️"
            title={t('report.skepticQuestions')}
            blurb={t('report.lockedSkepticBlurb')}
          />
        )}

        {/* Interview Red Flags (CV only) */}
        {hasInterviewFlags && (
          <InterviewRedFlagsSection flags={report.interview_red_flags!} />
        )}

        {/* ── STAGE 3: RECOMMENDED ACTIONS ── */}
        {hasRecommendedActions && (
          <RecommendedActionsSection actions={report.recommended_actions!} />
        )}

        {/* ── STAGE 4: NEGOTIATION ── */}
        {hasNegotiationSuggestions && (
          <NegotiationSuggestionsSection
            suggestions={report.negotiation_suggestions!}
            docType={docType}
          />
        )}

        {/* Weak Evidence (Proposal only) */}
        {hasWeakEvidence && (
          <WeakEvidenceSection items={report.weak_evidence!} />
        )}

        {/* Before You Sign Checklist */}
        {hasChecklist && (
          <BeforeSigningChecklist items={report.before_signing_checklist!} />
        )}

        {/* ── STAGE 5: DECISION PLAYBOOK ── */}
        {features.playbook ? (
          hasPlaybook && (
            <DecisionPlaybookSection
              playbook={report.decision_playbook!}
              docType={docType}
            />
          )
        ) : (
          <LockedSection
            icon="📘"
            title={t('report.playbookGeneric')}
            blurb={t('report.lockedPlaybookBlurb')}
          />
        )}

        {/* ── EXECUTIVE DECISION PACKAGE (closing summary) ── */}
        <ExecutiveDecisionPackage report={report} t={t} onContinue={handleContinueDecision} />

        {/* Decision Readiness */}
        <DecisionReadinessSection report={report} t={t} />

        {/* Decision Advisor (Challenge AI) */}
        <div id="dr-challenge-panel">
          <ChallengeAIPanel
            report={report}
            decisionGoal={decisionGoal}
            reportId={reportId}
            request={challengeRequest}
            t={t}
          />
        </div>

        {/* Help Make TimeCut Smarter — report feedback */}
        <ReportFeedback
          decisionGoal={decisionGoal}
          language={language}
          documentType={report.document_type}
        />

        {/* Legal disclaimer */}
        <div className="dr-disclaimer">
          <p>{t('report.legalDisclaimer')}</p>
        </div>

        {/* Bottom CTA */}
        <div className="bottom-banner">
          <div className="banner-left">
            <span className="banner-icon">🧠</span>
            <div>
              <p className="banner-title">{t('report.bannerTitle')}</p>
              <p className="banner-sub">{t('report.bannerSub')}</p>
            </div>
          </div>
          <button className="btn-primary btn-cta" onClick={onBack}>
            {t('report.analyzeAnother')}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Copy text to the clipboard, with a fallback for browsers and contexts where
 * the async Clipboard API is unavailable or blocked (insecure origins, some
 * mobile browsers, denied permissions). Rejects when neither route works, so
 * the caller can tell the user rather than appearing to do nothing.
 */
function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text)
  }
  return new Promise<void>((resolve, reject) => {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (ok) resolve()
      else reject(new Error('copy command rejected'))
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)))
    }
  })
}
