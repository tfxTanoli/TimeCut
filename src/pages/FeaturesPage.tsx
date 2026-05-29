import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import { useTranslation } from '../hooks/useTranslation'

export default function FeaturesPage() {
  const { t } = useTranslation()

  const FEATURES = [
    { emoji: '⚖️', title: t('features.f1Title'), desc: t('features.f1Desc'), color: 'purple' },
    { emoji: '⭐', title: t('features.f2Title'), desc: t('features.f2Desc'), color: 'amber' },
    { emoji: '⏱', title: t('features.f3Title'), desc: t('features.f3Desc'), color: 'green' },
    { emoji: '📊', title: t('features.f4Title'), desc: t('features.f4Desc'), color: 'blue' },
    { emoji: '💡', title: t('features.f5Title'), desc: t('features.f5Desc'), color: 'purple' },
    { emoji: '🚫', title: t('features.f6Title'), desc: t('features.f6Desc'), color: 'red' },
    { emoji: '👥', title: t('features.f7Title'), desc: t('features.f7Desc'), color: 'amber' },
    { emoji: '✅', title: t('features.f8Title'), desc: t('features.f8Desc'), color: 'green' },
    { emoji: '📄', title: t('features.f9Title'), desc: t('features.f9Desc'), color: 'blue' },
    { emoji: '🌍', title: t('features.f10Title'), desc: t('features.f10Desc'), color: 'purple' },
  ]

  return (
    <>
      <section className="page-hero page-hero--features">
        <div className="container page-hero-inner">
          <span className="hero-badge">{t('features.badge')}</span>
          <h1 className="page-hero-title">{t('features.title')}</h1>
          <p className="page-hero-sub">{t('features.subtitle')}</p>
          <Link to="/" className="btn-primary btn-cta">{t('features.tryFree')}</Link>
        </div>
      </section>

      <section className="features-main-section">
        <div className="container">
          <div className="features-big-grid">
            {FEATURES.map((f, i) => (
              <div key={i} className={`feature-big-card feature-big-card--${f.color}`}>
                <span className="feature-big-emoji">{f.emoji}</span>
                <h3 className="feature-big-title">{f.title}</h3>
                <p className="feature-big-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="comparison-section">
        <div className="container">
          <p className="section-eyebrow">{t('features.compEyebrow')}</p>
          <h2 className="section-title">{t('features.compTitle')}</h2>
          <div className="comparison-grid">
            <div className="comparison-col comparison-col--bad">
              <h3>{t('features.compBadTitle')}</h3>
              <ul>
                <li>{t('features.compBad1')}</li>
                <li>{t('features.compBad2')}</li>
                <li>{t('features.compBad3')}</li>
                <li>{t('features.compBad4')}</li>
                <li>{t('features.compBad5')}</li>
              </ul>
            </div>
            <div className="comparison-col comparison-col--good">
              <h3>{t('features.compGoodTitle')}</h3>
              <ul>
                <li>{t('features.compGood1')}</li>
                <li>{t('features.compGood2')}</li>
                <li>{t('features.compGood3')}</li>
                <li>{t('features.compGood4')}</li>
                <li>{t('features.compGood5')}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="page-cta-section">
        <div className="container page-cta-inner">
          <h2>{t('features.ctaTitle')}</h2>
          <p>{t('features.ctaSub')}</p>
          <Link to="/" className="btn-primary btn-cta">{t('features.ctaBtn')}</Link>
        </div>
      </section>

      <Footer />
    </>
  )
}
