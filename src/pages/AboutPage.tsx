import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import LegalDoc from '../components/LegalDoc'
import { useTranslation } from '../hooks/useTranslation'

export default function AboutPage() {
  const { t } = useTranslation()

  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">{t('about.badge')}</span>
          <h1 className="page-hero-title">{t('about.title')}</h1>
          <p className="page-hero-sub">{t('about.sub')}</p>
        </div>
      </section>

      <section style={{ padding: '56px 0 80px' }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <LegalDoc
            blocks={[
              { p: t('about.p1') },
              { p: t('about.p2') },
              { p: t('about.p3') },
              { p: t('about.p4') },
              { p: t('about.listIntro') },
              {
                ul: [
                  t('about.li1'), t('about.li2'), t('about.li3'), t('about.li4'),
                  t('about.li5'), t('about.li6'), t('about.li7'),
                ],
              },
              { p: t('about.mission') },
              { h: t('about.touchH') },
              { p: t('about.touchP1') },
              { p: t('about.touchP2') },
            ]}
          />
        </div>
      </section>

      <section className="page-cta-section">
        <div className="container page-cta-inner">
          <h2>{t('about.ctaTitle')}</h2>
          {/* This said "No account required", but every analysis needs an
              account — the API meters each report against a verified user. */}
          <p>{t('about.ctaSub')}</p>
          <Link to="/" className="btn-primary btn-cta">{t('about.ctaBtn')}</Link>
        </div>
      </section>

      <Footer />
    </>
  )
}
