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
  const { user, userData, plan: currentPlan, freeReportsRemaining } = useAuth()
  const { openSignup: openAuthModal } = useAuthModal()
  const [searchParams] = useSearchParams()
  // Only self-serve plans can open checkout. Business is Contact Sales — the
  // API refuses to create a subscription for it, and the card links to the
  // contact form rather than a card form.
  const [paymentPlan, setPaymentPlan] = useState<'starter' | 'pro' | null>(null)
  const [dismissedBanner, setDismissedBanner] = useState<'success' | 'canceled' | null>(null)
  const [cfg, setCfg] = useState<PlanConfig>(getCachedPlanConfig())
  const [reportsPerMonth, setReportsPerMonth] = useState<number | null>(null)
  const navigate = useNavigate()

  // Pull live, admin-editable plan/credit figures so prices update without a redeploy.
  useEffect(() => { getPlanConfig().then(setCfg).catch(() => {}) }, [])

  const starterCredits = (cfg.plans.starter.credits ?? 0).toLocaleString()
  const proCredits = (cfg.plans.pro.credits ?? 0).toLocaleString()

  // Free-plan figures come from the same config the account area and the
  // upload form read, so the three places can never advertise different limits.
  const freeReports = cfg.plans.free.freeReports ?? 1
  const freeLimits = t('pricing.freeLimitsLine')
    .replace('{pages}', String(cfg.plans.free.maxPages))
    .replace('{docs}', String(cfg.plans.free.maxDocs))

  // Anyone on a paid plan already has everything the Free card lists, so it is
  // no longer an offer to them — it is just a description of the entry tier.
  const isPaidSubscriber = !!user && currentPlan !== 'free'

  /**
   * The Free allowance is a one-time grant, not a monthly one: the server keeps
   * `freeReportsUsed` on the user document and only ever increments it, so
   * nothing resets it at a month boundary (unlike AI Credits, which live in a
   * per-month ledger). The card says so explicitly, and a signed-in free user
   * sees what they actually have left rather than a generic "start" prompt.
   */
  const freeCtaLabel = !user
    ? t('pricing.freeCta')
    : isPaidSubscriber
      ? t('pricing.freeIncluded')
      : freeReportsRemaining > 0
        ? t('pricing.freeRemaining').replace('{n}', String(freeReportsRemaining))
        : t('pricing.freeExhausted')

  // Derived straight from the URL instead of mirrored into state by an effect.
  // Dismissal records *which* banner was dismissed, so returning from Stripe
  // with a different outcome still shows the new one.
  const bannerFromUrl: 'success' | 'canceled' | null =
    searchParams.get('success') === 'true' ? 'success'
      : searchParams.get('canceled') === 'true' ? 'canceled'
        : null
  const banner = bannerFromUrl && bannerFromUrl !== dismissedBanner ? bannerFromUrl : null

  function handlePaidPlan(plan: 'starter' | 'pro') {
    if (!user) { openAuthModal(); return }
    setPaymentPlan(plan)
  }

  /**
   * The Free card used to navigate to /get-started unconditionally, which meant
   * a signed-in Pro subscriber clicking it was shown the sign-UP modal — the
   * "why is the Free plan still offered to me after I paid?" complaint. Every
   * paid card already checked the session; this one never did.
   *
   *  • signed out        → open signup, same as the paid cards
   *  • signed in, free   → nothing to sign up for; send them to the upload box
   *  • signed in, paid   → not an offer at all, so the card does nothing
   */
  function handleFreePlan() {
    if (!user) { openAuthModal(); return }
    if (isPaidSubscriber) return
    navigate('/#upload-section')
  }

  /** Business is provisioned by sales, so its CTA goes to the contact form. */
  function handleContactSales() {
    navigate('/contact?plan=business')
  }

  /**
   * `currentPlan` falls back to 'free' for signed-out visitors, so without the
   * user check every visitor was told the Free card was "Your plan" before they
   * had an account at all.
   */
  function planBadge(name: string) {
    return user && currentPlan === name
      ? <span className="pricing-current-badge">{t('pricing.yourPlan')}</span>
      : null
  }

  /**
   * The recommendation ribbon and the "Your plan" chip both dock centred on the
   * card's top edge, so on a subscriber's own card they overlapped. Which plan
   * you are on beats which plan we recommend, so the ribbon stands down there.
   */
  function recommendBadge(name: string, labelKey: string, cls = '') {
    return currentPlan === name
      ? null
      : <span className={`pricing-badge${cls}`}>{t(labelKey)}</span>
  }

  const FAQS = [
    {
      q: t('pricing.faq1Q'),
      // Same config as the Free card above, so the answer cannot contradict it.
      a: t('pricing.faq1A')
        .replace('{n}', String(freeReports))
        .replace('{pages}', String(cfg.plans.free.maxPages))
        .replace('{docs}', String(cfg.plans.free.maxDocs)),
    },
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

  // "500 AI Credits" means nothing to a first-time visitor; "~25 analyses per
  // month" does. Both are shown, but the analysis count leads. Derived from the
  // same config as everything else, so an admin editing credits or credit costs
  // updates this too — rounded to a multiple of five because it is an estimate,
  // not a quota.
  function analysesPerMonth(plan: 'starter' | 'pro'): number {
    const credits = cfg.plans[plan].credits ?? 0
    return Math.max(1, Math.round(credits / typicalReportCost / 5) * 5)
  }
  const analysesLabel = (plan: 'starter' | 'pro') =>
    t('pricing.analysesPerMonth').replace('{n}', String(analysesPerMonth(plan)))
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
          <button className="pricing-banner-dismiss" onClick={() => setDismissedBanner(bannerFromUrl)}>✕</button>
        </div>
      )}
      {banner === 'canceled' && (
        <div className="pricing-banner pricing-banner--canceled">
          <span>Payment was canceled. No charge was made.</span>
          <button className="pricing-banner-dismiss" onClick={() => setDismissedBanner(bannerFromUrl)}>✕</button>
        </div>
      )}

      <section className="pricing-section">
        <div className="container">
          <div className="pricing-grid pricing-grid--4col">

            {/* FREE
                Every card below repeats the same slot order — name, tagline,
                price, headline figure + supporting line, CTA, subtitle,
                divider, features, closing note. The headline/supporting slot is
                rendered even where there is no credit figure to show, because
                skipping it on Free and Business was what pushed their CTAs and
                dividers ~65px out of line with Starter and Pro. */}
            <div
              className={`pricing-card${isPaidSubscriber ? ' pricing-card--inactive' : ''}`}
              onClick={handleFreePlan}
            >
              {planBadge('free')}
              <p className="pricing-plan-name">{t('pricing.free')}</p>
              <p className="pricing-plan-tagline">{t('pricing.freeTagline')}</p>
              <div className="pricing-price-row">
                <span className="pricing-price">{formatPrice(cfg.plans.free.priceCents)}</span>
                <span className="pricing-period">{t('pricing.freePeriodLabel')}</span>
              </div>
              <p className="pricing-analyses">
                {t('pricing.freeReportsLine').replace('{n}', String(freeReports))}
              </p>
              <p className="pricing-analyses-sub">{freeLimits}</p>
              <button
                type="button"
                className="pricing-cta btn-outline"
                disabled={isPaidSubscriber}
                onClick={e => { e.stopPropagation(); handleFreePlan() }}
              >
                {freeCtaLabel}
              </button>
              <p className="pricing-plan-subtitle">{t('pricing.freeSubtitle')}</p>
              <p className="pricing-free-note">{t('pricing.freeOneTimeNote')}</p>
              <div className="pricing-divider" />
              <ul className="pricing-features">
                {(['freeF3','freeF4','freeF5','freeF6'] as const).map(k => (
                  <li key={k} className="pricing-feat pricing-feat--yes">
                    <span className="feat-icon feat-icon--yes">✓</span>
                    <span>{t(`pricing.${k}`)
                      .replace('{n}', String(freeReports))
                      .replace('{pages}', String(cfg.plans.free.maxPages))
                      .replace('{docs}', String(cfg.plans.free.maxDocs))
                      .replace('{questions}', String(cfg.plans.free.assistantQuestions))}</span>
                  </li>
                ))}
                {(['freeMiss1','freeMiss2','freeMiss3'] as const).map(k => (
                  <li key={k} className="pricing-feat pricing-feat--no">
                    <span className="feat-icon feat-icon--no">✕</span>
                    <span>{t(`pricing.${k}`)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* STARTER — flagged "Best Value" in green so it reads as a distinct
                recommendation from Pro's blue "Most Popular". */}
            <div className="pricing-card pricing-card--value" onClick={() => handlePaidPlan('starter')}>
              {recommendBadge('starter', 'pricing.bestValue', ' pricing-badge--value')}
              {planBadge('starter')}
              <p className="pricing-plan-name">{t('pricing.starter')}</p>
              <p className="pricing-plan-tagline">{t('pricing.starterTagline')}</p>
              <div className="pricing-price-row">
                <span className="pricing-price">{formatPrice(cfg.plans.starter.priceCents)}</span>
                <span className="pricing-period">{t('pricing.starterPeriod')}</span>
              </div>
              <p className="pricing-analyses">{analysesLabel('starter')}</p>
              <p className="pricing-analyses-sub">
                {t('pricing.starterF1').replace('{credits}', starterCredits)}
              </p>
              <button
                className="pricing-cta btn-outline pricing-cta--value"
                onClick={() => handlePaidPlan('starter')}
              >
                {t('pricing.starterCta')}
              </button>
              <p className="pricing-plan-subtitle">
                {t('pricing.docsSubtitle').replace('{docs}', String(cfg.plans.starter.maxDocs))}
              </p>
              <p className="pricing-free-note" aria-hidden="true" />
              <div className="pricing-divider" />
              <ul className="pricing-features">
                {/* F1 is the credit line, now shown under the price above. */}
                {(['starterF4','starterF5','starterF6','starterF7','starterF8','starterF9'] as const).map(k => (
                  <li key={k} className="pricing-feat pricing-feat--yes">
                    <span className="feat-icon feat-icon--yes">✓</span>
                    <span>{t(`pricing.${k}`)
                      .replace('{credits}', starterCredits)
                      .replace('{n}', String(analysesPerMonth('starter')))
                      .replace('{docs}', String(cfg.plans.starter.maxDocs))}</span>
                  </li>
                ))}
              </ul>
              <p className="pricing-disclaimer">{t('pricing.creditDisclaimer')}</p>
            </div>

            {/* PRO */}
            <div className="pricing-card pricing-card--highlight" onClick={() => handlePaidPlan('pro')}>
              {recommendBadge('pro', 'pricing.mostPopular')}
              {planBadge('pro')}
              <p className="pricing-plan-name">{t('pricing.pro')}</p>
              <p className="pricing-plan-tagline">{t('pricing.proTagline')}</p>
              <div className="pricing-price-row">
                <span className="pricing-price">{formatPrice(cfg.plans.pro.priceCents)}</span>
                <span className="pricing-period">{t('pricing.proPeriod')}</span>
              </div>
              <p className="pricing-analyses">{analysesLabel('pro')}</p>
              <p className="pricing-analyses-sub">
                {t('pricing.proF1').replace('{credits}', proCredits)}
              </p>
              <button
                className="pricing-cta btn-primary"
                onClick={() => handlePaidPlan('pro')}
              >
                {t('pricing.proCta')}
              </button>
              <p className="pricing-plan-subtitle">
                {t('pricing.docsSubtitle').replace('{docs}', String(cfg.plans.pro.maxDocs))}
              </p>
              <p className="pricing-free-note" aria-hidden="true" />
              <div className="pricing-divider" />
              <ul className="pricing-features">
                {/* F1 is the credit line, now shown under the price above. */}
                {(['proF2','proF4','proF5','proF6'] as const).map(k => (
                  <li key={k} className="pricing-feat pricing-feat--yes">
                    <span className="feat-icon feat-icon--yes">✓</span>
                    <span>{t(`pricing.${k}`)
                      .replace('{credits}', proCredits)
                      .replace('{docs}', String(cfg.plans.pro.maxDocs))}</span>
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
              <p className="pricing-analyses">{t('pricing.customAnalysesLine')}</p>
              <p className="pricing-analyses-sub">{t('pricing.customF1')}</p>
              <button
                className="pricing-cta btn-outline"
                onClick={e => { e.stopPropagation(); handleContactSales() }}
              >
                {t('pricing.customCta')}
              </button>
              <p className="pricing-plan-subtitle">{t('pricing.customSubtitle')}</p>
              <p className="pricing-free-note" aria-hidden="true" />
              <div className="pricing-divider" />
              <ul className="pricing-features">
                {(['customF2','customF3','customF4','customF5'] as const).map(k => (
                  <li key={k} className="pricing-feat pricing-feat--yes">
                    <span className="feat-icon feat-icon--yes">✓</span>
                    <span>{t(`pricing.${k}`)}</span>
                  </li>
                ))}
              </ul>
              <p className="pricing-disclaimer">{t('pricing.customDisclaimer')}</p>
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
