interface Props {
  score: number
  label?: string
}

export default function ScoreGauge({ score, label = 'OVERALL VALUE SCORE' }: Props) {
  const r = 45
  const cx = 55
  const cy = 60
  const circumference = Math.PI * r
  const filled = (Math.min(Math.max(score, 0), 10) / 10) * circumference

  const strokeColor =
    score >= 8 ? '#22c55e' : score >= 4 ? 'var(--accent)' : '#ef4444'

  return (
    <div className="score-gauge">
      <svg viewBox="0 0 110 65" width="140" height="84" aria-label={`Score: ${score} out of 10`}>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={strokeColor}
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
