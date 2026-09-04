import { useEffect, useRef, useState } from 'react'
import type { InputTab } from '../types'
import type { PlanType } from '../lib/userService'
import Footer from './Footer'
import { useTranslation } from '../hooks/useTranslation'
import { DEMO_TABS, type DemoTab, buildDemoData, LEVEL_LABEL_KEY, LEVEL_COLOR, LEVEL_BG } from '../lib/demoData'

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

export default function LandingPage({ uploadSection, ...props }: Props) {
  const { t } = useTranslation()
  const seenFadeEls = useRef<Set<Element>>(new Set())
  const uploadRef = useRef<HTMLDivElement>(null)
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

  /**
   * The upload box is now in the hero, so this scrolls back up to it. The
   * brief outline is what tells someone their click did something: without it
   * a visitor near the top of the page sees no change at all.
   */
  function scrollToUpload() {
    const el = uploadRef.current
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('lp-hero-upload--flash')
    window.setTimeout(() => el.classList.remove('lp-hero-upload--flash'), 1400)
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

          {/* Upload box lives in the hero: the first screen shows the product
              itself, not a description of it. Everything that explains TimeCut
              sits below the box, where it answers questions a visitor has
              already started acting on. */}
          {uploadSection && (
            <div
              id="upload-section"
              ref={uploadRef}
              className="lp-hero-upload fade-up"
              style={{ transitionDelay: '130ms' }}
            >
              <h2 className="lp-hero-upload-title">{t('home.uploadTitle')}</h2>
              <p className="lp-hero-upload-sub">{t('home.uploadSub')}</p>
              {uploadSection}
            </div>
          )}

          {/* Supporting copy — moved below the upload box. The primary CTA that
              used to sit here only scrolled down to this box, so it is gone
              rather than pointing back up at content already on screen; the
              form's own submit button is the primary action now. */}
          <div className="lp-hero-support fade-up" style={{ transitionDelay: '170ms' }}>
            <p className="lp-subheadline">{t('home.lpSubheadline')}</p>
            <div className="lp-hero-actions">
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
