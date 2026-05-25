import { useState } from 'react'
import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import ScoreGauge from '../components/ScoreGauge'
import type { TimeCutReport } from '../types'

const EXAMPLES: { title: string; source: string; report: TimeCutReport }[] = [
  {
    title: '"10 Morning Habits That Will Change Your Life"',
    source: 'Generic self-help blog post',
    report: {
      verdict: 'SKIP IT',
      verdict_description: 'This content is generic, repetitive, and offers no original insight beyond what any basic productivity article covers.',
      overall_value_score: 2.8,
      time_saved_minutes: 32,
      value_score: 3.1,
      attention_quality: 'Low',
      attention_quality_description: 'The content is heavily padded and relies on well-worn clichés with no supporting evidence.',
      what_this_is_about: 'A listicle covering 10 morning habits commonly associated with productivity: waking early, journaling, exercise, cold showers, and gratitude practices. The article provides no new research or unique perspective.',
      key_insights: [
        'Exercise in the morning increases energy levels throughout the day',
        'Journaling helps clarify thoughts and set daily intentions',
      ],
      what_to_skip: [
        'Paragraphs 1–3: intro fluff and "why mornings matter" generic explanation',
        'Habits 4, 7, and 9: repeated versions of the same advice',
        'All anecdotal celebrity examples with no supporting data',
      ],
      best_for: ['People completely new to productivity concepts', 'Beginners with no prior self-help reading'],
      final_decision: 'Skip this entirely. The two insights worth absorbing can be stated in one sentence: exercise and journaling in the morning help. Everything else is filler recycled from hundreds of identical articles.',
    },
  },
  {
    title: '"Cal Newport: The Case for Deep Work"',
    source: 'Excerpt from a research-backed book chapter',
    report: {
      verdict: 'MUST READ',
      verdict_description: 'This is dense, original, and research-backed content that directly challenges how most people approach knowledge work.',
      overall_value_score: 9.1,
      time_saved_minutes: 3,
      value_score: 9.4,
      attention_quality: 'High',
      attention_quality_description: 'Every paragraph carries original thinking backed by research — full attention is warranted.',
      what_this_is_about: 'An excerpt arguing that the ability to focus without distraction — "deep work" — is becoming increasingly rare and increasingly valuable. Newport contrasts shallow, reactive work (emails, meetings) with the focused, cognitively demanding work that produces real value.',
      key_insights: [
        'Deep work produces the most value in the modern economy yet is practiced by very few',
        'The ability to focus deeply is a skill that atrophies without deliberate practice',
        'Shallow work (email, Slack, meetings) feels productive but rarely moves the needle',
        'Adopting deep work habits can fundamentally change your output quality within weeks',
      ],
      what_to_skip: [
        'The historical case studies in section 3 — interesting but not critical to the core argument',
      ],
      best_for: ['Knowledge workers', 'Managers and executives', 'Anyone who feels busy but unproductive'],
      final_decision: 'Read this fully and slowly. Highlight the core definitions and the four rules introduced in the final section. This content has a high chance of changing how you structure your workday permanently.',
    },
  },
  {
    title: '"The Weekly Digest: AI, Tech & Trends #47"',
    source: 'Weekly newsletter from a tech publication',
    report: {
      verdict: 'SKIM ONLY',
      verdict_description: 'A few worthwhile data points buried in mostly aggregated news that you\'ve likely already seen elsewhere.',
      overall_value_score: 5.7,
      time_saved_minutes: 18,
      value_score: 5.9,
      attention_quality: 'Medium',
      attention_quality_description: 'Two or three sections justify real attention; the rest is repetitive news aggregation.',
      what_this_is_about: 'A weekly newsletter covering AI industry news, tech product launches, and trend commentary. This edition focuses on LLM benchmark updates, a new developer tool release, and a brief take on regulation in the EU.',
      key_insights: [
        'The new LLM benchmark results suggest reasoning improvements, not just scale',
        'The EU AI Act compliance deadline is now 8 months away — many companies are not ready',
        'Developer tooling for AI agents is maturing rapidly, with three new entrants this week',
      ],
      what_to_skip: [
        'The product launch section — pure press release rewriting',
        'The "hot takes" subsection — opinion without analysis or data',
        'Event listings and sponsor content (last 4 items)',
      ],
      best_for: ['AI practitioners and developers', 'Product managers in tech', 'Investors following the AI space'],
      final_decision: 'Skim the first two sections for the benchmark and EU regulation updates — those are genuinely new information. Skip the rest. You can get the same value in 5 minutes instead of 23.',
    },
  },
]

