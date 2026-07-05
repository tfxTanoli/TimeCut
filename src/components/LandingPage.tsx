import { useEffect, useRef, useState } from 'react'
import type { InputTab } from '../types'
import type { PlanType } from '../lib/userService'
import Footer from './Footer'
import { useTranslation } from '../hooks/useTranslation'

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
  uploadSection?: React.ReactNode
}

// ── Demo data ──────────────────────────────────────────────────────────────
const DEMO_TABS = ['supplier', 'hiring', 'contract', 'proposal', 'research'] as const
type DemoTab = typeof DEMO_TABS[number]

interface DemoRisk {
  title: string
  level: 'High' | 'Medium' | 'Low'
  whyItMatters: string
  action: string
  evidence: string
}
interface DemoMissing {
  title: string
  whyItMatters: string
  action: string
  evidence: string
}
interface DemoData {
  tabLabel: string
  goal: string
  recommendation: string
  confidence: number
  evidenceSummary: string
  risks: DemoRisk[]
  missing: DemoMissing[]
  recReasons: string[]
  decisionReadiness?: number
  decisionDefense?: string
}

function buildDemoData(t: (k: string) => string): Record<DemoTab, DemoData> {
  return {
    supplier: {
      tabLabel: t('home.demoSupTab'),
      goal: t('home.demoSupGoal'),
      recommendation: t('home.demoSupRec'),
      confidence: 92,
      evidenceSummary: t('home.demoSupEvidence'),
      risks: [
        { title: t('home.demoSupR1T'), level: 'High', whyItMatters: t('home.demoSupR1W'), action: t('home.demoSupR1A'), evidence: t('home.demoSupR1E') },
        { title: t('home.demoSupR2T'), level: 'High', whyItMatters: t('home.demoSupR2W'), action: t('home.demoSupR2A'), evidence: t('home.demoSupR2E') },
        { title: t('home.demoSupR3T'), level: 'Medium', whyItMatters: t('home.demoSupR3W'), action: t('home.demoSupR3A'), evidence: t('home.demoSupR3E') },
      ],
      missing: [
        { title: t('home.demoSupM1T'), whyItMatters: t('home.demoSupM1W'), action: t('home.demoSupM1A'), evidence: t('home.demoSupM1E') },
        { title: t('home.demoSupM2T'), whyItMatters: t('home.demoSupM2W'), action: t('home.demoSupM2A'), evidence: t('home.demoSupM2E') },
      ],
      recReasons: [t('home.demoSupRea1'), t('home.demoSupRea2'), t('home.demoSupRea3'), t('home.demoSupRea4')],
      decisionDefense: t('home.demoSupDefense'),
    },
    hiring: {
      tabLabel: t('home.demoCvTab'),
      goal: t('home.demoCvGoal'),
      recommendation: t('home.demoCvRec'),
      confidence: 94,
      evidenceSummary: t('home.demoCvEvidence'),
      risks: [
        { title: t('home.demoCvR1T'), level: 'Medium', whyItMatters: t('home.demoCvR1W'), action: t('home.demoCvR1A'), evidence: t('home.demoCvR1E') },
        { title: t('home.demoCvR2T'), level: 'Medium', whyItMatters: t('home.demoCvR2W'), action: t('home.demoCvR2A'), evidence: t('home.demoCvR2E') },
      ],
      missing: [
        { title: t('home.demoCvM1T'), whyItMatters: t('home.demoCvM1W'), action: t('home.demoCvM1A'), evidence: t('home.demoCvM1E') },
      ],
      recReasons: [t('home.demoCvRea1'), t('home.demoCvRea2'), t('home.demoCvRea3'), t('home.demoCvRea4')],
      decisionReadiness: 88,
    },
    contract: {
      tabLabel: t('home.demoContractTab'),
      goal: t('home.demoContractGoal'),
      recommendation: t('home.demoContractRec'),
      confidence: 89,
      evidenceSummary: t('home.demoContractEvidence'),
      risks: [
        { title: t('home.demoContractR1T'), level: 'High', whyItMatters: t('home.demoContractR1W'), action: t('home.demoContractR1A'), evidence: t('home.demoContractR1E') },
        { title: t('home.demoContractR2T'), level: 'High', whyItMatters: t('home.demoContractR2W'), action: t('home.demoContractR2A'), evidence: t('home.demoContractR2E') },
        { title: t('home.demoContractR3T'), level: 'Medium', whyItMatters: t('home.demoContractR3W'), action: t('home.demoContractR3A'), evidence: t('home.demoContractR3E') },
      ],
      missing: [
        { title: t('home.demoContractM1T'), whyItMatters: t('home.demoContractM1W'), action: t('home.demoContractM1A'), evidence: t('home.demoContractM1E') },
      ],
      recReasons: [t('home.demoContractRea1'), t('home.demoContractRea2'), t('home.demoContractRea3'), t('home.demoContractRea4')],
      decisionReadiness: 75,
    },
    proposal: {
      tabLabel: t('home.demoProTab'),
      goal: t('home.demoProGoal'),
      recommendation: t('home.demoProRec'),
      confidence: 81,
      evidenceSummary: t('home.demoProEvidence'),
      risks: [
        { title: t('home.demoProR1T'), level: 'High', whyItMatters: t('home.demoProR1W'), action: t('home.demoProR1A'), evidence: t('home.demoProR1E') },
        { title: t('home.demoProR2T'), level: 'Medium', whyItMatters: t('home.demoProR2W'), action: t('home.demoProR2A'), evidence: t('home.demoProR2E') },
        { title: t('home.demoProR3T'), level: 'Medium', whyItMatters: t('home.demoProR3W'), action: t('home.demoProR3A'), evidence: t('home.demoProR3E') },
      ],
      missing: [
        { title: t('home.demoProM1T'), whyItMatters: t('home.demoProM1W'), action: t('home.demoProM1A'), evidence: t('home.demoProM1E') },
      ],
      recReasons: [t('home.demoProRea1'), t('home.demoProRea2'), t('home.demoProRea3'), t('home.demoProRea4')],
    },
    research: {
      tabLabel: t('home.demoResearchTab'),
      goal: t('home.demoResearchGoal'),
      recommendation: t('home.demoResearchRec'),
      confidence: 93,
      evidenceSummary: t('home.demoResearchEvidence'),
      risks: [
        { title: t('home.demoResearchR1T'), level: 'Medium', whyItMatters: t('home.demoResearchR1W'), action: t('home.demoResearchR1A'), evidence: t('home.demoResearchR1E') },
        { title: t('home.demoResearchR2T'), level: 'Medium', whyItMatters: t('home.demoResearchR2W'), action: t('home.demoResearchR2A'), evidence: t('home.demoResearchR2E') },
      ],
      missing: [],
      recReasons: [t('home.demoResearchRea1'), t('home.demoResearchRea2'), t('home.demoResearchRea3'), t('home.demoResearchRea4')],
    },
  }
}

