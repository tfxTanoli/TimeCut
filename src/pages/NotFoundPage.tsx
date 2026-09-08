import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import { useTranslation } from '../hooks/useTranslation'

/**
 * Catch-all for unmatched routes. Without it an unknown path (a stale link, a
 * typo, a footer entry whose route was never added) rendered nothing at all
 * below the navbar, which reads as a broken site rather than a wrong address.
 */
export default function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">{t('nf.code')}</span>
          <h1 className="page-hero-title">{t('nf.title')}</h1>
          <p className="page-hero-sub">{t('nf.subtitle')}</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 28 }}>
            <Link to="/" className="btn-primary btn-cta">{t('nf.home')}</Link>
            <Link to="/contact" className="btn-outline btn-cta">{t('nf.contact')}</Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}
