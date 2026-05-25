import { useState } from 'react'
import { analyzeText, analyzePdf } from '../api'
import type { TimeCutReport, InputTab } from '../types'
import LandingPage from '../components/LandingPage'
import ResultPage from '../components/ResultPage'

export default function HomePage() {
  const [report, setReport] = useState<TimeCutReport | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(tab: InputTab, value: string | File, language: string) {
    setIsLoading(true)
    setError(null)
    try {
      const result =
        tab === 'text'
          ? await analyzeText(value as string, language)
          : await analyzePdf(value as File, language)

      if (result.data) {
        setReport(result.data)
      } else {
        setError(result.error ?? 'Something went wrong. Please try again.')
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
    }
    setIsLoading(false)
  }

  function handleBack() {
    setReport(null)
    setError(null)
  }

  if (report) {
    return <ResultPage report={report} onBack={handleBack} />
  }

  return <LandingPage onSubmit={handleSubmit} isLoading={isLoading} error={error} />
}
