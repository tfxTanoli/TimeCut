import { Link } from 'react-router-dom'
import Footer from '../components/Footer'

export default function AboutPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">Our Story</span>
          <h1 className="page-hero-title">About TimeCut</h1>
          <p className="page-hero-sub">We built TimeCut because time is the only resource that truly can't be replaced.</p>
        </div>
      </section>

      <section style={{ padding: '56px 0 80px' }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <div className="legal-doc">

            <h2>Why We Built TimeCut</h2>
            <p>We created TimeCut because of a simple realization: the amount of content demanding our attention grows every year, but the number of hours in a day stays the same.</p>
            <p>Articles, newsletters, reports, emails, PDFs — the volume is endless. And most of it isn't worth your time. But you only find that out after you've already spent 20 minutes reading it.</p>
            <p>That gap — between "should I read this?" and "I just wasted 30 minutes finding out I shouldn't have" — is exactly what TimeCut is designed to eliminate.</p>

            <h2>Our Mission</h2>
            <p>TimeCut's mission is to give every person a clear, honest signal before they commit their attention. Know the value before you spend your time.</p>
            <p>We believe that protecting your attention is one of the most important things you can do for your productivity, your decision-making, and your wellbeing. Every minute you don't waste on low-value content is a minute you can invest in something that actually moves you forward.</p>

            <h2>How It Works</h2>
            <p>TimeCut uses AI to analyze any piece of text or PDF and produce a Time Intelligence Report in seconds. The report gives you:</p>
            <ul>
              <li>A clear verdict: <strong>MUST READ</strong>, <strong>SKIM ONLY</strong>, or <strong>SKIP IT</strong></li>
              <li>An overall value score from 0 to 10</li>
              <li>An estimate of how many minutes you can safely skip</li>
              <li>The key insights worth absorbing</li>
              <li>Specific sections to skip</li>
              <li>A final, plain-language decision</li>
            </ul>
            <p>It's not a summary. It's a decision tool — designed to tell you whether to engage, not to replace the reading itself.</p>

            <h2>What We Stand For</h2>
            <p>We believe:</p>
            <ul>
              <li>Your attention is finite and precious — it deserves to be protected.</li>
              <li>Most content is not worth your full focus. That's not cynical; it's honest.</li>
              <li>The right tool gives you clarity in seconds, not after you've already committed your time.</li>
              <li>Transparency matters — we tell you exactly what we do with your data and why.</li>
            </ul>

            <h2>Who We're For</h2>
            <p>TimeCut is built for people who take their time seriously: knowledge workers, researchers, professionals, students, and anyone who reads a lot and wants to read smarter — not more.</p>
            <p>Whether you're sorting through your morning newsletter stack, evaluating a research paper, or deciding if a long report is worth your afternoon — TimeCut gives you the answer in under 20 seconds.</p>

            <h2>Get In Touch</h2>
            <p>We're a small, focused team and we care about every piece of feedback. If you have ideas, questions, or just want to tell us how TimeCut is saving you time, we'd love to hear from you.</p>
            <p>Reach us at <a href="mailto:support@timecut.online">support@timecut.online</a> or visit our <Link to="/contact">contact page</Link>.</p>

          </div>
        </div>
      </section>

      <section className="page-cta-section">
        <div className="container page-cta-inner">
          <h2>Start Protecting Your Time Today</h2>
          <p>No account required. Analyze your first piece of content in seconds.</p>
          <Link to="/" className="btn-primary btn-cta">Try TimeCut Free</Link>
        </div>
      </section>

      <Footer />
    </>
  )
}
