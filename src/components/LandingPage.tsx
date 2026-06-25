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
const DEMO_TABS = ['supplier', 'cv', 'proposal'] as const
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
  confidence: string
  evidenceSummary: string
  risks: DemoRisk[]
  missing: DemoMissing[]
  recReasons: string[]
}

const DEMO_DATA: Record<DemoTab, DemoData> = {
  supplier: {
    tabLabel: 'Supplier Quotation',
    goal: 'Choose the best supplier',
    recommendation: 'Supplier B',
    confidence: '82%',
    evidenceSummary: 'Page 7, Section 4.2',
    risks: [
      {
        title: 'Automatic Annual Price Increase Clause',
        level: 'High',
        whyItMatters: 'Supplier A may raise prices every year with no predefined cap, creating unpredictable long-term cost exposure.',
        action: 'Request fixed pricing or a maximum annual increase cap (e.g. ≤ 3% CPI-linked) before signing.',
        evidence: 'Page 7, Section 4.2',
      },
      {
        title: 'No Late Delivery Penalty Defined',
        level: 'High',
        whyItMatters: 'The quotation contains no penalty clause for missed delivery deadlines, leaving you with no financial recourse if timelines slip.',
        action: 'Add a penalty clause specifying a daily or weekly fee for each day delivery is delayed beyond the agreed date.',
        evidence: 'Page 12, Section 6.1',
      },
      {
        title: 'Unclear Warranty Terms',
        level: 'Medium',
        whyItMatters: 'The warranty section is vague about what defects are covered, the claims process, and the response time — creating disputes at the point of failure.',
        action: 'Request a clear warranty schedule covering defect categories, claim procedures, and guaranteed response times.',
        evidence: 'Page 9, Section 5.3',
      },
    ],
    missing: [
      {
        title: 'Delivery Guarantee Missing',
        whyItMatters: 'The quotation states target delivery windows but provides no formal guarantee or committed SLA for on-time delivery.',
        action: 'Request a written delivery guarantee with a committed date and escalation path if the date is missed.',
        evidence: 'Page 12',
      },
      {
        title: 'Cancellation Terms Not Specified',
        whyItMatters: 'There is no information on how either party may cancel the contract, what notice period is required, or whether cancellation fees apply.',
        action: 'Request a cancellation clause covering notice period (e.g. 30 days), any applicable fees, and asset return obligations.',
        evidence: 'Page 14',
      },
    ],
    recReasons: [
      'Lowest long-term cost projection with no automatic escalation',
      'Clear delivery commitment with SLA and penalty clause',
      'Explicit warranty terms with defined response times',
      'Lower overall contract risk score across all evaluated criteria',
    ],
  },
  cv: {
    tabLabel: 'CV / HR',
    goal: 'Hire the best Sales Manager',
    recommendation: 'Candidate B',
    confidence: '88%',
    evidenceSummary: 'Resume Page 2',
    risks: [
      {
        title: 'Job Hopping Pattern — Candidate A',
        level: 'High',
        whyItMatters: 'Candidate A changed jobs 5 times in 4 years, suggesting potential instability or performance issues not visible on the CV.',
        action: 'Ask directly about the reason for each job change in the interview. Request references from all employers.',
        evidence: 'Resume Page 2',
      },
    ],
    missing: [
      {
        title: 'Sales Team Management Evidence — Candidate C',
        whyItMatters: 'Candidate C claims team leadership experience but provides no evidence of managing a sales team or measurable results.',
        action: 'Request a reference from a direct report and documented revenue results before advancing to final interview.',
        evidence: 'Resume Page 3',
      },
    ],
    recReasons: [
      'Consistent 3+ year tenures at previous roles',
      'Documented 40% revenue growth in last position',
      'Team management experience independently verified',
      'Strong references from two prior direct managers',
    ],
  },
  proposal: {
    tabLabel: 'Business Proposal',
    goal: 'Evaluate the business proposal for partnership',
    recommendation: 'Accept with conditions',
    confidence: '74%',
    evidenceSummary: 'Page 5, Section 3.1',
    risks: [
      {
        title: 'Unsupported Revenue Projections',
        level: 'High',
        whyItMatters: 'The proposal claims 3× revenue growth in Year 2 with no supporting financial model, market data, or historical basis.',
        action: 'Request the full financial model, key assumptions, and comparable market data before committing to the partnership.',
        evidence: 'Page 5, Section 3.1',
      },
    ],
    missing: [
      {
        title: 'No Exit or Termination Clause',
        whyItMatters: 'If the partnership underperforms, there is no defined exit process, notice period, or mutual termination terms.',
        action: 'Add a mutual exit clause with a 90-day written notice requirement and clear asset division terms.',
        evidence: 'Page 8',
      },
    ],
    recReasons: [
      'Strong and validated market analysis',
      'Experienced founding team with relevant track record',
      'Requires clarified financial projections and assumptions',
      'Requires exit and termination clause before signing',
    ],
  },
}

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
          <h1 className="lp-headline fade-up" style={{ transitionDelay: '60ms' }}>
            {t('home.lpHeadline')}
          </h1>
          <p className="lp-subheadline fade-up" style={{ transitionDelay: '120ms' }}>
            {t('home.lpSubheadline')}
          </p>
          <div className="lp-hero-actions fade-up" style={{ transitionDelay: '180ms' }}>
            <button className="btn-primary btn-cta lp-primary-cta" onClick={scrollToUpload}>
              {t('home.lpCta')}
            </button>
            <button className="lp-demo-cta" onClick={scrollToExample}>
              {t('home.lpDemoCta')}
            </button>
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
                {tab === 'cv' && '👤 '}
                {tab === 'proposal' && '📊 '}
                {DEMO_DATA[tab].tabLabel}
              </button>
            ))}
          </div>

          {/* Summary card */}
          <div className="lp-eo-card fade-up" style={{ transitionDelay: '160ms' }}>
            <div className="lp-eo-row lp-eo-row--goal">
              <span className="lp-eo-label">Decision Goal</span>
              <span className="lp-eo-value">{demo.goal}</span>
            </div>
            <div className="lp-eo-divider" />
            <div className="lp-eo-top-row">
              <div className="lp-eo-rec">
                <span className="lp-eo-label">Recommendation</span>
                <span className="lp-eo-rec-value">{demo.recommendation}</span>
              </div>
              <div className="lp-eo-score">
                <span className="lp-eo-label">Confidence Score</span>
                <span className="lp-eo-score-value">{demo.confidence}</span>
              </div>
            </div>
            <div className="lp-eo-divider" />

            {/* Summary counts */}
            <div className="lp-eo-stats-row">
              <div className="lp-eo-stat">
                <span className="lp-eo-stat-icon lp-eo-stat-icon--risk">🔴</span>
                <span className="lp-eo-stat-count">{demo.risks.length}</span>
                <span className="lp-eo-stat-label">Hidden Risk{demo.risks.length !== 1 ? 's' : ''} Found</span>
              </div>
              <div className="lp-eo-stat-divider" />
              <div className="lp-eo-stat">
                <span className="lp-eo-stat-icon lp-eo-stat-icon--missing">🟠</span>
                <span className="lp-eo-stat-count">{demo.missing.length}</span>
                <span className="lp-eo-stat-label">Missing Info Found</span>
              </div>
              <div className="lp-eo-stat-divider" />
              <div className="lp-eo-stat">
                <span className="lp-eo-stat-icon lp-eo-stat-icon--evidence">📄</span>
                <span className="lp-eo-stat-label lp-eo-stat-label--evidence">{demo.evidenceSummary}</span>
              </div>
            </div>

            <div className="lp-eo-divider" />

            {/* Expand / Collapse button */}
            <button
              className="lp-eo-expand-btn"
              onClick={() => setIsExpanded(v => !v)}
            >
              {isExpanded ? '▲ Hide Full Sample Report' : '▼ View Full Sample Report'}
            </button>

            {/* ── Expanded detail view ── */}
            {isExpanded && (
              <div className="lp-eo-expanded">
                {/* Hidden Risks */}
                {demo.risks.map((risk, i) => (
                  <div key={i} className="lp-risk-item lp-risk-item--risk">
                    <div className="lp-risk-item__header">
                      <span className="lp-risk-item__badge">🔴 Hidden Risk #{i + 1}</span>
                      <span
                        className="lp-risk-level-badge"
                        style={{ color: LEVEL_COLOR[risk.level], background: LEVEL_BG[risk.level] }}
                      >
                        Risk Level: {risk.level}
                      </span>
                    </div>
                    <h4 className="lp-risk-item__title">{risk.title}</h4>
                    <div className="lp-risk-detail">
                      <div className="lp-risk-detail__row">
                        <span className="lp-risk-detail__key">Why It Matters</span>
                        <span className="lp-risk-detail__val">{risk.whyItMatters}</span>
                      </div>
                      <div className="lp-risk-detail__row">
                        <span className="lp-risk-detail__key">Recommended Action</span>
                        <span className="lp-risk-detail__val">{risk.action}</span>
                      </div>
                      <div className="lp-risk-detail__row">
                        <span className="lp-risk-detail__key lp-risk-detail__key--evidence">Evidence</span>
                        <span className="lp-risk-detail__val lp-risk-detail__val--evidence">{risk.evidence}</span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Missing Information */}
                {demo.missing.map((item, i) => (
                  <div key={i} className="lp-risk-item lp-risk-item--missing">
                    <div className="lp-risk-item__header">
                      <span className="lp-risk-item__badge lp-risk-item__badge--missing">🟠 Missing Information #{i + 1}</span>
                    </div>
                    <h4 className="lp-risk-item__title">{item.title}</h4>
                    <div className="lp-risk-detail">
                      <div className="lp-risk-detail__row">
                        <span className="lp-risk-detail__key">Why It Matters</span>
                        <span className="lp-risk-detail__val">{item.whyItMatters}</span>
                      </div>
                      <div className="lp-risk-detail__row">
                        <span className="lp-risk-detail__key">Recommended Action</span>
                        <span className="lp-risk-detail__val">{item.action}</span>
                      </div>
                      <div className="lp-risk-detail__row">
                        <span className="lp-risk-detail__key lp-risk-detail__key--evidence">Evidence</span>
                        <span className="lp-risk-detail__val lp-risk-detail__val--evidence">{item.evidence}</span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Recommendation detail */}
                <div className="lp-risk-item lp-risk-item--rec">
                  <div className="lp-risk-item__header">
                    <span className="lp-risk-item__badge lp-risk-item__badge--rec">🟢 Recommendation</span>
                  </div>
                  <h4 className="lp-risk-item__title lp-risk-item__title--rec">{demo.recommendation}</h4>
                  <div className="lp-rec-reasons">
                    <span className="lp-rec-reasons__label">Reasons:</span>
                    <ul className="lp-rec-reasons__list">
                      {demo.recReasons.map((r, i) => (
                        <li key={i} className="lp-rec-reasons__item">
                          <span className="lp-rec-reasons__check">✓</span> {r}
                        </li>
                      ))}
                    </ul>
                  </div>
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
              { icon: '👥', title: t('home.lpUc1Title'), desc: t('home.lpUc1Desc'), demo: 'cv' as DemoTab },
              { icon: '🤝', title: t('home.lpUc6Title'), desc: t('home.lpUc6Desc'), demo: null },
              { icon: '📝', title: t('home.lpUc7Title'), desc: t('home.lpUc7Desc'), demo: null },
              { icon: '🔬', title: t('home.lpUc4Title'), desc: t('home.lpUc4Desc'), demo: null },
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
                    View Sample Report →
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
            <p className="lp-eyebrow fade-up">Start Your Analysis</p>
            <h2 className="lp-section-title fade-up" style={{ transitionDelay: '60ms' }}>
              Upload Your Documents
            </h2>
            <p className="lp-section-sub fade-up" style={{ transitionDelay: '100ms' }}>
              Upload 1–10 documents and describe your decision goal. Get your full Decision Intelligence Report in seconds.
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
