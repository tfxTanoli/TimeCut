import { useState, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import Footer from '../components/Footer'
import PaymentModal from '../components/PaymentModal'
import { useTranslation } from '../hooks/useTranslation'
import { useAuth } from '../contexts/AuthContext'
import { useAuthModal } from '../contexts/AuthModalContext'
import { getCachedPlanConfig, getPlanConfig, formatPrice, computeReportCost, type PlanConfig } from '../lib/planConfig'

export default function PricingPage() {
  const { t } = useTranslation()
  const { user, userData, plan: currentPlan } = useAuth()
  const { openSignup: openAuthModal } = useAuthModal()
  const [searchParams] = useSearchParams()
  // Only self-serve plans can open checkout. Business is Contact Sales — the
  // API refuses to create a subscription for it, and the card links to the
  // contact form rather than a card form.
  const [paymentPlan, setPaymentPlan] = useState<'starter' | 'pro' | null>(null)
  const [banner, setBanner] = useState<'success' | 'canceled' | null>(null)
  const [cfg, setCfg] = useState<PlanConfig>(getCachedPlanConfig())
  const [reportsPerMonth, setReportsPerMonth] = useState<number | null>(null)
  const navigate = useNavigate()

  // Pull live, admin-editable plan/credit figures so prices update without a redeploy.
  useEffect(() => { getPlanConfig().then(setCfg).catch(() => {}) }, [])

  const starterCredits = (cfg.plans.starter.credits ?? 0).toLocaleString()
  const proCredits = (cfg.plans.pro.credits ?? 0).toLocaleString()

  useEffect(() => {
    if (searchParams.get('success') === 'true') setBanner('success')
    if (searchParams.get('canceled') === 'true') setBanner('canceled')
  }, [searchParams])

  function handlePaidPlan(plan: 'starter' | 'pro') {
    if (!user) { openAuthModal(); return }
    setPaymentPlan(plan)
  }

  /** Business is provisioned by sales, so its CTA goes to the contact form. */
  function handleContactSales() {
    navigate('/contact?plan=business')
  }

  function planBadge(name: string) {
    return currentPlan === name
      ? <span className="pricing-current-badge">Your plan</span>
      : null
  }

  const FAQS = [
    { q: t('pricing.faq1Q'), a: t('pricing.faq1A') },
    { q: t('pricing.faq2Q'), a: t('pricing.faq2A') },
    { q: t('pricing.faq3Q'), a: t('pricing.faq3A') },
    { q: t('pricing.faq4Q'), a: t('pricing.faq4A') },
    { q: t('pricing.faq5Q'), a: t('pricing.faq5A') },
    {
      q: t('pricing.faq6Q'),
      a: t('pricing.faq6A'),
      bullets: [t('pricing.faq6B1'), t('pricing.faq6B2'), t('pricing.faq6B3'), t('pricing.faq6B4')],
      note: t('pricing.faq6Note'),
    },
  ]

  // Recommend a plan from the user's expected monthly volume. Config-driven:
  // a "typical" analysis (~20 pages, single doc) sets the per-report credit cost,
  // so if the estimated monthly credits fit inside Starter we suggest Starter, else Pro.
  const typicalReportCost = Math.max(1, computeReportCost(cfg, { pages: 20, docs: 1 }))
  const recommended: 'starter' | 'pro' | null =
    reportsPerMonth == null
      ? null
      : reportsPerMonth * typicalReportCost <= (cfg.plans.starter.credits ?? 0)
        ? 'starter'
        : 'pro'

  return (
    <>
      {/* Payment modal */}
      {paymentPlan && user && (
        <PaymentModal
          plan={paymentPlan}
          email={user.email ?? undefined}
          name={userData?.name ?? user.displayName ?? undefined}
          onClose={() => setPaymentPlan(null)}
        />
      )}

      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">{t('pricing.badge')}</span>
          <h1 className="page-hero-title">{t('pricing.title')}</h1>
          <p className="page-hero-sub">{t('pricing.subtitle')}</p>
        </div>
      </section>

      {banner === 'success' && (
        <div className="pricing-banner pricing-banner--success">
          <span>Payment successful! Welcome to TimeCut.</span>
          <button className="pricing-banner-dismiss" onClick={() => setBanner(null)}>✕</button>
        </div>
      )}
      {banner === 'canceled' && (
        <div className="pricing-banner pricing-banner--canceled">
          <span>Payment was canceled. No charge was made.</span>
          <button className="pricing-banner-dismiss" onClick={() => setBanner(null)}>✕</button>
        </div>
      )}

      <section className="pricing-section">
        <div className="container">
          <div className="pricing-grid pricing-grid--4col">

            {/* FREE */}
            <div className="pricing-card" onClick={() => navigate('/get-started')}>
              {planBadge('free')}
              <p className="pricing-plan-name">{t('pricing.free')}</p>
              <p className="pricing-plan-tagline">{t('pricing.freeTagline')}</p>
              <div className="pricing-price-row">
                <span className="pricing-price">{formatPrice(cfg.plans.free.priceCents)}</span>
              </div>
              <Link to="/get-started" className="pricing-cta btn-outline">
                {t('pricing.freeCta')}
              </Link>
              <p className="pricing-plan-subtitle">{t('pricing.freeSubtitle')}</p>
              <div className="pricing-divider" />
              <ul className="pricing-features">
                {(['freeF1','freeF2','freeF3','freeF4','freeF5','freeF6'] as const).map(k => (
                  <li key={k} className="pricing-feat pricing-feat--yes">
                    <span className="feat-icon feat-icon--yes">✓</span> {t(`pricing.${k}`)}
                  </li>
                ))}
                {(['freeMiss1','freeMiss2','freeMiss3'] as const).map(k => (
                  <li key={k} className="pricing-feat pricing-feat--no">
                    <span className="feat-icon feat-icon--no">✕</span> {t(`pricing.${k}`)}
                  </li>
                ))}
              </ul>
              <p className="pricing-note">{t('pricing.freeNote')}</p>
            </div>

            {/* STARTER */}
            <div className="pricing-card" onClick={() => handlePaidPlan('starter')}>
              {planBadge('starter')}
              <p className="pricing-plan-name">{t('pricing.starter')}</p>
              <p className="pricing-plan-tagline">{t('pricing.starterTagline')}</p>
              <div className="pricing-price-row">
                <span className="pricing-price">{formatPrice(cfg.plans.starter.priceCents)}</span>
                <span className="pricing-period">{t('pricing.starterPeriod')}</span>
              </div>
              <button
                className="pricing-cta btn-outline"
                onClick={() => handlePaidPlan('starter')}
              >
                {t('pricing.starterCta')}
              </button>
              <p className="pricing-plan-subtitle">{t('pricing.starterSubtitle')}</p>
              <div className="pricing-divider" />
              <ul className="pricing-features">
                {(['starterF1','starterF2','starterF3','starterF4','starterF5','starterF6','starterF7','starterF8','starterF9'] as const).map(k => (
                  <li key={k} className="pricing-feat pricing-feat--yes">
                    <span className="feat-icon feat-icon--yes">✓</span> {t(`pricing.${k}`).replace('{credits}', starterCredits)}
                  </li>
                ))}
              </ul>
              <p className="pricing-disclaimer">{t('pricing.creditDisclaimer')}</p>
            </div>

            {/* PRO */}
            <div className="pricing-card pricing-card--highlight" onClick={() => handlePaidPlan('pro')}>
              {planBadge('pro')}
              <p className="pricing-plan-name">{t('pricing.pro')}</p>
              <p className="pricing-plan-tagline">{t('pricing.proTagline')}</p>
              <div className="pricing-price-row">
                <span className="pricing-price">{formatPrice(cfg.plans.pro.priceCents)}</span>
                <span className="pricing-period">{t('pricing.proPeriod')}</span>
              </div>
              <button
                className="pricing-cta btn-primary"
                onClick={() => handlePaidPlan('pro')}
              >
                {t('pricing.proCta')}
              </button>
              <p className="pricing-plan-subtitle">{t('pricing.proSubtitle')}</p>
              <div className="pricing-divider" />
              <ul className="pricing-features">
                {(['proF1','proF2','proF3','proF4','proF5','proF6'] as const).map(k => (
                  <li key={k} className="pricing-feat pricing-feat--yes">
                    <span className="feat-icon feat-icon--yes">✓</span> {t(`pricing.${k}`).replace('{credits}', proCredits)}
                  </li>
                ))}
              </ul>
              <p className="pricing-disclaimer">{t('pricing.creditDisclaimer')}</p>
            </div>

            {/* BUSINESS — Contact Sales only, never self-serve checkout */}
            <div className="pricing-card" onClick={handleContactSales}>
              {planBadge('business')}
              <p className="pricing-plan-name">{t('pricing.custom')}</p>
              <p className="pricing-plan-tagline">{t('pricing.customTagline')}</p>
              {/* Business is quoted per account, so this card never shows a
                  price and never opens a payment form. Pricing is agreed with
                  sales and the account is provisioned by an admin. */}
              <div className="pricing-price-row">
                <span className="pricing-price pricing-price--custom">{t('pricing.customPriceLabel')}</span>
              </div>
              <button
                className="pricing-cta btn-outline"
                onClick={e => { e.stopPropagation(); handleContactSales() }}
              >
                {t('pricing.customCta')}
              </button>
              <p className="pricing-plan-subtitle">{t('pricing.customSubtitle')}</p>
              <div className="pricing-divider" />
              <ul className="pricing-features">
                {(['customF1','customF2','customF3','customF4','customF5'] as const).map(k => (
                  <li key={k} className="pricing-feat pricing-feat--yes">
                    <span className="feat-icon feat-icon--yes">✓</span> {t(`pricing.${k}`)}
                  </li>
                ))}
              </ul>
            </div>

          </div>
        </div>
      </section>

      <section className="plan-rec-section">
        <div className="container plan-rec-inner">
          <h2 className="plan-rec-title">{t('pricing.recTitle')}</h2>
          <p className="plan-rec-question">{t('pricing.recQuestion')}</p>
          <div className="plan-rec-options">
            {[5, 20, 50, 100].map(n => (
              <button
                key={n}
                type="button"
                className={`plan-rec-option${reportsPerMonth === n ? ' plan-rec-option--active' : ''}`}
                onClick={() => setReportsPerMonth(n)}
              >
                {n}
              </button>
            ))}
          </div>
          {recommended && (
            <div className="plan-rec-result">
              <p className="plan-rec-result-text">
                {t(recommended === 'starter' ? 'pricing.recResultStarter' : 'pricing.recResultPro')}
              </p>
              <button
                className="pricing-cta btn-primary plan-rec-cta"
                onClick={() => handlePaidPlan(recommended)}
              >
                {t(recommended === 'starter' ? 'pricing.recCtaStarter' : 'pricing.recCtaPro')}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="faq-section">
        <div className="container faq-inner">
          <h2 className="section-title">{t('pricing.faqTitle')}</h2>
          <div className="faq-list">
            {FAQS.map((faq, i) => (
              <div key={i} className="faq-item">
                <p className="faq-q">{faq.q}</p>
                <p className="faq-a">{faq.a}</p>
                {faq.bullets && (
                  <ul className="faq-bullets">
                    {faq.bullets.map((b, j) => <li key={j}>{b}</li>)}
                  </ul>
                )}
                {faq.note && <p className="faq-a faq-a--note">{faq.note}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="page-cta-section">
        <div className="container page-cta-inner">
          <h2>{t('pricing.ctaTitle')}</h2>
          <p>{t('pricing.ctaSub')}</p>
          <Link to="/get-started" className="btn-primary btn-cta">{t('pricing.ctaBtn')}</Link>
        </div>
      </section>

      <Footer />
    </>
  )
}
