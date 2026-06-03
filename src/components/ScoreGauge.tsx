import { useId } from 'react'

interface Props {
  score: number
  label?: string
}

export default function ScoreGauge({ score, label = 'OVERALL VALUE SCORE' }: Props) {
  const uid = useId()
  const gradientId = `gauge-grad-${uid.replace(/:/g, '')}`

  const r = 45
  const cx = 55
  const cy = 60
  const circumference = Math.PI * r
  const clamped = Math.min(Math.max(score, 0), 10)
  const filled = (clamped / 10) * circumference

  const startColor = score >= 8 ? '#22c55e' : score >= 4 ? '#6366f1' : '#ef4444'
  const endColor   = score >= 8 ? '#4ade80' : score >= 4 ? '#8b5cf6' : '#f87171'

  return (
    <div className="score-gauge">
      <svg viewBox="0 0 110 65" width="140" height="84" aria-label={`Score: ${score} out of 10`}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={startColor} />
            <stop offset="100%" stopColor={endColor} />
          </linearGradient>
        </defs>
        {/* Track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="9"
          strokeLinecap="round"
        />
        {/* Filled arc with gradient */}
        <path
          className="gauge-arc-fill"
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
        <text x={cx - 2} y={cy - 4} textAnchor="end" fontSize="22" fontWeight="700" fill="currentColor">
          {score.toFixed(1)}
        </text>
        <text x={cx + 1} y={cy - 4} textAnchor="start" fontSize="11" fill="#9ca3af"> / 10</text>
      </svg>
      <p className="gauge-label">{label}</p>
    </div>
  )
}
