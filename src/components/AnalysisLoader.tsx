import { useEffect, useState } from 'react'

const STEPS = [
  { label: 'Uploading...', ms: 700 },
  { label: 'Reading documents...', ms: 900 },
  { label: 'Comparing clauses...', ms: 800 },
  { label: 'Finding hidden risks...', ms: 900 },
  { label: 'Cross-checking documents...', ms: 800 },
  { label: 'Generating recommendations...', ms: 0 },
]

interface Props {
  isComplete: boolean
}

export default function AnalysisLoader({ isComplete }: Props) {
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
      <div className="al-box">
        <div className="al-title">Analyzing your documents...</div>
        <div className="al-steps">
          {STEPS.map((s, i) => {
            const done = i < step || (i === step && isDone)
            const active = i === step && !isDone
            return (
              <div key={i} className="al-step">
                <div className={`al-step-label${done ? ' al-step-label--done' : active ? ' al-step-label--active' : ' al-step-label--pending'}`}>
                  <span className="al-step-icon">{done ? '✓' : active ? '◌' : '·'}</span>
                  {s.label}
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
        {isDone && <div className="al-done">✓ Done.</div>}
      </div>
    </div>
  )
}
