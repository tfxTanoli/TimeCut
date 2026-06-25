import { useState } from 'react'
import type { DecisionReport, RiskItem, RankedDocument, EvidenceItem, MissingInfoItem } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { useAuthModal } from '../contexts/AuthModalContext'
import { useTranslation } from '../hooks/useTranslation'
import { logActivity } from '../lib/userService'

interface Props {
  report: DecisionReport
  onBack: () => void
  language?: string
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
function IconHelp({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
function IconBriefcase({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
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

/* ── Section card wrapper ── */
function SectionCard({ icon, title, className = '', children }: { icon: React.ReactNode; title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`dr-section-card ${className}`}>
      <div className="dr-section-header">
        <span className="dr-section-icon">{icon}</span>
        <h3 className="dr-section-title">{title}</h3>
      </div>
      <div className="dr-section-body">{children}</div>
    </div>
  )
}

/* ── 1. Recommendation Card ── */
function RecommendationCard({ recommendation, t }: { recommendation: string; t: (k: string) => string }) {
  return (
    <div className="dr-recommendation-card">
      <div className="dr-rec-header">
        <IconShield className="dr-rec-icon" />
        <span className="dr-rec-label">{t('report.recommendation')}</span>
      </div>
      <p className="dr-rec-text">{recommendation}</p>
      <p className="dr-rec-disclaimer">{t('report.recommendationDisclaimer')}</p>
    </div>
  )
}

/* ── 2. Ranking Section ── */
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

/* ── 3. Confidence Score ── */
function ConfidenceScore({ score, rationale, t }: { score: number; rationale: string; t: (k: string) => string }) {
  const pct = Math.min(Math.max(score, 0), 100)
  const color = pct >= 70 ? '#22C55E' : pct >= 40 ? '#F59E0B' : '#EF4444'
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (pct / 100) * circumference

  return (
    <SectionCard icon={<IconTarget />} title={t('report.confidenceScore')}>
      <div className="dr-confidence">
        <div className="dr-confidence-gauge">
          <svg width="110" height="110" viewBox="0 0 110 110">
            <circle cx="55" cy="55" r={radius} fill="none" stroke="#1F2937" strokeWidth="10" />
            <circle
              cx="55" cy="55" r={radius} fill="none"
              stroke={color} strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform="rotate(-90 55 55)"
              style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
            <text x="55" y="50" textAnchor="middle" fill="#FFFFFF" fontSize="22" fontWeight="700">{pct}</text>
            <text x="55" y="66" textAnchor="middle" fill="#6B7280" fontSize="11">/ 100</text>
          </svg>
        </div>
        <div className="dr-confidence-right">
          <p className="dr-confidence-label">{t('report.confidenceLabel')}</p>
          <p className="dr-confidence-rationale">{rationale}</p>
        </div>
      </div>
    </SectionCard>
  )
}

/* ── Severity badge ── */
const SEVERITY_CLASS: Record<string, string> = {
  High: 'dr-severity--high',
  Medium: 'dr-severity--medium',
  Low: 'dr-severity--low',
}

/* ── 4. Hidden Risks ── */
function HiddenRisks({ risks, t }: { risks: RiskItem[]; t: (k: string) => string }) {
  return (
    <SectionCard icon={<IconAlertTriangle className="dr-icon--warning" />} title={t('report.hiddenRisks')}>
      <div className="dr-risk-list">
        {risks.length === 0
          ? <p className="dr-empty">{t('report.noRisksFound')}</p>
          : risks.map((r, i) => (
            <div key={i} className="dr-risk-item">
              <span className={`dr-severity-badge ${SEVERITY_CLASS[r.severity] ?? ''}`}>{t(`report.severity${r.severity}`)}</span>
              <p className="dr-risk-desc">{r.description}</p>
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

/* ── 5. Missing Information ── */
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
                    <span
                      className="dr-missing-evidence-badge"
                      style={{ color: evidenceColor, background: evidenceBg }}
                    >
                      {item.evidence}
                    </span>
                  </div>
                  <div className="dr-missing-details">
                    <div className="dr-missing-row">
                      <span className="dr-missing-key">Why It Matters</span>
                      <span className="dr-missing-val">{item.whyItMatters}</span>
                    </div>
                    <div className="dr-missing-row">
                      <span className="dr-missing-key">Recommended Action</span>
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

/* ── 6. Smart Skeptic Questions ── */
function SmartSkepticQuestions({ questions, t }: { questions: string[]; t: (k: string) => string }) {
  return (
    <SectionCard icon={<IconHelp className="dr-icon--purple" />} title={t('report.skepticQuestions')}>
      <div className="dr-questions-list">
        {questions.map((q, i) => (
          <div key={i} className="dr-question-item">
            <span className="dr-question-num">{i + 1}</span>
            <p className="dr-question-text">{q}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

/* ── 7. Decision Defense ── */
function DecisionDefense({ defense, t }: { defense: string; t: (k: string) => string }) {
  return (
    <SectionCard icon={<IconBriefcase className="dr-icon--green" />} title={t('report.decisionDefense')}>
      <p className="dr-defense-label">{t('report.defenseLabel')}</p>
      <blockquote className="dr-defense-blockquote">{defense}</blockquote>
    </SectionCard>
  )
}

/* ── 8. Evidence Found ── */
function EvidenceFound({ evidence, t }: { evidence: EvidenceItem[]; t: (k: string) => string }) {
  return (
    <SectionCard icon={<IconBook className="dr-icon--blue" />} title={t('report.evidenceFound')}>
      {evidence.length === 0
        ? <p className="dr-empty">{t('report.noEvidence')}</p>
        : (
          <div className="dr-evidence-table">
            <div className="dr-evidence-head">
              <span>{t('report.evidenceSection')}</span>
              <span>{t('report.evidencePage')}</span>
              <span>{t('report.evidenceClause')}</span>
            </div>
            {evidence.map((e, i) => (
              <div key={i} className="dr-evidence-row">
                <span className="dr-evidence-cell">{e.section || t('report.evidenceUnstructured')}</span>
                <span className="dr-evidence-cell dr-evidence-muted">{e.page ?? '—'}</span>
                <span className="dr-evidence-cell dr-evidence-muted">{e.clause ?? '—'}</span>
              </div>
            ))}
          </div>
        )
      }
    </SectionCard>
  )
}

/* ── Main component ── */
export default function DecisionResultPage({ report, onBack }: Props) {
  const { user } = useAuth()
  const { openSignup } = useAuthModal()
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [authPrompt, setAuthPrompt] = useState<'download' | 'share' | null>(null)

  function handleDownload() {
    if (!user) { setAuthPrompt('download'); return }
    logActivity(user.uid, 'report_downloaded', {})
    window.print()
  }

  function handleShare() {
    if (!user) { setAuthPrompt('share'); return }
    const text = [
      `${t('report.title')}`,
      '',
      `${t('report.recommendation')}: ${report.recommendation}`,
      '',
      `${t('report.confidenceScore')}: ${report.confidence_score}/100`,
      `${report.confidence_rationale}`,
      '',
      `${t('report.hiddenRisks')} (${report.hidden_risks.length}):`,
      ...report.hidden_risks.map(r => `- [${r.severity}] ${r.description}`),
    ].join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      logActivity(user.uid, 'report_shared', {})
    })
  }

  return (
    <div className="dr-page">
      {/* Nav */}
      <div className="result-nav">
        <div className="container result-nav-inner">
          <button className="back-btn" onClick={onBack}>{t('result.backToHome')}</button>
          <h2 className="result-nav-title">{t('report.title')}</h2>
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

      <div className="container dr-content">
        {/* 1 */}
        <RecommendationCard recommendation={report.recommendation} t={t} />

        {/* 2 + 3 side by side */}
        <div className="dr-two-col">
          <RankingSection ranking={report.ranking} t={t} />
          <ConfidenceScore score={report.confidence_score} rationale={report.confidence_rationale} t={t} />
        </div>

        {/* 4 */}
        <HiddenRisks risks={report.hidden_risks} t={t} />

        {/* 5 + 6 side by side */}
        <div className="dr-two-col">
          <MissingInformation items={report.missing_information} t={t} />
          <SmartSkepticQuestions questions={report.smart_skeptic_questions} t={t} />
        </div>

        {/* 7 */}
        <DecisionDefense defense={report.decision_defense} t={t} />

        {/* 8 */}
        <EvidenceFound evidence={report.evidence_found} t={t} />

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
