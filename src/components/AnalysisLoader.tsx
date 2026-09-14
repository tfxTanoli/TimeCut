import { useEffect, useState } from 'react'
import { useTranslation } from '../hooks/useTranslation'
import {
  isProcessingSoundEnabled, primeProcessingSound, setProcessingSoundEnabled, startProcessingSound,
} from '../lib/processingSound'

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

// After this long the "usually 30-60 seconds" hint would start to read as a
// broken promise, so it changes to a reassurance instead.
const STILL_WORKING_AFTER_S = 45

interface Props {
  isComplete: boolean
}

export default function AnalysisLoader({ isComplete }: Props) {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  const [isDone, setIsDone] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [soundOn, setSoundOn] = useState(isProcessingSoundEnabled)

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

  // The steps above finish in a few seconds, but the model takes much longer.
  // A running clock shows the page has not frozen on the last step.
  useEffect(() => {
    if (isComplete) return
    const id = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [isComplete])

  // Soft pulse for as long as the analysis runs. It checks the on/off choice on
  // every beat, so the toggle takes effect without restarting it.
  useEffect(() => {
    if (isComplete) return
    return startProcessingSound()
  }, [isComplete])

  function toggleSound() {
    const next = !soundOn
    setProcessingSoundEnabled(next)
    setSoundOn(next)
    // This click is a user gesture, so it can unlock audio if it was blocked.
    if (next) primeProcessingSound()
  }

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
                    className={`al-step-fill${active ? ' al-step-fill--active' : ''}`}
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
        {isDone
          ? <div className="al-done">✓ {t('loader.done')}</div>
          : (
            <>
              <div className="al-meta">
                <span className="al-elapsed" aria-live="off">{t('loader.elapsed').replace('{s}', String(elapsed))}</span>
                <button
                  type="button"
                  className="al-sound"
                  onClick={toggleSound}
                  aria-pressed={soundOn}
                >
                  <span aria-hidden="true">{soundOn ? '🔊' : '🔇'}</span>
                  {soundOn ? t('loader.soundOn') : t('loader.soundOff')}
                </button>
              </div>
              <p className="al-hint">
                {elapsed >= STILL_WORKING_AFTER_S ? t('loader.stillWorking') : t('loader.hint')}
              </p>
            </>
          )}
      </div>
    </div>
  )
}
