import { Link } from 'react-router-dom'
import { useTranslation } from '../hooks/useTranslation'

export default function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand-block">
          <div className="footer-logo-wrap">
            <img src="/timecut-logo.webp" alt="TimeCut" className="footer-logo-img" />
            <span className="footer-logo-text">TIMECUT</span>
          </div>
          <p className="footer-tagline">{t('footer.tagline')}</p>
        </div>
        <div className="footer-links-grid">
          <div>
            <p className="footer-col-title">{t('footer.product')}</p>
            <ul className="footer-col-links">
              <li><Link to="/how-it-works">{t('footer.howItWorks')}</Link></li>
              <li><Link to="/features">{t('footer.features')}</Link></li>
              <li><Link to="/examples">{t('footer.examples')}</Link></li>
              <li><Link to="/pricing">{t('footer.pricing')}</Link></li>
            </ul>
          </div>
          <div>
            <p className="footer-col-title">{t('footer.company')}</p>
            <ul className="footer-col-links">
              <li><Link to="/blog">{t('footer.blog')}</Link></li>
              <li><a href="#">{t('footer.about')}</a></li>
              <li><a href="#">{t('footer.privacy')}</a></li>
              <li><a href="#">{t('footer.terms')}</a></li>
            </ul>
          </div>
          <div>
            <p className="footer-col-title">{t('footer.account')}</p>
            <ul className="footer-col-links">
              <li><Link to="/login">{t('footer.logIn')}</Link></li>
              <li><Link to="/get-started">{t('footer.getStarted')}</Link></li>
            </ul>
          </div>
          <div>
            <p className="footer-col-title">{t('footer.contact')}</p>
            <ul className="footer-col-links">
              <li><Link to="/contact">{t('footer.sendMessage')}</Link></li>
              <li><Link to="/contact">{t('footer.featureRequest')}</Link></li>
              <li><Link to="/contact">{t('footer.leaveFeedback')}</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="footer-bottom container">
        <p>© {new Date().getFullYear()} TimeCut. {t('footer.copyright').replace('© {year} TimeCut. ', '')}</p>
      </div>
      <p className="footer-powered-by">{t('footer.poweredBy')}</p>
    </footer>
  )
}
