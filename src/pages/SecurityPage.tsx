import Footer from '../components/Footer'
import LegalDoc, { type LegalBlock } from '../components/LegalDoc'
import { useTranslation } from '../hooks/useTranslation'

/**
 * Public /security page. The footer has always linked here, but the route did
 * not exist, so the link rendered a blank page.
 *
 * Everything stated below describes what the product actually does today —
 * Firebase Auth with verified email, per-account Firestore rules, server-side
 * ID-token verification on every paid route, Stripe-hosted payment data, and
 * uploads that are parsed in memory and never persisted. Keep it in sync with
 * the code if any of that changes.
 */
export default function SecurityPage() {
  const { t } = useTranslation()

  const blocks: LegalBlock[] = [
    { h: t('security.s1h') },
    { ul: [t('security.s1b1'), t('security.s1b2'), t('security.s1b3'), t('security.s1b4'), t('security.s1b5')] },

    { h: t('security.s2h') }, { p: t('security.s2p1') }, { p: t('security.s2p2') }, { p: t('security.s2p3') },

    { h: t('security.s3h') }, { p: t('security.s3p') },

    { h: t('security.s4h') }, { p: t('security.s4p') },
    { ul: [t('security.s4b1'), t('security.s4b2'), t('security.s4b3')] },

    { h: t('security.s5h') }, { p: t('security.s5p') },
    { ul: [t('security.s5b1'), t('security.s5b2'), t('security.s5b3'), t('security.s5b4')] },

    { h: t('security.s6h') }, { p: t('security.s6p1') }, { p: t('security.s6p2') },

    { h: t('security.s7h') }, { p: t('security.s7p') },
    { ul: [t('security.s7b1'), t('security.s7b2'), t('security.s7b3'), t('security.s7b4'), t('security.s7b5')] },

    { h: t('security.s8h') }, { p: t('security.s8p') },
    { h: t('security.s9h') }, { p: t('security.s9p') },
    { h: t('security.s10h') }, { p: t('security.s10p') },
    { h: t('security.s11h') }, { p: t('security.s11p') },
  ]

  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">{t('security.badge')}</span>
          <h1 className="page-hero-title">{t('security.title')}</h1>
          <p className="page-hero-sub">{t('security.sub')}</p>
        </div>
      </section>

      <section style={{ padding: '56px 0 80px' }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <LegalDoc blocks={blocks} />
        </div>
      </section>

      <Footer />
    </>
  )
}
