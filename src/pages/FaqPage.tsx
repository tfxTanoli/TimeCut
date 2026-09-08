import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import { useTranslation } from '../hooks/useTranslation'

interface Faq {
  q: string
  a: string
  bullets?: string[]
  note?: string
}

/**
 * Public /faq page. The footer has always linked here, but the route did not
 * exist, so the link rendered a blank page.
 *
 * Every answer reuses the translated strings that already back the FAQ blocks
 * on How it Works and Pricing, so the three pages can never drift apart, plus
 * a `faqp.*` set for the questions only asked here.
 */
export default function FaqPage() {
  const { t } = useTranslation()

  const CATEGORIES: { title: string; faqs: Faq[] }[] = [
    {
      title: t('faqp.catProduct'),
      faqs: [
        { q: t('hiw.faq1Q'), a: t('hiw.faq1A') },
        { q: t('hiw.faq2Q'), a: t('hiw.faq2A') },
        { q: t('hiw.faq3Q'), a: t('hiw.faq3A') },
        { q: t('hiw.faq8Q'), a: t('hiw.faq8A') },
        { q: t('hiw.faq9Q'), a: t('hiw.faq9A') },
        { q: t('faqp.q1Q'),  a: t('faqp.q1A') },
      ],
    },
    {
      title: t('faqp.catDocuments'),
      faqs: [
        { q: t('hiw.faq4Q'), a: t('hiw.faq4A') },
        { q: t('faqp.q2Q'),  a: t('faqp.q2A') },
        { q: t('faqp.q3Q'),  a: t('faqp.q3A') },
        { q: t('faqp.q5Q'),  a: t('faqp.q5A') },
        { q: t('faqp.q4Q'),  a: t('faqp.q4A') },
        { q: t('hiw.faq5Q'), a: t('hiw.faq5A') },
      ],
    },
    {
      title: t('faqp.catPricing'),
      faqs: [
        { q: t('pricing.faq1Q'), a: t('pricing.faq1A') },
        { q: t('pricing.faq2Q'), a: t('pricing.faq2A') },
        {
          q: t('pricing.faq6Q'),
          a: t('pricing.faq6A'),
          bullets: [t('pricing.faq6B1'), t('pricing.faq6B2'), t('pricing.faq6B3'), t('pricing.faq6B4')],
          note: t('pricing.faq6Note'),
        },
        { q: t('pricing.faq3Q'), a: t('pricing.faq3A') },
        { q: t('pricing.faq4Q'), a: t('pricing.faq4A') },
        { q: t('pricing.faq5Q'), a: t('pricing.faq5A') },
        { q: t('faqp.q6Q'),      a: t('faqp.q6A') },
      ],
    },
    {
      title: t('faqp.catAccount'),
      faqs: [
        { q: t('hiw.faq7Q'), a: t('hiw.faq7A') },
        { q: t('faqp.q7Q'),  a: t('faqp.q7A') },
        { q: t('faqp.q8Q'),  a: t('faqp.q8A') },
      ],
    },
  ]

  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">{t('faqp.badge')}</span>
          <h1 className="page-hero-title">{t('faqp.title')}</h1>
          <p className="page-hero-sub">{t('faqp.subtitle')}</p>
        </div>
      </section>

      <section className="faq-section">
        <div className="container faq-inner">
          {CATEGORIES.map((cat, ci) => (
            <div key={ci} style={{ marginBottom: ci === CATEGORIES.length - 1 ? 0 : 44 }}>
              <h2 className="section-title" style={{ marginBottom: 20 }}>{cat.title}</h2>
              <div className="faq-list">
                {cat.faqs.map((faq, i) => (
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
          ))}

          <div className="faq-footer">
            <h3>{t('hiw.faqFooterTitle')}</h3>
            <p>{t('hiw.faqFooterSub')}</p>
            <p style={{ marginTop: 16 }}>
              <Link to="/contact" className="btn-primary btn-cta">{t('hiw.faqFooterCta')}</Link>
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}
