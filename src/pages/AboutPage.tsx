import { Link } from 'react-router-dom'
import Footer from '../components/Footer'

export default function AboutPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">Our Story</span>
          <h1 className="page-hero-title">About TimeCut</h1>
          <p className="page-hero-sub">Helping people make better decisions before they sign, hire, approve, invest, or decide.</p>
        </div>
      </section>

      <section style={{ padding: '56px 0 80px' }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <div className="legal-doc">

            <p>Every important decision carries risk.</p>
            <p>Sometimes the risk is hidden inside a contract. Sometimes it's buried in a quotation. Sometimes it's missing from a resume. Sometimes it's an assumption nobody questioned.</p>
            <p>TimeCut was created to help individuals and businesses discover what they might otherwise overlook before making important decisions.</p>
            <p>Unlike traditional AI tools that focus on reading or summarizing documents, TimeCut is designed around one goal: helping people make better decisions through AI-powered Decision Intelligence.</p>
            <p>Every report combines:</p>
            <ul>
              <li>Executive Recommendation</li>
              <li>Hidden Risk Detection</li>
              <li>Missing Information Analysis</li>
              <li>Evidence-Based Reasoning</li>
              <li>Smart Skeptic Questions</li>
              <li>Decision Readiness</li>
              <li>Actionable Next Steps</li>
            </ul>
            <p>Our mission is simple: reduce costly mistakes before they happen.</p>

            <h2>Get In Touch</h2>
            <p>We're a small, focused team and we care about every piece of feedback. If you have ideas, questions, or just want to tell us how TimeCut helped you decide, we'd love to hear from you.</p>
            <p>Reach us at <a href="mailto:support@timecut.online">support@timecut.online</a> or visit our <Link to="/contact">contact page</Link>.</p>

          </div>
        </div>
      </section>

      <section className="page-cta-section">
        <div className="container page-cta-inner">
          <h2>Start Making Better Decisions Today</h2>
          <p>No account required. Upload your first document and get your Executive Decision Package in seconds.</p>
          <Link to="/" className="btn-primary btn-cta">Try TimeCut Free</Link>
        </div>
      </section>

      <Footer />
    </>
  )
}
