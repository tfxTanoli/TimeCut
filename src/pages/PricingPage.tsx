import { useState, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import Footer from '../components/Footer'
import PaymentModal from '../components/PaymentModal'
import { useTranslation } from '../hooks/useTranslation'
import { useAuth } from '../contexts/AuthContext'
import { useAuthModal } from '../contexts/AuthModalContext'

export default function PricingPage() {
  const { t } = useTranslation()
  const { user, userData, plan: currentPlan } = useAuth()
  const { openSignup: openAuthModal } = useAuthModal()
  const [searchParams] = useSearchParams()
  const [paymentPlan, setPaymentPlan] = useState<'starter' | 'pro' | null>(null)
  const [banner, setBanner] = useState<'success' | 'canceled' | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (searchParams.get('success') === 'true') setBanner('success')
    if (searchParams.get('canceled') === 'true') setBanner('canceled')
  }, [searchParams])

  function handlePaidPlan(plan: 'starter' | 'pro') {
    if (!user) { openAuthModal(); return }
    setPaymentPlan(plan)
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
  ]

  return (
    <>
      {/* Payment modal */}
      {paymentPlan && user && (
        <PaymentModal
          plan={paymentPlan}
          uid={user.uid}
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
                <span className="pricing-price">{t('pricing.freePrice')}</span>
              </div>
              <Link to="/get-started" className="pricing-cta btn-outline">
                {t('pricing.freeCta')}
              </Link>
              <p className="pricing-plan-subtitle">{t('pricing.freeSubtitle')}</p>
              <div className="pricing-divider" />
              <ul className="pricing-features">
                {(['freeF1','freeF2','freeF3','freeF4'] as const).map(k => (
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
            </div>

            {/* STARTER */}
            <div className="pricing-card" onClick={() => handlePaidPlan('starter')}>
              {planBadge('starter')}
              <p className="pricing-plan-name">{t('pricing.starter')}</p>
              <p className="pricing-plan-tagline">{t('pricing.starterTagline')}</p>
              <div className="pricing-price-row">
                <span className="pricing-price">{t('pricing.starterPrice')}</span>
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
                {(['starterF1','starterF2','starterF3','starterF4','starterF5','starterF6','starterF7'] as const).map(k => (
                  <li key={k} className="pricing-feat pricing-feat--yes">
                    <span className="feat-icon feat-icon--yes">✓</span> {t(`pricing.${k}`)}
                  </li>
                ))}
              </ul>
            </div>

            {/* PRO */}
            <div className="pricing-card pricing-card--highlight" onClick={() => handlePaidPlan('pro')}>
              <span className="pricing-badge">{t('pricing.mostPopular')}</span>
              {planBadge('pro')}
              <p className="pricing-plan-name">{t('pricing.pro')}</p>
              <p className="pricing-plan-tagline">{t('pricing.proTagline')}</p>
              <div className="pricing-price-row">
                <span className="pricing-price">{t('pricing.proPrice')}</span>
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
                {(['proF1','proF2','proF3','proF4','proF5','proF6','proF7','proF8'] as const).map(k => (
                  <li key={k} className="pricing-feat pricing-feat--yes">
                    <span className="feat-icon feat-icon--yes">✓</span> {t(`pricing.${k}`)}
                  </li>
                ))}
              </ul>
            </div>

            {/* BUSINESS (formerly CUSTOM) */}
            <div className="pricing-card" onClick={() => navigate('/contact')}>
              <p className="pricing-plan-name">{t('pricing.custom')}</p>
              <p className="pricing-plan-tagline">{t('pricing.customTagline')}</p>
              <div className="pricing-price-row">
                <span className="pricing-price">{t('pricing.customPrice')}</span>
                <span className="pricing-period">{t('pricing.customPeriod')}</span>
              </div>
              <Link to="/contact" className="pricing-cta btn-outline" onClick={e => e.stopPropagation()}>
                {t('pricing.customCta')}
              </Link>
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

      <section className="faq-section">
        <div className="container faq-inner">
          <h2 className="section-title">{t('pricing.faqTitle')}</h2>
          <div className="faq-list">
            {FAQS.map((faq, i) => (
              <div key={i} className="faq-item">
                <p className="faq-q">{faq.q}</p>
                <p className="faq-a">{faq.a}</p>
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