function ExampleCard({ example }: { example: typeof EXAMPLES[0] }) {
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
            <span className="ex-stat-label">Value</span>
            <span className="ex-stat-val">{r.overall_value_score.toFixed(1)}/10</span>
          </div>
          <div className="ex-stat">
            <span className="ex-stat-label">Saved</span>
            <span className="ex-stat-val">{r.time_saved_minutes} min</span>
          </div>
          <button className="example-toggle">{open ? '▲ Collapse' : '▼ View Report'}</button>
        </div>
      </div>

      {open && (
        <div className="example-report">
          {/* Verdict */}
          <div className="ex-verdict-row">
            <div>
              <p className="ex-field-label">VERDICT</p>
              <span className={`verdict-badge verdict-title ${verdictClass}`}>{r.verdict}</span>
              <p className="ex-field-text" style={{ marginTop: 8 }}>{r.verdict_description}</p>
            </div>
            <ScoreGauge score={r.overall_value_score} label="OVERALL VALUE SCORE" />
          </div>

          {/* Metrics */}
          <div className="ex-metrics">
            <div className="ex-metric">
              <p className="ex-field-label">TIME SAVED</p>
              <p className="ex-metric-val">{r.time_saved_minutes} mins</p>
            </div>
            <div className="ex-metric">
              <p className="ex-field-label">VALUE SCORE</p>
              <p className="ex-metric-val">{r.value_score.toFixed(1)}<span className="ex-denom">/10</span></p>
            </div>
            <div className="ex-metric">
              <p className="ex-field-label">ATTENTION</p>
              <p className={`ex-metric-val ${attnClass}`}>{r.attention_quality}</p>
              <p className="ex-metric-sub">{r.attention_quality_description}</p>
            </div>
          </div>

          {/* Analysis */}
          <div className="ex-analysis">
            <div className="ex-analysis-col">
              <p className="ex-field-label">WHAT THIS IS ABOUT</p>
              <p className="ex-field-text">{r.what_this_is_about}</p>
            </div>
            <div className="ex-analysis-col">
              <p className="ex-field-label">KEY INSIGHTS</p>
              <ul className="bullet-list">{r.key_insights.map((ins, i) => <li key={i}>{ins}</li>)}</ul>
            </div>
            <div className="ex-analysis-col">
              <p className="ex-field-label">WHAT TO SKIP</p>
              <ul className="bullet-list">{r.what_to_skip.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          </div>

          {/* Final */}
          <div className="ex-final">
            <p className="ex-field-label">FINAL DECISION</p>
            <p className="ex-field-text ex-field-text--final">{r.final_decision}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ExamplesPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">Real Reports</span>
          <h1 className="page-hero-title">See Real Time Intelligence Reports</h1>
          <p className="page-hero-sub">
            Three different content types. Three different verdicts. Click any card to expand the full report.
          </p>
        </div>
      </section>

      <section className="examples-section">
        <div className="container">
          <div className="examples-list">
            {EXAMPLES.map((ex, i) => <ExampleCard key={i} example={ex} />)}
          </div>
        </div>
      </section>

      <section className="page-cta-section">
        <div className="container page-cta-inner">
          <h2>Analyze Your Own Content</h2>
          <p>Paste any text or PDF and get your Time Intelligence Report in seconds.</p>
          <Link to="/" className="btn-primary btn-cta">Try It Free</Link>
        </div>
      </section>

      <Footer />
    </>
  )
}
