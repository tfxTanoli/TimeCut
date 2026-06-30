import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTranslation } from '../hooks/useTranslation'
import { saveReportFeedback } from '../lib/userService'

interface Props {
  decisionGoal?: string
  language?: string
  documentType?: string
}

type ChoiceKey = 'helped' | 'confidence' | 'wouldHaveMissed'

export default function ReportFeedback({ decisionGoal, language, documentType }: Props) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [helped, setHelped] = useState('')
  const [confidence, setConfidence] = useState('')
  const [wouldHaveMissed, setWouldHaveMissed] = useState('')
  const [insight, setInsight] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')

  const setters: Record<ChoiceKey, (v: string) => void> = {
    helped: setHelped,
    confidence: setConfidence,
    wouldHaveMissed: setWouldHaveMissed,
  }
  const values: Record<ChoiceKey, string> = { helped, confidence, wouldHaveMissed }

  const canSubmit = !!helped && !!confidence && !!wouldHaveMissed && status !== 'submitting'

  async function handleSubmit() {
    if (!canSubmit) return
    setStatus('submitting')
    try {
      await saveReportFeedback(
        { helped, mostValuableInsight: insight.trim(), confidence, wouldHaveMissed },
        { uid: user?.uid ?? null, decisionGoal, language, documentType },
      )
      setStatus('done')
    } catch (e) {
      console.warn('[feedback] save failed:', e)
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="rf-card rf-card--done">
        <p className="rf-thanks-title">{t('feedback.thanksTitle')}</p>
        <p className="rf-thanks-sub">{t('feedback.thanksSub')}</p>
      </div>
    )
  }

  const questions: { key: ChoiceKey; q: string; opts: string[] }[] = [
    { key: 'helped',          q: t('feedback.q1'), opts: [t('feedback.q1o1'), t('feedback.q1o2'), t('feedback.q1o3'), t('feedback.q1o4')] },
    { key: 'confidence',      q: t('feedback.q3'), opts: [t('feedback.q3o1'), t('feedback.q3o2'), t('feedback.q3o3'), t('feedback.q3o4')] },
    { key: 'wouldHaveMissed', q: t('feedback.q4'), opts: [t('feedback.q4o1'), t('feedback.q4o2'), t('feedback.q4o3'), t('feedback.q4o4')] },
  ]

  return (
    <div className="rf-card">
      <div className="rf-header">
        <span className="rf-icon">💡</span>
        <div>
          <p className="rf-title">{t('feedback.title')}</p>
          <p className="rf-sub">{t('feedback.sub')}</p>
        </div>
      </div>

      {/* Q1 */}
      <div className="rf-q">
        <p className="rf-q-label">{questions[0].q}</p>
        <div className="rf-options">
          {questions[0].opts.map(opt => (
            <button
              key={opt}
              type="button"
              className={`rf-option ${values.helped === opt ? 'rf-option--active' : ''}`}
              onClick={() => setters.helped(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Q2 — free text */}
      <div className="rf-q">
        <p className="rf-q-label">{t('feedback.q2')}</p>
        <textarea
          className="rf-textarea"
          rows={3}
          value={insight}
          onChange={e => setInsight(e.target.value)}
          placeholder={t('feedback.q2placeholder')}
        />
      </div>

      {/* Q3 & Q4 */}
      {questions.slice(1).map(({ key, q, opts }) => (
        <div className="rf-q" key={key}>
          <p className="rf-q-label">{q}</p>
          <div className="rf-options">
            {opts.map(opt => (
              <button
                key={opt}
                type="button"
                className={`rf-option ${values[key] === opt ? 'rf-option--active' : ''}`}
                onClick={() => setters[key](opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}

      {status === 'error' && <p className="rf-error">{t('feedback.error')}</p>}

      <button className="btn-primary rf-submit" onClick={handleSubmit} disabled={!canSubmit}>
        {status === 'submitting' ? t('feedback.submitting') : t('feedback.submit')}
      </button>
    </div>
  )
}
