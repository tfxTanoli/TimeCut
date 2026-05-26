import { Link } from 'react-router-dom'
import Footer from '../components/Footer'

const STEPS = [
  {
    num: '01',
    title: 'Input Your Content',
    desc: 'Paste any text (articles, emails, newsletters, reports, video scripts) or upload a PDF document up to 10 MB.',
    details: [
      'Copy and paste from any source',
      'Upload PDF documents directly',
      'Supports up to ~15,000 characters of text',
      'Works with any language',
    ],
  },
  {
    num: '02',
    title: 'Time Intelligence Engine Analyzes',
    desc: 'The TimeCut Time Intelligence Engine performs a deep analysis of the content across multiple dimensions.',
    details: [
      'Information density and originality scoring',
      'Attention quality assessment',
      'Key insights vs. filler content detection',
      'Audience fit and readability evaluation',
    ],
  },
  {
    num: '03',
    title: 'Get Your Report',
    desc: 'Receive a complete Time Intelligence Report in seconds, giving you everything you need to decide whether the content deserves your time.',
    details: [
      'Verdict: MUST READ / SKIM ONLY / SKIP IT',
      'Overall Value Score (0 to 10)',
      'Estimated time you can save',
      'Key insights, what to skip, and final decision',
    ],
  },
]

const FAQS = [
  {
    q: 'How accurate is the analysis?',
    a: 'The TimeCut Time Intelligence Engine delivers consistent, reliable verdicts for most content types. Results may vary for highly technical or niche subjects.',
  },
  {
    q: 'What types of content can I analyze?',
    a: 'Any text-based content: articles, blog posts, emails, newsletters, reports, book excerpts, video scripts, research papers, PDFs, and more.',
  },
  {
    q: 'How long does analysis take?',
    a: 'Most analyses complete within 10 to 20 seconds depending on content length and server load.',
  },
  {
    q: 'What languages are supported?',
    a: 'TimeCut supports 10 languages: English, Spanish, French, German, Arabic, Portuguese, Chinese, Japanese, Turkish, and Italian.',
  },
  {
    q: 'Is there a content length limit?',
    a: 'The analysis is optimized for up to 15,000 characters (roughly 2,500 words). Longer content is trimmed to this limit automatically.',
  },
]

export default function HowItWorksPage() {
  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">Simple Process</span>
          <h1 className="page-hero-title">How Time Cut Works</h1>
          <p className="page-hero-sub">
            Save your time in 3 simple steps powered by the Time Intelligence Engine.
          </p>
          <Link to="/" className="btn-primary btn-cta">Try It Free</Link>
        </div>
      </section>

      {/* Steps */}
      <section className="hiw-steps">
        <div className="container">
          {STEPS.map((step, i) => (
            <div key={i} className={`hiw-step ${i % 2 === 1 ? 'hiw-step--reverse' : ''}`}>
              <div className="hiw-step-num-block">
                <span className="hiw-step-num">{step.num}</span>
              </div>
              <div className="hiw-step-body">
                <h2 className="hiw-step-title">{step.title}</h2>
                <p className="hiw-step-desc">{step.desc}</p>
                <ul className="hiw-step-list">
                  {step.details.map((d, j) => (
                    <li key={j}><span className="check-icon">✓</span> {d}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Report Anatomy */}
      <section className="report-anatomy">
        <div className="container">
          <p className="section-eyebrow">What You Get</p>
          <h2 className="section-title">Inside Your Time Intelligence Report</h2>
          <div className="anatomy-grid">
            {[
              { icon: '⚖️', label: 'Verdict', desc: 'MUST READ, SKIM ONLY, or SKIP IT. A clear, decisive recommendation.' },
              { icon: '⭐', label: 'Value Score', desc: 'A 0 to 10 score based on originality, density, and usefulness.' },
              { icon: '⏱', label: 'Time Saved', desc: 'Estimated minutes you can skip without missing anything important.' },
              { icon: '📊', label: 'Attention Quality', desc: 'High, Medium, or Low. How much focus the content actually deserves.' },
              { icon: '💡', label: 'Key Insights', desc: 'The most valuable ideas extracted from the content.' },
              { icon: '🚫', label: 'What to Skip', desc: 'Specific sections, repetition, or filler to ignore.' },
              { icon: '👥', label: 'Best For', desc: 'The audience that would get the most from this content.' },
              { icon: '✅', label: 'Final Decision', desc: 'A clear, human-readable summary of what to do.' },
            ].map((item, i) => (
              <div key={i} className="anatomy-card">
                <span className="anatomy-emoji">{item.icon}</span>
                <p className="anatomy-label">{item.label}</p>
                <p className="anatomy-desc">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="faq-section">
        <div className="container faq-inner">
          <h2 className="section-title">Frequently Asked Questions</h2>
          <div className="faq-list">
            {FAQS.map((faq, i) => (
              <div key={i} className="faq-item">
                <p className="faq-q">{faq.q}</p>
                <p className="faq-a">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="page-cta-section">
        <div className="container page-cta-inner">
          <h2>Ready to Save Your Time?</h2>
          <p>Start analyzing content instantly. No account required.</p>
          <Link to="/" className="btn-primary btn-cta">Start for Free</Link>
        </div>
      </section>

      <Footer />
    </>
  )
}
