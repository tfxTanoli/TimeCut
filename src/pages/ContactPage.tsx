import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authHeaders } from '../lib/firebase'
import Footer from '../components/Footer'
import { useTranslation } from '../hooks/useTranslation'
import { useAuth } from '../contexts/AuthContext'

// Firestore caps a document at 1MB and the support inbox is read by a person.
// Both fields are bounded here and in the API so a paste of a whole contract
// fails as a form validation message rather than as an opaque write error.
const MAX_MESSAGE_LENGTH = 4000
const MAX_FIELD_LENGTH = 200

export default function ContactPage() {
  const { t } = useTranslation()
  const { user, userData, displayName } = useAuth()
  const [searchParams] = useSearchParams()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const SUBJECTS = [
    t('contact.subjectGeneral'),
    t('contact.subjectBusiness'),
    t('contact.subjectFeature'),
    t('contact.subjectFeedback'),
    t('contact.subjectBug'),
    t('contact.subjectPartnership'),
    t('contact.subjectOther'),
  ]

  // The Business pricing card sends prospects here with ?plan=business. That
  // parameter used to be ignored entirely, so someone arriving to ask about
  // Enterprise pricing landed on a blank General Inquiry form.
  const planParam = searchParams.get('plan')
  const defaultSubject = planParam === 'business'
    ? t('contact.subjectBusiness')
    : SUBJECTS[0]
  const currentSubject = subject || defaultSubject

  // Prefill from the session when there is one. Signing in is not required —
  // see handleSubmit — but there is no reason to make a customer retype what
  // we already know.
  const [syncedUid, setSyncedUid] = useState<string | null>(null)
  if (user && syncedUid !== user.uid) {
    setSyncedUid(user.uid)
    if (!name) setName(displayName || userData?.name || '')
    if (!email) setEmail(user.email ?? '')
  }

  /**
   * Send the message.
   *
   * Deliberately open to signed-out visitors. This form used to bounce anyone
   * without an account into the login modal, which meant the "Contact Sales"
   * button on the Business plan — the one path for a prospect who by definition
   * has no account yet — could never be completed.
   *
   * The API stores the Firestore copy and sends the email. The browser used to
   * write the copy itself, which forced the `contacts` collection to accept
   * unauthenticated writes that no rate limit could reach.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const payload = {
        name: name.trim().slice(0, MAX_FIELD_LENGTH),
        email: email.trim().slice(0, MAX_FIELD_LENGTH),
        subject: currentSubject.slice(0, MAX_FIELD_LENGTH),
        message: message.trim().slice(0, MAX_MESSAGE_LENGTH),
        // Recorded so sales can see which card the enquiry came from.
        ...(planParam ? { plan: planParam.slice(0, 40) } : {}),
      }
      // A signed-in sender's token lets the server attribute the message to
      // their account; it is optional and never required to send.
      const res = await fetch('/api/send-contact-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(user ? await authHeaders() : {}) },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Contact send failed')
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
            {[
              { icon: '💬', title: t('contact.infoSend'), desc: t('contact.infoSendDesc') },
              { icon: '💡', title: t('contact.infoFeature'), desc: t('contact.infoFeatureDesc') },
              { icon: '🐛', title: t('contact.infoBug'), desc: t('contact.infoBugDesc') },
              { icon: '🤝', title: t('contact.infoPartnership'), desc: t('contact.infoPartnershipDesc') },
            ].map(item => (
              <div
                key={item.title}
                className="contact-info-block contact-info-block--clickable"
                onClick={() => document.getElementById('contact-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && document.getElementById('contact-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                <span className="contact-info-icon">{item.icon}</span>
                <div>
                  <p className="contact-info-title">{item.title}</p>
                  <p className="contact-info-desc">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="contact-form-card" id="contact-form">
            {sent ? (
              <div className="contact-success">
                <span className="contact-success-icon">✓</span>
                <h2 className="contact-success-title">{t('contact.successTitle')}</h2>
                <p className="contact-success-sub">{t('contact.successSub')}</p>
                <button className="btn-primary btn-cta" onClick={() => { setSent(false); setSubmitError(null); setMessage(''); setSubject('') }}>
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
                    maxLength={MAX_FIELD_LENGTH}
                    autoComplete="name"
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
                    maxLength={MAX_FIELD_LENGTH}
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
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
                    maxLength={MAX_MESSAGE_LENGTH}
                    required
                  />
                  <span className="contact-char-count">
                    {message.length}/{MAX_MESSAGE_LENGTH}
                  </span>
                </div>

                {submitError && <p className="error-banner">{submitError}</p>}

                <button
                  type="submit"
                  className="btn-primary btn-cta contact-submit"
                  disabled={!canSubmit}
                >
                  {isSubmitting ? <><span className="btn-spinner" />{t('contact.sending')}</> : t('contact.sendMessage')}
                </button>
                <p className="contact-direct-note">
                  {t('contact.directNote')}{' '}
                  <a href="mailto:support@timecut.online">support@timecut.online</a>
                </p>
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
