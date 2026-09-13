import Footer from '../components/Footer'
import LegalDoc, { type LegalBlock } from '../components/LegalDoc'
import { useTranslation } from '../hooks/useTranslation'
import { LEGAL_OPERATOR, hasOperatorIdentity, hasOperatorName } from '../lib/legal'

export default function PrivacyPage() {
  const { t } = useTranslation()

  const blocks: LegalBlock[] = [
    // Saved reports are part of what is collected. The policy used to say
    // analysed content was "not stored permanently", which stopped being true
    // once reports were saved to the account.
    { h: t('privacy.s1h') }, { p: t('privacy.s1p') },

    { h: t('privacy.s2h') }, { p: t('privacy.s2p') },
    { ul: [t('privacy.s2b1'), t('privacy.s2b2'), t('privacy.s2b3'), t('privacy.s2b4')] },

    { h: t('privacy.s3h') }, { p: t('privacy.s3p1') }, { p: t('privacy.s3p2') },

    { h: t('privacy.s4h') }, { p: t('privacy.s4p') },

    // Signing up is not marketing consent; see the signup form, which no
    // longer asks the user to "agree to receive email communication".
    { h: t('privacy.s5h') }, { p: t('privacy.s5p') },

    { h: t('privacy.s6h') }, { p: t('privacy.s6p') },
    { ul: [t('privacy.s6b1'), t('privacy.s6b2'), t('privacy.s6b3'), t('privacy.s6b4'), t('privacy.s6b5')] },

    { h: t('privacy.s7h') }, { p: t('privacy.s7p') },
    { h: t('privacy.s8h') }, { p: t('privacy.s8p') },
    { h: t('privacy.s9h') }, { p: t('privacy.s9p') },
    { h: t('privacy.s10h') }, { p: t('privacy.s10p') },

    { h: t('privacy.s11h') },
    ...(hasOperatorIdentity()
      ? [{
          p: t('privacy.s11pEntity')
            .replace('{entity}', LEGAL_OPERATOR.entityName)
            .replace('{address}', LEGAL_OPERATOR.address),
        }]
      : hasOperatorName()
        ? [{ p: t('privacy.s11pEntityName').replace('{entity}', LEGAL_OPERATOR.entityName) }]
        : []),
    { p: t('privacy.s11p') },
  ]

  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">{t('legal.badge')}</span>
          <h1 className="page-hero-title">{t('privacy.title')}</h1>
          <p className="page-hero-sub">{t('privacy.updated')}</p>
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
