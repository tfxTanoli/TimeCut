import { useEffect, useRef } from 'react'
import type { InputTab } from '../types'
import type { PlanType } from '../lib/userService'
import Footer from './Footer'
import { useTranslation } from '../hooks/useTranslation'

/* Props kept identical so HomePage.tsx requires no change */
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

export default function LandingPage(_props: Props) {
  const { t } = useTranslation()
  const seenFadeEls = useRef<Set<Element>>(new Set())

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

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      {/* ══════════════════════════════════════════
          HERO
      ══════════════════════════════════════════ */}
      <section className="lp-hero">
        <div className="container lp-hero-inner">
          <div className="lp-hero-badges fade-up">
            <span className="lp-badge">{t('home.lpBadge1')}</span>
            <span className="lp-badge">{t('home.lpBadge2')}</span>
            <span className="lp-badge">{t('home.lpBadge3')}</span>
            <span className="lp-badge">{t('home.lpBadge4')}</span>
          </div>
          <h1 className="lp-headline fade-up" style={{ transitionDelay: '60ms' }}>
            {t('home.lpHeadline')}
          </h1>
          <p className="lp-subheadline fade-up" style={{ transitionDelay: '120ms' }}>
            {t('home.lpSubheadline')}
          </p>
          <div className="lp-hero-actions fade-up" style={{ transitionDelay: '180ms' }}>
            <button className="btn-primary btn-cta lp-primary-cta" onClick={scrollToTop}>
              {t('home.lpCta')}
            </button>
            <p className="lp-no-cc">{t('home.lpNoCc')}</p>
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
          USE CASES  (5 cards)
      ══════════════════════════════════════════ */}
      <section className="lp-section lp-section--alt">
        <div className="container">
          <p className="lp-eyebrow fade-up">{t('home.lpUseCasesEyebrow')}</p>
          <h2 className="lp-section-title fade-up" style={{ transitionDelay: '60ms' }}>{t('home.lpUseCasesTitle')}</h2>
          <p className="lp-section-sub fade-up" style={{ transitionDelay: '100ms' }}>{t('home.lpUseCasesSub')}</p>
          <div className="lp-usecases-grid">
            {[
              { icon: '👥', title: t('home.lpUc1Title'), desc: t('home.lpUc1Desc') },
              { icon: '📦', title: t('home.lpUc2Title'), desc: t('home.lpUc2Desc') },
              { icon: '📊', title: t('home.lpUc3Title'), desc: t('home.lpUc3Desc') },
              { icon: '🔬', title: t('home.lpUc4Title'), desc: t('home.lpUc4Desc') },
              { icon: '📚', title: t('home.lpUc5Title'), desc: t('home.lpUc5Desc') },
            ].map((uc, i) => (
              <div key={i} className="lp-uc-card fade-up" style={{ transitionDelay: `${i * 60}ms` }}>
                <span className="lp-uc-icon">{uc.icon}</span>
                <h3 className="lp-uc-title">{uc.title}</h3>
                <p className="lp-uc-desc">{uc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          WHY TIMECUT  (vs ChatGPT table)
      ══════════════════════════════════════════ */}
      <section className="lp-section">
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
            <button className="btn-primary btn-cta" onClick={scrollToTop}>{t('home.lpCta')}</button>
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
