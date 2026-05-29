import { useState } from 'react'
import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import ScoreGauge from '../components/ScoreGauge'
import type { TimeCutReport } from '../types'
import { useTranslation } from '../hooks/useTranslation'

function ExampleCard({ example, t }: { example: { title: string; source: string; report: TimeCutReport }; t: (k: string) => string }) {
  const [open, setOpen] = useState(false)
  const r = example.report

  const verdictClass =
    r.verdict === 'MUST READ' ? 'verdict-badge--must'
    : r.verdict === 'SKIM ONLY' ? 'verdict-badge--skim'
    : 'verdict-badge--skip'

  const attnClass =
    r.attention_quality === 'High' ? 'attn--high'
    : r.attention_quality === 'Medium' ? 'attn--medium'
    : 'attn--low'

  return (
    <div className="example-card">
      <div className="example-card-header" onClick={() => setOpen(o => !o)}>
        <div className="example-card-meta">
          <span className={`verdict-badge ${verdictClass}`}>{r.verdict}</span>
          <div>
            <p className="example-title">{example.title}</p>
            <p className="example-source">{example.source}</p>
          </div>
        </div>
        <div className="example-card-stats">
          <div className="ex-stat">
            <span className="ex-stat-label">{t('examples.statValue')}</span>
            <span className="ex-stat-val">{r.overall_value_score.toFixed(1)}/10</span>
          </div>
          <div className="ex-stat">
            <span className="ex-stat-label">{t('examples.statSaved')}</span>
            <span className="ex-stat-val">{r.time_saved_minutes} min</span>
          </div>
          <button className="example-toggle">{open ? t('examples.collapse') : t('examples.viewReport')}</button>
        </div>
      </div>

      {open && (
        <div className="example-report">
          <div className="ex-verdict-row">
            <div>
              <p className="ex-field-label">{t('examples.fieldVerdict')}</p>
              <span className={`verdict-badge verdict-title ${verdictClass}`}>{r.verdict}</span>
              <p className="ex-field-text" style={{ marginTop: 8 }}>{r.verdict_description}</p>
            </div>
            <ScoreGauge score={r.overall_value_score} label={t('examples.fieldOverallScore')} />
          </div>

          <div className="ex-metrics">
            <div className="ex-metric">
              <p className="ex-field-label">{t('examples.fieldTimeSaved')}</p>
              <p className="ex-metric-val">{r.time_saved_minutes} mins</p>
            </div>
            <div className="ex-metric">
              <p className="ex-field-label">{t('examples.fieldValueScore')}</p>
              <p className="ex-metric-val">{r.value_score.toFixed(1)}<span className="ex-denom">/10</span></p>
            </div>
            <div className="ex-metric">
              <p className="ex-field-label">{t('examples.fieldAttention')}</p>
              <p className={`ex-metric-val ${attnClass}`}>{r.attention_quality}</p>
              <p className="ex-metric-sub">{r.attention_quality_description}</p>
            </div>
          </div>

          <div className="ex-analysis">
            <div className="ex-analysis-col">
              <p className="ex-field-label">{t('examples.fieldAbout')}</p>
              <p className="ex-field-text">{r.what_this_is_about}</p>
            </div>
            <div className="ex-analysis-col">
              <p className="ex-field-label">{t('examples.fieldKeyInsights')}</p>
              <ul className="bullet-list">{r.key_insights.map((ins, i) => <li key={i}>{ins}</li>)}</ul>
            </div>
            <div className="ex-analysis-col">
              <p className="ex-field-label">{t('examples.fieldWhatSkip')}</p>
              <ul className="bullet-list">{r.what_to_skip.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          </div>

          <div className="ex-final">
            <p className="ex-field-label">{t('examples.fieldFinalDecision')}</p>
            <p className="ex-field-text ex-field-text--final">{r.final_decision}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ExamplesPage() {
  const { t } = useTranslation()

  const EXAMPLES = [
    {
      title: t('examples.ex1Title'),
      source: t('examples.ex1Source'),
      report: {
        verdict: 'SKIP IT' as const,
        verdict_description: t('examples.ex1VerdictDesc'),
        overall_value_score: 2.8,
        time_saved_minutes: 32,
        value_score: 3.1,
        attention_quality: 'Low' as const,
        attention_quality_description: t('examples.ex1AttnDesc'),
        what_this_is_about: t('examples.ex1About'),
        key_insights: [t('examples.ex1Insight1'), t('examples.ex1Insight2')],
        what_to_skip: [t('examples.ex1Skip1'), t('examples.ex1Skip2'), t('examples.ex1Skip3')],
        best_for: [t('examples.ex1Best1'), t('examples.ex1Best2')],
        final_decision: t('examples.ex1Final'),
        originality_score: 2.1,
        evidence_density: 1.8,
        repetition_score: 8.2,
        insight_uniqueness: 1.5,
      },
    },
    {
      title: t('examples.ex2Title'),
      source: t('examples.ex2Source'),
      report: {
        verdict: 'MUST READ' as const,
        verdict_description: t('examples.ex2VerdictDesc'),
        overall_value_score: 9.1,
        time_saved_minutes: 3,
        value_score: 9.4,
        attention_quality: 'High' as const,
        attention_quality_description: t('examples.ex2AttnDesc'),
        what_this_is_about: t('examples.ex2About'),
        key_insights: [t('examples.ex2Insight1'), t('examples.ex2Insight2'), t('examples.ex2Insight3'), t('examples.ex2Insight4')],
        what_to_skip: [t('examples.ex2Skip1')],
        best_for: [t('examples.ex2Best1'), t('examples.ex2Best2'), t('examples.ex2Best3')],
        final_decision: t('examples.ex2Final'),
        originality_score: 9.2,
        evidence_density: 8.9,
        repetition_score: 1.2,
        insight_uniqueness: 9.5,
      },
    },
    {
      title: t('examples.ex3Title'),
      source: t('examples.ex3Source'),
      report: {
        verdict: 'SKIM ONLY' as const,
        verdict_description: t('examples.ex3VerdictDesc'),
        overall_value_score: 5.7,
        time_saved_minutes: 18,
        value_score: 5.9,
        attention_quality: 'Medium' as const,
        attention_quality_description: t('examples.ex3AttnDesc'),
        what_this_is_about: t('examples.ex3About'),
        key_insights: [t('examples.ex3Insight1'), t('examples.ex3Insight2'), t('examples.ex3Insight3')],
        what_to_skip: [t('examples.ex3Skip1'), t('examples.ex3Skip2'), t('examples.ex3Skip3')],
        best_for: [t('examples.ex3Best1'), t('examples.ex3Best2'), t('examples.ex3Best3')],
        final_decision: t('examples.ex3Final'),
        originality_score: 5.1,
        evidence_density: 4.8,
        repetition_score: 5.5,
        insight_uniqueness: 4.9,
      },
    },
  ]

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
            {EXAMPLES.map((ex, i) => <ExampleCard key={i} example={ex} t={t} />)}
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
