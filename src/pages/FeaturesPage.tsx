import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import { useTranslation } from '../hooks/useTranslation'

export default function FeaturesPage() {
  const { t } = useTranslation()

  const FEATURES = [
    {
      emoji: '📋', title: t('features.f1Title'), desc: t('features.f1Desc'), color: 'purple',
      items: [t('features.f1Item1'), t('features.f1Item2'), t('features.f1Item3'), t('features.f1Item4')],
    },
    {
      emoji: '🚨', title: t('features.f2Title'), desc: t('features.f2Desc'), color: 'red',
      items: [t('features.f2Item1'), t('features.f2Item2'), t('features.f2Item3'), t('features.f2Item4'), t('features.f2Item5')],
    },
    {
      emoji: '📄', title: t('features.f3Title'), desc: t('features.f3Desc'), color: 'blue',
      items: [t('features.f3Item1'), t('features.f3Item2'), t('features.f3Item3'), t('features.f3Item4')],
    },
    {
      emoji: '🧭', title: t('features.f4Title'), desc: t('features.f4Desc'), color: 'amber',
      items: [t('features.f4Item1'), t('features.f4Item2'), t('features.f4Item3'), t('features.f4Item4'), t('features.f4Item5')],
    },
    {
      emoji: '💬', title: t('features.f5Title'), desc: t('features.f5Desc'), color: 'green',
      items: [t('features.f5Item1'), t('features.f5Item2'), t('features.f5Item3'), t('features.f5Item4'), t('features.f5Item5')],
    },
    {
      emoji: '🗂️', title: t('features.f6Title'), desc: t('features.f6Desc'), color: 'purple',
      items: [t('features.f6Item1'), t('features.f6Item2'), t('features.f6Item3'), t('features.f6Item4'), t('features.f6Item5'), t('features.f6Item6'), t('features.f6Item7')],
    },
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
                {f.items && f.items.length > 0 && (
                  <ul className="feature-big-items">
                    {f.items.map((item, j) => <li key={j}>{item}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="feature-bottom-section">
        <div className="container">
          <h2 className="section-title">{t('features.featBottomTitle')}</h2>
          <p>{t('features.featBottomSub')}</p>
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
