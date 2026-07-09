import { useState } from 'react'
import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import { useTranslation } from '../hooks/useTranslation'
import {
  DEMO_TABS, DEMO_TAB_ICON, type DemoTab, type DemoData,
  buildDemoData, LEVEL_LABEL_KEY, LEVEL_COLOR, LEVEL_BG,
} from '../lib/demoData'

function DemoReportCard({ tab, demo, t, defaultOpen }: { tab: DemoTab; demo: DemoData; t: (k: string) => string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="example-card">
      <div className="example-card-header" onClick={() => setOpen(o => !o)}>
        <div className="example-card-meta">
          <span className="verdict-badge verdict-badge--must">{DEMO_TAB_ICON[tab]} {demo.tabLabel}</span>
          <div>
            <p className="example-title">{demo.goal}</p>
            <p className="example-source">{t('home.lpEoRecLabel')}: {demo.recommendation}</p>
          </div>
        </div>
        <div className="example-card-stats">
          <div className="ex-stat">
            <span className="ex-stat-label">{t('home.lpEoStatRisks')}</span>
            <span className="ex-stat-val">{demo.risks.length}</span>
          </div>
          <div className="ex-stat">
            <span className="ex-stat-label">{t('home.lpEoStatMissing')}</span>
            <span className="ex-stat-val">{demo.missing.length}</span>
          </div>
          <button className="example-toggle">{open ? t('examples.collapse') : t('examples.viewReport')}</button>
        </div>
      </div>

      {open && (
        <div className="example-report">
          <div className="lp-eo-expanded" style={{ marginTop: 0 }}>
            {demo.risks.map((risk, i) => (
              <div key={i} className="lp-risk-item lp-risk-item--risk">
                <div className="lp-risk-item__header">
                  <span className="lp-risk-item__badge">🔴 {t('home.lpEoRiskBadge')} #{i + 1}</span>
                  <span className="lp-risk-level-badge" style={{ color: LEVEL_COLOR[risk.level], background: LEVEL_BG[risk.level] }}>
                    {t('home.lpEoRiskLevel')} {t(LEVEL_LABEL_KEY[risk.level])}
                  </span>
                </div>
                <h4 className="lp-risk-item__title">{risk.title}</h4>
                <div className="lp-risk-detail">
                  <div className="lp-risk-detail__row">
                    <span className="lp-risk-detail__key">{t('home.lpEoWhy')}</span>
                    <span className="lp-risk-detail__val">{risk.whyItMatters}</span>
                  </div>
                  <div className="lp-risk-detail__row">
                    <span className="lp-risk-detail__key">{t('home.lpEoAction')}</span>
                    <span className="lp-risk-detail__val">{risk.action}</span>
                  </div>
                  <div className="lp-risk-detail__row">
                    <span className="lp-risk-detail__key lp-risk-detail__key--evidence">{t('home.lpEoEvidence')}</span>
                    <span className="lp-risk-detail__val lp-risk-detail__val--evidence">{risk.evidence}</span>
                  </div>
                </div>
              </div>
            ))}

            {demo.missing.map((item, i) => (
              <div key={i} className="lp-risk-item lp-risk-item--missing">
                <div className="lp-risk-item__header">
                  <span className="lp-risk-item__badge lp-risk-item__badge--missing">🟠 {t('home.lpEoMissingBadge')} #{i + 1}</span>
                </div>
                <h4 className="lp-risk-item__title">{item.title}</h4>
                <div className="lp-risk-detail">
                  <div className="lp-risk-detail__row">
                    <span className="lp-risk-detail__key">{t('home.lpEoWhy')}</span>
                    <span className="lp-risk-detail__val">{item.whyItMatters}</span>
                  </div>
                  <div className="lp-risk-detail__row">
                    <span className="lp-risk-detail__key">{t('home.lpEoAction')}</span>
                    <span className="lp-risk-detail__val">{item.action}</span>
                  </div>
                  <div className="lp-risk-detail__row">
                    <span className="lp-risk-detail__key lp-risk-detail__key--evidence">{t('home.lpEoEvidence')}</span>
                    <span className="lp-risk-detail__val lp-risk-detail__val--evidence">{item.evidence}</span>
                  </div>
                </div>
              </div>
            ))}

            <div className="lp-risk-item lp-risk-item--rec">
              <div className="lp-risk-item__header">
                <span className="lp-risk-item__badge lp-risk-item__badge--rec">🟢 {t('home.lpEoRecBadge')}</span>
              </div>
              <h4 className="lp-risk-item__title lp-risk-item__title--rec">{demo.recommendation}</h4>
              <div className="lp-rec-reasons">
                <span className="lp-rec-reasons__label">{t('home.lpEoReasons')}</span>
                <ul className="lp-rec-reasons__list">
                  {demo.recReasons.map((r, i) => (
                    <li key={i} className="lp-rec-reasons__item">
                      <span className="lp-rec-reasons__check">✓</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
              {demo.decisionDefense && (
                <div className="lp-rec-reasons">
                  <span className="lp-rec-reasons__label">{t('home.lpEoDefenseLabel')}</span>
                  <p className="lp-risk-detail__val">{demo.decisionDefense}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ExamplesPage() {
  const { t } = useTranslation()
  const DEMO_DATA = buildDemoData(t)

  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">{t('examples.badge')}</span>
          <h1 className="page-hero-title">{t('examples.title')}</h1>
          <p className="page-hero-sub">{t('examples.subtitle')}</p>
        </div>
      </section>

      <section className="examples-section">
        <div className="container">
          <div className="examples-list">
            {DEMO_TABS.map((tab, i) => (
              <DemoReportCard key={tab} tab={tab} demo={DEMO_DATA[tab]} t={t} defaultOpen={i === 0} />
            ))}
          </div>
        </div>
      </section>

      <section className="page-cta-section">
        <div className="container page-cta-inner">
          <h2>{t('examples.ctaTitle')}</h2>
          <p>{t('examples.ctaSub')}</p>
          <Link to="/" className="btn-primary btn-cta">{t('examples.ctaBtn')}</Link>
        </div>
      </section>

      <Footer />
    </>
  )
}
