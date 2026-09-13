import { useEffect, useState } from 'react'
import { useTranslation } from '../hooks/useTranslation'

// This screen is on view for 30-50 seconds of every analysis, so its copy is
// translated like the rest of the product rather than always shown in English.
const STEPS = [
  { labelKey: 'loader.uploading', ms: 700 },
  { labelKey: 'loader.reading', ms: 900 },
  { labelKey: 'loader.comparing', ms: 800 },
  { labelKey: 'loader.findingRisks', ms: 900 },
  { labelKey: 'loader.crossChecking', ms: 800 },
  { labelKey: 'loader.generating', ms: 0 },
]

interface Props {
  isComplete: boolean
}

export default function AnalysisLoader({ isComplete }: Props) {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  const [isDone, setIsDone] = useState(false)

  useEffect(() => {
    if (step >= STEPS.length - 1) return
    const tid = setTimeout(() => setStep(s => s + 1), STEPS[step].ms)
    return () => clearTimeout(tid)
  }, [step])

  useEffect(() => {
    if (isComplete && step === STEPS.length - 1 && !isDone) {
      const tid = setTimeout(() => setIsDone(true), 400)
      return () => clearTimeout(tid)
    }
  }, [isComplete, step, isDone])

  return (
    <div className="al-overlay">
      <div className="al-box" role="status" aria-live="polite">
        <div className="al-title">{t('loader.title')}</div>
        <div className="al-steps">
          {STEPS.map((s, i) => {
            const done = i < step || (i === step && isDone)
            const active = i === step && !isDone
            return (
              <div key={i} className="al-step">
                <div className={`al-step-label${done ? ' al-step-label--done' : active ? ' al-step-label--active' : ' al-step-label--pending'}`}>
                  <span className="al-step-icon">{done ? '✓' : active ? '◌' : '·'}</span>
                  {t(s.labelKey)}
                </div>
                <div className="al-step-track">
                  <div
                    className="al-step-fill"
                    style={{
                      width: done ? '100%' : active ? (i === STEPS.length - 1 ? '72%' : '94%') : '0%',
                      background: done ? '#22C55E' : '#2563EB',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        {isDone && <div className="al-done">✓ {t('loader.done')}</div>}
      </div>
    </div>
  )
}
