import { lazy, Suspense, useState } from 'react'
import { analyzeText, analyzePdf } from '../api'
import type { TimeCutReport, InputTab } from '../types'
import LandingPage from '../components/LandingPage'
import { useAuth } from '../contexts/AuthContext'
import { useTranslation } from '../hooks/useTranslation'
import { logActivity, incrementAnalysisStats, saveAnalysis } from '../lib/userService'

const ResultPage = lazy(() => import('../components/ResultPage'))

export default function HomePage() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [report, setReport] = useState<TimeCutReport | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysisLanguage, setAnalysisLanguage] = useState('English')

  async function handleSubmit(tab: InputTab, value: string | File, language: string) {
    setIsLoading(true)
    setError(null)
    setAnalysisLanguage(language)

    if (user) {
      await logActivity(user.uid, 'analysis_submitted', { inputType: tab, language })
    }

    try {
      const result =
        tab === 'text'
          ? await analyzeText(value as string, language)
          : await analyzePdf(value as File, language)

      if (result.data) {
        setReport(result.data)
        if (user) {
          await Promise.all([
            saveAnalysis(user.uid, result.data, tab, language),
            logActivity(user.uid, 'analysis_completed', {
              verdict: result.data.verdict,
              valueScore: result.data.value_score,
              timeSavedMinutes: result.data.time_saved_minutes,
              attentionQuality: result.data.attention_quality,
              language,
            }),
            incrementAnalysisStats(user.uid, result.data.time_saved_minutes),
          ])
        }
      } else {
        setError(result.error ?? t('home.errorGeneral'))
      }
    } catch {
      setError(t('home.errorNetwork'))
    }
    setIsLoading(false)
  }

  function handleBack() {
    setReport(null)
    setError(null)
  }

  if (report) {
    return (
      <Suspense fallback={<div className="page-loading" />}>
        <ResultPage report={report} onBack={handleBack} language={analysisLanguage} />
      </Suspense>
    )
  }

  return <LandingPage onSubmit={handleSubmit} isLoading={isLoading} error={error} />
}