const LEVEL_LABEL_KEY: Record<string, string> = { High: 'home.lpLevelHigh', Medium: 'home.lpLevelMedium', Low: 'home.lpLevelLow' }

const LEVEL_COLOR: Record<string, string> = { High: '#EF4444', Medium: '#FB923C', Low: '#22C55E' }
const LEVEL_BG: Record<string, string> = {
  High: 'rgba(239,68,68,0.12)',
  Medium: 'rgba(251,146,60,0.12)',
  Low: 'rgba(34,197,94,0.12)',
}

export default function LandingPage({ uploadSection, ...props }: Props) {
  const { t } = useTranslation()
  const seenFadeEls = useRef<Set<Element>>(new Set())
  const [activeDemo, setActiveDemo] = useState<DemoTab>('supplier')
  const [isExpanded, setIsExpanded] = useState(false)

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
      { threshold: 0.1 }
    )
    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    seenFadeEls.current.forEach(el => el.classList.add('is-visible'))
  })

  // keep TypeScript happy — props passed from HomePage are not used by LandingPage directly
  void props

  function scrollToUpload() {
    document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  function scrollToExample() {
    document.getElementById('example-output')?.scrollIntoView({ behavior: 'smooth' })
  }

  function viewDemo(tab: DemoTab) {
    setActiveDemo(tab)
    setIsExpanded(false)
    setTimeout(() => {
      document.getElementById('example-output')?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
  }

  function switchDemo(tab: DemoTab) {
    setActiveDemo(tab)
    setIsExpanded(false)
  }

  const DEMO_DATA = buildDemoData(t)
  const demo = DEMO_DATA[activeDemo]

  return (
    <>
      {/* ══════════════════════════════════════════
          HERO
      ══════════════════════════════════════════ */}
      <section className="lp-hero">
        <div className="container lp-hero-inner">
          <div className="lp-hero-badges fade-up">
            <span className="lp-badge">{t('home.lpBadge1')}</span>
          </div>
          <h1 className="lp-top-heading fade-up" style={{ transitionDelay: '40ms' }}>
            {t('home.lpTopHeading')}
          </h1>
          <p className="lp-hero-tagline fade-up" style={{ transitionDelay: '90ms' }}>
            {t('home.lpHeadline')}
          </p>
          <p className="lp-subheadline fade-up" style={{ transitionDelay: '140ms' }}>
            {t('home.lpSubheadline')}
          </p>
          <div className="lp-hero-actions fade-up" style={{ transitionDelay: '180ms' }}>
            <button className="btn-primary btn-cta lp-primary-cta" onClick={scrollToUpload}>
              {t('home.lpCta')}
            </button>
            <button className="lp-demo-cta" onClick={scrollToExample}>
              {t('home.lpDemoCta')}
            </button>
            <div className="lp-trust-badges">
              <span className="lp-trust-badge"><span className="lp-trust-check">✓</span> {t('home.lpTrust1')}</span>
              <span className="lp-trust-badge"><span className="lp-trust-check">✓</span> {t('home.lpTrust2')}</span>
              <span className="lp-trust-badge"><span className="lp-trust-check">✓</span> {t('home.lpTrust3')}</span>
            </div>
            <p className="lp-no-cc">{t('home.lpNoCc')}</p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          EXAMPLE OUTPUT — 3 tabs + expand/collapse
      ══════════════════════════════════════════ */}
      <section id="example-output" className="lp-section lp-section--alt">
        <div className="container">
          <p className="lp-eyebrow fade-up">{t('home.lpEoEyebrow')}</p>
          <h2 className="lp-section-title fade-up" style={{ transitionDelay: '60ms' }}>{t('home.lpEoTitle')}</h2>
          <p className="lp-section-sub fade-up" style={{ transitionDelay: '100ms' }}>{t('home.lpEoSub')}</p>

          {/* Demo type tabs */}
          <div className="lp-demo-tabs fade-up" style={{ transitionDelay: '130ms' }}>
            {DEMO_TABS.map(tab => (
              <button
                key={tab}
                className={`lp-demo-tab${activeDemo === tab ? ' lp-demo-tab--active' : ''}`}
                onClick={() => switchDemo(tab)}
              >
                {tab === 'supplier' && '📦 '}
                {tab === 'hiring' && '👤 '}
                {tab === 'contract' && '📄 '}
                {tab === 'proposal' && '📊 '}
                {tab === 'research' && '🔬 '}
                {DEMO_DATA[tab].tabLabel}
              </button>
            ))}
          </div>

          {/* Summary card */}
          <div className="lp-eo-card fade-up" style={{ transitionDelay: '160ms' }}>
            <div className="lp-eo-row lp-eo-row--goal">
              <span className="lp-eo-label">{t('home.lpEoGoalLabel')}</span>
              <span className="lp-eo-value">{demo.goal}</span>
            </div>
            <div className="lp-eo-divider" />
            <div className="lp-eo-top-row">
              <div className="lp-eo-rec">
                <span className="lp-eo-label">{t('home.lpEoRecLabel')}</span>
                <span className="lp-eo-rec-value">{demo.recommendation}</span>
              </div>
              <div className="lp-eo-score">
                <span className="lp-eo-label">{t('home.lpEoScoreLabel')}</span>
                <div className="lp-eo-gauge">
                  {(() => {
                    const pct = demo.confidence
                    const color = pct >= 70 ? '#22C55E' : pct >= 40 ? '#F59E0B' : '#EF4444'
                    const r = 28
                    const circ = 2 * Math.PI * r
                    const offset = circ - (pct / 100) * circ
                    return (
                      <svg width="72" height="72" viewBox="0 0 72 72">
                        <circle cx="36" cy="36" r={r} fill="none" stroke="#1F2937" strokeWidth="7" />
                        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="7"
                          strokeDasharray={circ} strokeDashoffset={offset}
                          strokeLinecap="round" transform="rotate(-90 36 36)" />
                        <text x="36" y="32" textAnchor="middle" fill="#FFFFFF" fontSize="14" fontWeight="700">{pct}</text>
                        <text x="36" y="44" textAnchor="middle" fill="#6B7280" fontSize="9">/ 100</text>
                      </svg>
                    )
                  })()}
                </div>
              </div>
            </div>
            <div className="lp-eo-divider" />

            {/* Summary counts */}
            <div className="lp-eo-stats-row">
              <div className="lp-eo-stat">
                <span className="lp-eo-stat-icon lp-eo-stat-icon--risk">🔴</span>
                <span className="lp-eo-stat-count">{demo.risks.length}</span>
                <span className="lp-eo-stat-label">{t('home.lpEoStatRisks')}</span>
              </div>
              <div className="lp-eo-stat-divider" />
              <div className="lp-eo-stat">
                <span className="lp-eo-stat-icon lp-eo-stat-icon--missing">🟠</span>
                <span className="lp-eo-stat-count">{demo.missing.length}</span>
                <span className="lp-eo-stat-label">{t('home.lpEoStatMissing')}</span>
              </div>
              <div className="lp-eo-stat-divider" />
              <div className="lp-eo-stat">
                <span className="lp-eo-stat-icon lp-eo-stat-icon--evidence">📄</span>
                <span className="lp-eo-stat-label lp-eo-stat-label--evidence">{demo.evidenceSummary}</span>
              </div>
              {demo.decisionReadiness != null && (
                <>
                  <div className="lp-eo-stat-divider" />
                  <div className="lp-eo-stat">
                    <span className="lp-eo-stat-icon">🎯</span>
                    <span className="lp-eo-stat-count">{demo.decisionReadiness}%</span>
                    <span className="lp-eo-stat-label">{t('home.lpEoReadinessLabel')}</span>
                  </div>
                </>
              )}
            </div>

            <div className="lp-eo-divider" />

            {/* Expand / Collapse button */}
            <button
              className="lp-eo-expand-btn"
              onClick={() => setIsExpanded(v => !v)}
            >
              {isExpanded ? `▲ ${t('home.lpEoCollapse')}` : `▼ ${t('home.lpEoExpand')}`}
            </button>

            {/* ── Expanded detail view ── */}
            {isExpanded && (
              <div className="lp-eo-expanded">
                {/* Hidden Risks */}
                {demo.risks.map((risk, i) => (
                  <div key={i} className="lp-risk-item lp-risk-item--risk">
                    <div className="lp-risk-item__header">
                      <span className="lp-risk-item__badge">🔴 {t('home.lpEoRiskBadge')} #{i + 1}</span>
                      <span
                        className="lp-risk-level-badge"
                        style={{ color: LEVEL_COLOR[risk.level], background: LEVEL_BG[risk.level] }}
                      >
                        {t('home.lpEoRiskLevel')} {t(LEVEL_LABEL_KEY[risk.level])}
                      </span>
                    </div>
                    <h4 className="lp-risk-item__title">{risk.title}</h4>
                    <div className="lp-risk-detail">
                      <div className="lp-risk-detail__row">
                        <span className="lp-risk-detail__key">{t('home.lpEoWhy')}</span>
                        <span className="lp-risk-detail__val">{risk.whyItMatters}</span>
                      </div>
                      <div className="lp-risk-detail__row">
                        <span className="lp-risk-detail__key">{t('home.lpEoAction')}</span>
                        <span className="lp-risk-detail__val">{risk.action}</span>
                      </div>
                      <div className="lp-risk-detail__row">
                        <span className="lp-risk-detail__key lp-risk-detail__key--evidence">{t('home.lpEoEvidence')}</span>
                        <span className="lp-risk-detail__val lp-risk-detail__val--evidence">{risk.evidence}</span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Missing Information */}
                {demo.missing.map((item, i) => (
                  <div key={i} className="lp-risk-item lp-risk-item--missing">
                    <div className="lp-risk-item__header">
                      <span className="lp-risk-item__badge lp-risk-item__badge--missing">🟠 {t('home.lpEoMissingBadge')} #{i + 1}</span>
                    </div>
                    <h4 className="lp-risk-item__title">{item.title}</h4>
                    <div className="lp-risk-detail">
                      <div className="lp-risk-detail__row">
                        <span className="lp-risk-detail__key">{t('home.lpEoWhy')}</span>
                        <span className="lp-risk-detail__val">{item.whyItMatters}</span>
                      </div>
                      <div className="lp-risk-detail__row">
                        <span className="lp-risk-detail__key">{t('home.lpEoAction')}</span>
                        <span className="lp-risk-detail__val">{item.action}</span>
                      </div>
                      <div className="lp-risk-detail__row">
                        <span className="lp-risk-detail__key lp-risk-detail__key--evidence">{t('home.lpEoEvidence')}</span>
                        <span className="lp-risk-detail__val lp-risk-detail__val--evidence">{item.evidence}</span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Recommendation detail */}
                <div className="lp-risk-item lp-risk-item--rec">
                  <div className="lp-risk-item__header">
                    <span className="lp-risk-item__badge lp-risk-item__badge--rec">🟢 {t('home.lpEoRecBadge')}</span>
                  </div>
                  <h4 className="lp-risk-item__title lp-risk-item__title--rec">{demo.recommendation}</h4>
                  <div className="lp-rec-reasons">
                    <span className="lp-rec-reasons__label">{t('home.lpEoReasons')}</span>
                    <ul className="lp-rec-reasons__list">
                      {demo.recReasons.map((r, i) => (
                        <li key={i} className="lp-rec-reasons__item">
                          <span className="lp-rec-reasons__check">✓</span> {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {demo.decisionDefense && (
                    <div className="lp-rec-reasons">
                      <span className="lp-rec-reasons__label">{t('home.lpEoDefenseLabel')}</span>
                      <p className="lp-risk-detail__val">{demo.decisionDefense}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          HOW IT WORKS  (4 steps)
      ══════════════════════════════════════════ */}
      <section className="lp-section">
        <div className="container">
          <p className="lp-eyebrow fade-up">{t('home.lpHiwEyebrow')}</p>
          <h2 className="lp-section-title fade-up" style={{ transitionDelay: '60ms' }}>{t('home.lpHiwTitle')}</h2>
          <div className="lp-hiw-grid">
            {[
              { num: '01', title: t('home.lpHiw1Title'), desc: t('home.lpHiw1Desc') },
              { num: '02', title: t('home.lpHiw2Title'), desc: t('home.lpHiw2Desc') },
              { num: '03', title: t('home.lpHiw3Title'), desc: t('home.lpHiw3Desc') },
              { num: '04', title: t('home.lpHiw4Title'), desc: t('home.lpHiw4Desc') },
            ].map((step, i) => (
              <div key={i} className="lp-hiw-step fade-up" style={{ transitionDelay: `${i * 80}ms` }}>
                <div className="lp-hiw-num">{step.num}</div>
                <h3 className="lp-hiw-step-title">{step.title}</h3>
                <p className="lp-hiw-step-desc">{step.desc}</p>
                {i < 3 && <div className="lp-hiw-arrow">→</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          USE CASES  (7 cards with demo buttons on 3)
      ══════════════════════════════════════════ */}
      <section className="lp-section lp-section--use-cases">
        <div className="container">
          <p className="lp-eyebrow fade-up">{t('home.lpUseCasesEyebrow')}</p>
          <h2 className="lp-section-title fade-up" style={{ transitionDelay: '60ms' }}>{t('home.lpUseCasesTitle')}</h2>
          <p className="lp-section-sub fade-up" style={{ transitionDelay: '100ms' }}>{t('home.lpUseCasesSub')}</p>
          <div className="lp-usecases-grid">
            {[
              { icon: '📦', title: t('home.lpUc2Title'), desc: t('home.lpUc2Desc'), demo: 'supplier' as DemoTab },
              { icon: '📊', title: t('home.lpUc3Title'), desc: t('home.lpUc3Desc'), demo: 'proposal' as DemoTab },
              { icon: '👥', title: t('home.lpUc1Title'), desc: t('home.lpUc1Desc'), demo: 'hiring' as DemoTab },
              { icon: '🤝', title: t('home.lpUc6Title'), desc: t('home.lpUc6Desc'), demo: null },
              { icon: '📝', title: t('home.lpUc7Title'), desc: t('home.lpUc7Desc'), demo: 'contract' as DemoTab },
              { icon: '🔬', title: t('home.lpUc4Title'), desc: t('home.lpUc4Desc'), demo: 'research' as DemoTab },
              { icon: '📚', title: t('home.lpUc5Title'), desc: t('home.lpUc5Desc'), demo: null },
            ].map((uc, i) => (
              <div key={i} className="lp-uc-card fade-up" style={{ transitionDelay: `${i * 60}ms` }}>
                <span className="lp-uc-icon">{uc.icon}</span>
                <h3 className="lp-uc-title">{uc.title}</h3>
                <p className="lp-uc-desc">{uc.desc}</p>
                {uc.demo && (
                  <button
                    className="lp-uc-demo-btn"
                    onClick={() => viewDemo(uc.demo as DemoTab)}
                  >
                    {t('home.lpDemoCta')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          UPLOAD SECTION (moved here — after hero, example, use cases)
      ══════════════════════════════════════════ */}
      {uploadSection && (
        <section id="upload-section" className="lp-section lp-section--upload-wrapper">
          <div className="container">
            <p className="lp-eyebrow fade-up">{t('home.uploadEyebrow')}</p>
            <h2 className="lp-section-title fade-up" style={{ transitionDelay: '60ms' }}>
              {t('home.uploadTitle')}
            </h2>
            <p className="lp-section-sub fade-up" style={{ transitionDelay: '100ms', fontSize: '14px' }}>
              {t('home.uploadSub')}
            </p>
            {uploadSection}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════
          WHY TIMECUT  (vs ChatGPT table)
      ══════════════════════════════════════════ */}
      <section className="lp-section lp-section--alt">
        <div className="container">
          <p className="lp-eyebrow fade-up">{t('home.lpWhyEyebrow')}</p>
          <h2 className="lp-section-title fade-up" style={{ transitionDelay: '60ms' }}>{t('home.lpWhyTitle')}</h2>
          <div className="lp-comparison-table fade-up" style={{ transitionDelay: '120ms' }}>
            <div className="lp-comp-header">
              <div className="lp-comp-col-label" />
              <div className="lp-comp-col-label lp-comp-col--other">ChatGPT</div>
              <div className="lp-comp-col-label lp-comp-col--us">TimeCut</div>
            </div>
            {[
              { label: t('home.lpComp1Label'), other: t('home.lpComp1Other'), us: t('home.lpComp1Us') },
              { label: t('home.lpComp2Label'), other: t('home.lpComp2Other'), us: t('home.lpComp2Us') },
              { label: t('home.lpComp3Label'), other: t('home.lpComp3Other'), us: t('home.lpComp3Us') },
              { label: t('home.lpComp4Label'), other: t('home.lpComp4Other'), us: t('home.lpComp4Us') },
            ].map((row, i) => (
              <div key={i} className="lp-comp-row">
                <div className="lp-comp-cell lp-comp-cell--label">{row.label}</div>
                <div className="lp-comp-cell lp-comp-cell--other">{row.other}</div>
                <div className="lp-comp-cell lp-comp-cell--us">
                  <span className="lp-comp-check">✓</span> {row.us}
                </div>
              </div>
            ))}
          </div>
          <div className="lp-why-cta fade-up" style={{ transitionDelay: '200ms' }}>
            <button className="btn-primary btn-cta" onClick={scrollToUpload}>{t('home.lpCta')}</button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          LEGAL DISCLAIMER
      ══════════════════════════════════════════ */}
      <section className="lp-disclaimer-section">
        <div className="container">
          <p className="lp-disclaimer-text">{t('home.lpDisclaimer')}</p>
        </div>
      </section>

      <Footer />
    </>
  )
}
