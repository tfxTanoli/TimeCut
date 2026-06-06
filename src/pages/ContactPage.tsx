import { useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import Footer from '../components/Footer'
import { useTranslation } from '../hooks/useTranslation'

export default function ContactPage() {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const SUBJECTS = [
    t('contact.subjectGeneral'),
    t('contact.subjectFeature'),
    t('contact.subjectFeedback'),
    t('contact.subjectBug'),
    t('contact.subjectPartnership'),
    t('contact.subjectOther'),
  ]

  const currentSubject = subject || SUBJECTS[0]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const payload = {
        name: name.trim(),
        email: email.trim(),
        subject: currentSubject,
        message: message.trim(),
      }
      await Promise.all([
        addDoc(collection(db, 'contacts'), { ...payload, createdAt: serverTimestamp() }),
        fetch('/api/send-contact-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(r => { if (!r.ok) throw new Error('Email send failed') }),
      ])
      setSent(true)
    } catch {
      setSubmitError(t('contact.sendError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = !isSubmitting && name.trim() && email.trim() && message.trim()

  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">{t('contact.badge')}</span>
          <h1 className="page-hero-title">{t('contact.title')}</h1>
          <p className="page-hero-sub">{t('contact.subtitle')}</p>
        </div>
      </section>

      <section className="contact-section">
        <div className="container contact-inner">
          <div className="contact-info">
            <div className="contact-info-block">
              <span className="contact-info-icon">💬</span>
              <div>
                <p className="contact-info-title">{t('contact.infoSend')}</p>
                <p className="contact-info-desc">{t('contact.infoSendDesc')}</p>
              </div>
            </div>
            <div className="contact-info-block">
              <span className="contact-info-icon">💡</span>
              <div>
                <p className="contact-info-title">{t('contact.infoFeature')}</p>
                <p className="contact-info-desc">{t('contact.infoFeatureDesc')}</p>
              </div>
            </div>
            <div className="contact-info-block">
              <span className="contact-info-icon">🐛</span>
              <div>
                <p className="contact-info-title">{t('contact.infoBug')}</p>
                <p className="contact-info-desc">{t('contact.infoBugDesc')}</p>
              </div>
            </div>
            <div className="contact-info-block">
              <span className="contact-info-icon">🤝</span>
              <div>
                <p className="contact-info-title">{t('contact.infoPartnership')}</p>
                <p className="contact-info-desc">{t('contact.infoPartnershipDesc')}</p>
              </div>
            </div>
          </div>

          <div className="contact-form-card">
            {sent ? (
              <div className="contact-success">
                <span className="contact-success-icon">✓</span>
                <h2 className="contact-success-title">{t('contact.successTitle')}</h2>
                <p className="contact-success-sub">{t('contact.successSub')}</p>
                <button className="btn-primary btn-cta" onClick={() => { setSent(false); setName(''); setEmail(''); setMessage(''); setSubject('') }}>
                  {t('contact.sendAnother')}
                </button>
              </div>
            ) : (
              <form className="contact-form" onSubmit={handleSubmit}>
                <h2 className="contact-form-title">{t('contact.formTitle')}</h2>

                <div className="contact-field">
                  <label className="contact-label" htmlFor="c-name">{t('contact.yourName')}</label>
                  <input
                    id="c-name"
                    type="text"
                    className="contact-input"
                    placeholder={t('contact.namePlaceholder')}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="contact-field">
                  <label className="contact-label" htmlFor="c-email">{t('contact.emailAddress')}</label>
                  <input
                    id="c-email"
                    type="email"
                    className="contact-input"
                    placeholder={t('contact.emailPlaceholder')}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="contact-field">
                  <label className="contact-label" htmlFor="c-subject">{t('contact.subject')}</label>
                  <select
                    id="c-subject"
                    className="contact-input contact-select"
                    value={currentSubject}
                    onChange={e => setSubject(e.target.value)}
                  >
                    {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>

                <div className="contact-field">
                  <label className="contact-label" htmlFor="c-message">{t('contact.message')}</label>
                  <textarea
                    id="c-message"
                    className="contact-input contact-textarea"
                    placeholder={t('contact.messagePlaceholder')}
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
                  {isSubmitting ? <><span className="btn-spinner" />{t('contact.sending')}</> : t('contact.sendMessage')}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="page-cta-section">
        <div className="container page-cta-inner">
          <h2>{t('contact.ctaTitle')}</h2>
          <p>{t('contact.ctaSub')}</p>
          <Link to="/" className="btn-primary btn-cta">{t('contact.ctaBtn')}</Link>
        </div>
      </section>

      <Footer />
    </>
  )
}
