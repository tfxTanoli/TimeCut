import { useState, useEffect } from 'react'
import Footer from '../components/Footer'
import LegalDoc, { type LegalBlock } from '../components/LegalDoc'
import { useTranslation } from '../hooks/useTranslation'
import { getCachedPlanConfig, getPlanConfig, formatPrice, type PlanConfig } from '../lib/planConfig'
import { LEGAL_OPERATOR, hasGoverningLaw, hasOperatorIdentity, hasOperatorName } from '../lib/legal'

const UNLIMITED = 9999

export default function TermsPage() {
  const { t } = useTranslation()
  // Prices come from the shared plan config (config/plans) so the legal copy
  // stays in step with the pricing page instead of drifting.
  const [cfg, setCfg] = useState<PlanConfig>(getCachedPlanConfig())
  useEffect(() => { getPlanConfig().then(setCfg).catch(() => {}) }, [])

  const priceLabel = (cents: number | null) =>
    cents == null ? t('terms.priceCustom') : t('terms.pricePerMonth').replace('{price}', formatPrice(cents))
  const creditsLabel = (credits: number | null) =>
    credits == null ? t('terms.creditsCustom')
      : credits >= UNLIMITED ? t('terms.creditsUnlimited')
        : t('terms.creditsPerMonth').replace('{n}', credits.toLocaleString())
  const paidPlan = (key: string, plan: 'starter' | 'pro' | 'business') =>
    t(key)
      .replace('{credits}', creditsLabel(cfg.plans[plan].credits))
      .replace('{price}', priceLabel(cfg.plans[plan].priceCents))

  const blocks: LegalBlock[] = [
    { h: t('terms.s1h') }, { p: t('terms.s1p') },

    // Section 2 used to say the service analyzes "text, URLs, and PDF
    // documents". There is no URL analysis, and the product now centres on
    // decision reports over uploaded documents.
    { h: t('terms.s2h') }, { p: t('terms.s2p') },

    { h: t('terms.s3h') }, { p: t('terms.s3p') },
    { ul: [t('terms.s3b1'), t('terms.s3b2'), t('terms.s3b3')] },

    { h: t('terms.s4h') }, { p: t('terms.s4p') },
    {
      ul: [
        t('terms.planFree').replace('{n}', String(cfg.plans.free.freeReports ?? 1)),
        paidPlan('terms.planStarter', 'starter'),
        paidPlan('terms.planPro', 'pro'),
        paidPlan('terms.planBusiness', 'business'),
      ],
    },

    // Statutory 14-day withdrawal right for EU/UK consumers, which the Terms
    // did not mention at all.
    { h: t('terms.s5h') }, { p: t('terms.s5p1') }, { p: t('terms.s5p2') }, { p: t('terms.s5p3') },

    { h: t('terms.s6h') }, { p: t('terms.s6p') },
    { ul: [t('terms.s6b1'), t('terms.s6b2'), t('terms.s6b3'), t('terms.s6b4'), t('terms.s6b5')] },

    { h: t('terms.s7h') }, { p: t('terms.s7p') },
    { h: t('terms.s8h') }, { p: t('terms.s8p') },
    { h: t('terms.s9h') }, { p: t('terms.s9p') },
    { h: t('terms.s10h') }, { p: t('terms.s10p') },
    { h: t('terms.s11h') }, { p: t('terms.s11p') },

    { h: t('terms.s12h') },
    {
      p: hasGoverningLaw()
        ? t('terms.s12pConfigured')
          .replace('{law}', LEGAL_OPERATOR.governingLaw)
          .replace('{courts}', LEGAL_OPERATOR.courts)
        : t('terms.s12pDefault'),
    },

    { h: t('terms.s13h') }, { p: t('terms.s13p') },

    { h: t('terms.s14h') },
    ...(hasOperatorIdentity()
      ? [{
          p: t('terms.s14pEntity')
            .replace('{entity}', LEGAL_OPERATOR.entityName)
            .replace('{address}', LEGAL_OPERATOR.address),
        }]
      : hasOperatorName()
        ? [{ p: t('terms.s14pEntityName').replace('{entity}', LEGAL_OPERATOR.entityName) }]
        : []),
    { p: t('terms.s14pContact') },
  ]

  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">{t('legal.badge')}</span>
          <h1 className="page-hero-title">{t('terms.title')}</h1>
          <p className="page-hero-sub">{t('terms.updated')}</p>
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
