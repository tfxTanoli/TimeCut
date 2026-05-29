import { useState } from 'react'
import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import { db } from '../lib/firebase'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'

const SUBJECTS = [
  'General Inquiry',
  'Feature Request',
  'Feedback',
  'Bug Report',
  'Partnership',
  'Other',
]

export default function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState(SUBJECTS[0])
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      await addDoc(collection(db, 'contacts'), {
        name: name.trim(),
        email: email.trim(),
        subject,
        message: message.trim(),
        createdAt: serverTimestamp(),
      })
      setSent(true)
    } catch {
      setSubmitError('Failed to send message. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = !isSubmitting && name.trim() && email.trim() && message.trim()

  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">Get in Touch</span>
          <h1 className="page-hero-title">Contact Us</h1>
          <p className="page-hero-sub">
            Have a question, idea, or feedback? We'd love to hear from you.
          </p>
        </div>
      </section>

      <section className="contact-section">
        <div className="container contact-inner">

          {/* Left — info column */}
          <div className="contact-info">
            <div className="contact-info-block">
              <span className="contact-info-icon">💬</span>
              <div>
                <p className="contact-info-title">Send a Message</p>
                <p className="contact-info-desc">
                  Fill out the form and we'll get back to you as soon as possible.
                </p>
              </div>
            </div>
            <div className="contact-info-block">
              <span className="contact-info-icon">💡</span>
              <div>
                <p className="contact-info-title">Feature Requests</p>
                <p className="contact-info-desc">
                  Got an idea that would make TimeCut better? We're always listening.
                </p>
              </div>
            </div>
            <div className="contact-info-block">
              <span className="contact-info-icon">🐛</span>
              <div>
                <p className="contact-info-title">Report a Bug</p>
                <p className="contact-info-desc">
                  Something not working as expected? Let us know and we'll fix it.
                </p>
              </div>
            </div>
            <div className="contact-info-block">
              <span className="contact-info-icon">🤝</span>
              <div>
                <p className="contact-info-title">Partnership</p>
                <p className="contact-info-desc">
                  Interested in working together? Reach out and let's talk.
                </p>
              </div>
            </div>
          </div>

          {/* Right — form */}
          <div className="contact-form-card">
            {sent ? (
              <div className="contact-success">
                <span className="contact-success-icon">✓</span>
                <h2 className="contact-success-title">Message Sent!</h2>
                <p className="contact-success-sub">
                  Your message has been saved. We'll get back to you as soon as possible.
                </p>
                <button className="btn-primary btn-cta" onClick={() => setSent(false)}>
                  Send Another
                </button>
              </div>
            ) : (
              <form className="contact-form" onSubmit={handleSubmit}>
                <h2 className="contact-form-title">Leave a Message</h2>

                <div className="contact-field">
                  <label className="contact-label" htmlFor="c-name">Your Name</label>
                  <input
                    id="c-name"
                    type="text"
                    className="contact-input"
                    placeholder="John Doe"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="contact-field">
                  <label className="contact-label" htmlFor="c-email">Email Address</label>
                  <input
                    id="c-email"
                    type="email"
                    className="contact-input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="contact-field">
                  <label className="contact-label" htmlFor="c-subject">Subject</label>
                  <select
                    id="c-subject"
                    className="contact-input contact-select"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                  >
                    {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>

                <div className="contact-field">
                  <label className="contact-label" htmlFor="c-message">Message</label>
                  <textarea
                    id="c-message"
                    className="contact-input contact-textarea"
                    placeholder="Tell us what's on your mind…"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={6}
                    required
                  />
                </div>

                {submitError && <p className="error-banner">{submitError}</p>}

                <button
                  type="submit"
                  className="btn-primary btn-cta contact-submit"
                  disabled={!canSubmit}
                >
                  {isSubmitting ? <><span className="btn-spinner" />Sending...</> : 'Send Message'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="page-cta-section">
        <div className="container page-cta-inner">
          <h2>Ready to Save Your Time?</h2>
          <p>Analyze any content and get a full report in seconds.</p>
          <Link to="/" className="btn-primary btn-cta">Start for Free</Link>
        </div>
      </section>

      <Footer />
    </>
  )
}
