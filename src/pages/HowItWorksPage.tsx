import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import { useTranslation } from '../hooks/useTranslation'

export default function HowItWorksPage() {
  const { t } = useTranslation()

  const STEPS = [
    {
      num: t('hiw.step1Num'),
      title: t('hiw.step1Title'),
      desc: t('hiw.step1Desc'),
      details: [t('hiw.step1Detail1'), t('hiw.step1Detail2'), t('hiw.step1Detail3'), t('hiw.step1Detail4')],
    },
    {
      num: t('hiw.step2Num'),
      title: t('hiw.step2Title'),
      desc: t('hiw.step2Desc'),
      details: [t('hiw.step2Detail1'), t('hiw.step2Detail2'), t('hiw.step2Detail3'), t('hiw.step2Detail4')],
    },
    {
      num: t('hiw.step3Num'),
      title: t('hiw.step3Title'),
      desc: t('hiw.step3Desc'),
      details: [t('hiw.step3Detail1'), t('hiw.step3Detail2'), t('hiw.step3Detail3'), t('hiw.step3Detail4')],
    },
  ]

  const ANATOMY = [
    { icon: '⚖️', label: t('hiw.anatomyVerdict'), desc: t('hiw.anatomyVerdictDesc') },
    { icon: '⭐', label: t('hiw.anatomyValueScore'), desc: t('hiw.anatomyValueScoreDesc') },
    { icon: '⏱', label: t('hiw.anatomyTimeSaved'), desc: t('hiw.anatomyTimeSavedDesc') },
    { icon: '📊', label: t('hiw.anatomyAttention'), desc: t('hiw.anatomyAttentionDesc') },
    { icon: '💡', label: t('hiw.anatomyKeyInsights'), desc: t('hiw.anatomyKeyInsightsDesc') },
    { icon: '🚫', label: t('hiw.anatomyWhatSkip'), desc: t('hiw.anatomyWhatSkipDesc') },
    { icon: '👥', label: t('hiw.anatomyBestFor'), desc: t('hiw.anatomyBestForDesc') },
    { icon: '✅', label: t('hiw.anatomyFinalDecision'), desc: t('hiw.anatomyFinalDecisionDesc') },
  ]

  const FAQS = [
    { q: t('hiw.faq1Q'), a: t('hiw.faq1A') },
    { q: t('hiw.faq2Q'), a: t('hiw.faq2A') },
    { q: t('hiw.faq3Q'), a: t('hiw.faq3A') },
    { q: t('hiw.faq4Q'), a: t('hiw.faq4A') },
    { q: t('hiw.faq5Q'), a: t('hiw.faq5A') },
  ]

  return (
    <>
      <section className="page-hero page-hero--green">
        <div className="container page-hero-inner">
          <span className="hero-badge">{t('hiw.badge')}</span>
          <h1 className="page-hero-title">{t('hiw.title')}</h1>
          <p className="page-hero-sub">{t('hiw.subtitle')}</p>
          <Link to="/" className="btn-primary btn-cta">{t('hiw.tryFree')}</Link>
        </div>
      </section>

      <section className="hiw-steps">
        <div className="container">
          {STEPS.map((step, i) => (
            <div key={i} className={`hiw-step ${i % 2 === 1 ? 'hiw-step--reverse' : ''}`}>
              <div className="hiw-step-num-block">
                <span className="hiw-step-num">{step.num}</span>
              </div>
              <div className="hiw-step-body">
                <h2 className="hiw-step-title">{step.title}</h2>
                <p className="hiw-step-desc">{step.desc}</p>
                <ul className="hiw-step-list">
                  {step.details.map((d, j) => (
                    <li key={j}><span className="check-icon">✓</span> {d}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="report-anatomy">
        <div className="container">
          <p className="section-eyebrow">{t('hiw.whatYouGet')}</p>
          <h2 className="section-title">{t('hiw.insideReport')}</h2>
          <div className="anatomy-grid">
            {ANATOMY.map((item, i) => (
              <div key={i} className="anatomy-card">
                <span className="anatomy-emoji">{item.icon}</span>
                <p className="anatomy-label">{item.label}</p>
                <p className="anatomy-desc">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="faq-section">
        <div className="container faq-inner">
          <h2 className="section-title">{t('hiw.faqTitle')}</h2>
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
          <h2>{t('hiw.ctaTitle')}</h2>
          <p>{t('hiw.ctaSub')}</p>
          <Link to="/" className="btn-primary btn-cta">{t('hiw.ctaBtn')}</Link>
        </div>
      </section>

      <Footer />
    </>
  )
}
