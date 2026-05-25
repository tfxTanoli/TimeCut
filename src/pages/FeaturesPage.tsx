import { Link } from 'react-router-dom'
import Footer from '../components/Footer'

const FEATURES = [
  {
    emoji: '⚖️',
    title: 'Smart Verdict System',
    desc: 'Every report ends with one of three clear verdicts — MUST READ, SKIM ONLY, or SKIP IT — giving you instant decision clarity.',
    color: 'purple',
  },
  {
    emoji: '⭐',
    title: 'Overall Value Score',
    desc: 'A 0–10 score calculated from information density, originality, and practical usefulness — visualized as a live gauge.',
    color: 'amber',
  },
  {
    emoji: '⏱',
    title: 'Time Saved Estimation',
    desc: 'Know exactly how many minutes you can safely skip before investing your attention.',
    color: 'green',
  },
  {
    emoji: '📊',
    title: 'Attention Quality Rating',
    desc: 'High, Medium, or Low — tells you how much focused attention the content actually deserves.',
    color: 'blue',
  },
  {
    emoji: '💡',
    title: 'Key Insights Extraction',
    desc: 'The top 4 most valuable ideas or truths pulled directly from the content, ready to absorb in seconds.',
    color: 'purple',
  },
  {
    emoji: '🚫',
    title: 'What to Skip Detection',
    desc: 'Specific sections, repetitive parts, or filler content flagged for you to ignore — so you read smarter, not longer.',
    color: 'red',
  },
  {
    emoji: '👥',
    title: 'Audience Fit Detection',
    desc: 'Identifies who the content is actually written for — so you know if it\'s the right level for you.',
    color: 'amber',
  },
  {
    emoji: '✅',
    title: 'Final Decision Summary',
    desc: 'A clear, concise 2–3 sentence recommendation that tells you exactly what to do with the content.',
    color: 'green',
  },
  {
    emoji: '📄',
    title: 'PDF Document Support',
    desc: 'Upload PDF files directly — reports, books, research papers, and more analyzed instantly.',
    color: 'blue',
  },
  {
    emoji: '🌍',
    title: 'Multi-Language Support',
    desc: 'Analyze content and receive reports in 10 languages: English, Spanish, French, German, Arabic, Portuguese, Chinese, Japanese, Turkish, and Italian.',
    color: 'purple',
  },
]

export default function FeaturesPage() {
  return (
    <>
      {/* Hero */}
      <section className="page-hero page-hero--features">
        <div className="container page-hero-inner">
          <span className="hero-badge">Full Feature Set</span>
          <h1 className="page-hero-title">Everything to Protect<br />Your Time</h1>
          <p className="page-hero-sub">
            One report. All the data you need to decide what's worth your attention.
          </p>
          <Link to="/" className="btn-primary btn-cta">Try It Free</Link>
        </div>
      </section>

      {/* Features Grid */}
      <section className="features-main-section">
        <div className="container">
          <div className="features-big-grid">
            {FEATURES.map((f, i) => (
              <div key={i} className={`feature-big-card feature-big-card--${f.color}`}>
                <span className="feature-big-emoji">{f.emoji}</span>
                <h3 className="feature-big-title">{f.title}</h3>
                <p className="feature-big-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Banner */}
      <section className="comparison-section">
        <div className="container">
          <p className="section-eyebrow">TimeCut vs. Reading Blindly</p>
          <h2 className="section-title">Why Guessing Wastes Your Time</h2>
          <div className="comparison-grid">
            <div className="comparison-col comparison-col--bad">
              <h3>❌ Without TimeCut</h3>
              <ul>
                <li>Read the entire piece before knowing its value</li>
                <li>No idea which sections to skip</li>
                <li>Waste time on generic, repetitive content</li>
                <li>Distracted attention with no recovery</li>
                <li>Regret spending 30 minutes on a 2-minute takeaway</li>
              </ul>
            </div>
            <div className="comparison-col comparison-col--good">
              <h3>✅ With TimeCut</h3>
              <ul>
                <li>Know the verdict in 15 seconds, before you start</li>
                <li>Jump straight to the sections that matter</li>
                <li>Skip fluff, filler, and repetition confidently</li>
                <li>Protect your attention for high-value content</li>
                <li>Spend your time on content that actually moves you forward</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="page-cta-section">
        <div className="container page-cta-inner">
          <h2>All Features. Free to Start.</h2>
          <p>No account needed. Analyze your first piece of content right now.</p>
          <Link to="/" className="btn-primary btn-cta">Start Analyzing</Link>
        </div>
      </section>

      <Footer />
    </>
  )
}
