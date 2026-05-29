import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import { useTranslation } from '../hooks/useTranslation'

export default function PricingPage() {
  const { t } = useTranslation()

  const PLANS = [
    {
      name: t('pricing.free'),
      price: '$0',
      period: t('pricing.freePeriod'),
      desc: t('pricing.freeDesc'),
      cta: t('pricing.freeCta'),
      ctaTo: '/',
      highlight: false,
      features: [
        t('pricing.feat3Analyses'),
        t('pricing.featPasteText'),
        t('pricing.featFullReport'),
        t('pricing.feat12Lang'),
        t('pricing.featAll8Fields'),
        t('pricing.featStandardSpeed'),
      ],
      missing: [t('pricing.missingPDF'), t('pricing.missingPriority'), t('pricing.missingHistory'), t('pricing.missingAPI')],
    },
    {
      name: t('pricing.pro'),
      price: '$7',
      period: t('pricing.proPeriod'),
      desc: t('pricing.proDesc'),
      cta: t('pricing.proCta'),
      ctaTo: '/get-started',
      highlight: true,
      features: [
        t('pricing.featUnlimited'),
        t('pricing.featPastePDF'),
        t('pricing.featFullReport'),
        t('pricing.feat12Lang'),
        t('pricing.featAll8Fields'),
        t('pricing.featPrioritySpeed'),
        t('pricing.featHistory'),
        t('pricing.featDownload'),
      ],
      missing: [t('pricing.missingAPI'), t('pricing.missingTeam')],
    },
    {
      name: t('pricing.enterprise'),
      price: 'Custom',
      period: t('pricing.enterprisePeriod'),
      desc: t('pricing.enterpriseDesc'),
      cta: t('pricing.enterpriseCta'),
      ctaTo: '/get-started',
      highlight: false,
      features: [
        t('pricing.featEverythingPro'),
        t('pricing.featAPI'),
        t('pricing.featTeam'),
        t('pricing.featIntegrations'),
        t('pricing.featSupport'),
        t('pricing.featSLA'),
        t('pricing.featLangPacks'),
        t('pricing.featAnalytics'),
      ],
      missing: [],
    },
  ]

  const FAQS = [
    { q: t('pricing.faq1Q'), a: t('pricing.faq1A') },
    { q: t('pricing.faq2Q'), a: t('pricing.faq2A') },
    { q: t('pricing.faq3Q'), a: t('pricing.faq3A') },
    { q: t('pricing.faq4Q'), a: t('pricing.faq4A') },
    { q: t('pricing.faq5Q'), a: t('pricing.faq5A') },
  ]

  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">{t('pricing.badge')}</span>
          <h1 className="page-hero-title">{t('pricing.title')}</h1>
          <p className="page-hero-sub">{t('pricing.subtitle')}</p>
        </div>
      </section>

      <section className="pricing-section">
        <div className="container">
          <div className="pricing-grid">
            {PLANS.map((plan, i) => (
              <div key={i} className={`pricing-card ${plan.highlight ? 'pricing-card--highlight' : ''}`}>
                {plan.highlight && <span className="pricing-badge">{t('pricing.mostPopular')}</span>}
                <p className="pricing-name">{plan.name}</p>
                <div className="pricing-price-row">
                  <span className="pricing-price">{plan.price}</span>
                  {plan.price !== 'Custom' && plan.period && <span className="pricing-period">/{plan.period}</span>}
                </div>
                <p className="pricing-desc">{plan.desc}</p>
                <Link
                  to={plan.ctaTo}
                  className={`pricing-cta ${plan.highlight ? 'btn-primary' : 'btn-outline'}`}
                >
                  {plan.cta}
                </Link>
                <div className="pricing-divider" />
                <ul className="pricing-features">
                  {plan.features.map((f, j) => (
                    <li key={j} className="pricing-feat pricing-feat--yes">
                      <span className="feat-icon feat-icon--yes">✓</span> {f}
                    </li>
                  ))}
                  {plan.missing.map((f, j) => (
                    <li key={j} className="pricing-feat pricing-feat--no">
                      <span className="feat-icon feat-icon--no">×</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
          <Link to="/" className="btn-primary btn-cta">{t('pricing.ctaBtn')}</Link>
        </div>
      </section>

      <Footer />
    </>
  )
}
