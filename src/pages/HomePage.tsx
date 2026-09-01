import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { analyzeText, analyzePdf, analyzeDecision } from '../api'
import type { TimeCutReport, InputTab, DecisionReport, DocumentType } from '../types'
import LandingPage from '../components/LandingPage'
import DecisionUpload from '../components/DecisionUpload'
import AnalysisLoader from '../components/AnalysisLoader'
import { useAuth } from '../contexts/AuthContext'
import { useAuthModal } from '../contexts/AuthModalContext'
import { useTranslation } from '../hooks/useTranslation'
import {
  logActivity,
  incrementAnalysisStats,
  saveAnalysis,
} from '../lib/userService'
import { isUnlimited } from '../lib/planConfig'

const ResultPage = lazy(() => import('../components/ResultPage'))
const DecisionResultPage = lazy(() => import('../components/DecisionResultPage'))

// Signed-out visitors are shown the free allowance so the value is visible
// before signing up, but the analysis itself requires an account: the API
// meters every report against a verified user. The old localStorage counter
// was reset by clearing site data, which made free reports effectively
// unlimited at our cost.
const GUEST_PREVIEW_LIMIT = 1

interface UpgradeModalProps {
  plan: string
  planLimit: number
  isLoggedIn: boolean
  onClose: () => void
  onOpenAuth: () => void
  t: (key: string) => string
}

function UpgradeModal({ plan, planLimit, isLoggedIn, onClose, onOpenAuth, t }: UpgradeModalProps) {
  const planNames: Record<string, string> = { free: 'Free', starter: 'Starter', pro: 'Pro', business: 'Business', custom: 'Custom' }
  const subText = t('home.limitModalSub')
    .replace('{limit}', String(planLimit))
    .replace('{plan}', planNames[plan] ?? plan)
  return (
    <div className="upgrade-modal-backdrop" onClick={onClose}>
      <div className="upgrade-modal-card" onClick={e => e.stopPropagation()}>
        <div className="upgrade-modal-icon">⏱</div>
        <h2 className="upgrade-modal-title">{t('home.limitModalTitle')}</h2>
        <p className="upgrade-modal-sub">{subText}</p>
        <p className="upgrade-modal-sub">{t('home.limitModalSub2')}</p>
        <div className="upgrade-modal-actions">
          {!isLoggedIn ? (
            <button
              className="btn-primary btn-cta upgrade-modal-cta"
              onClick={() => { onClose(); onOpenAuth() }}
            >
              {t('home.limitModalSignup')}
            </button>
          ) : (
            <Link
              to="/pricing"
              className="btn-primary btn-cta upgrade-modal-cta"
              onClick={onClose}
            >
              {t('home.limitModalUpgrade')}
            </Link>
          )}
          <button className="upgrade-modal-dismiss" onClick={onClose}>
            {t('home.limitModalLater')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  const {
    user, plan,
    planConfig, creditsAllocated, creditsRemaining, creditsUsage, freeReportsRemaining,
  } = useAuth()
  const { openSignup: openAuthModal } = useAuthModal()
  const { t } = useTranslation()
  const [report, setReport] = useState<TimeCutReport | null>(null)
  const [decisionReport, setDecisionReport] = useState<DecisionReport | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showDecisionLoader, setShowDecisionLoader] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysisLanguage, setAnalysisLanguage] = useState('English')
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [currentDecisionGoal, setCurrentDecisionGoal] = useState('')

  const isFreePlan = plan === 'free'
  // Logged-in: paid plans gate on AI Credits, free plan gates on free reports.
  // The server enforces the same rule — this only avoids a round-trip that we
  // already know would be refused.
  const remaining = user
    ? (isFreePlan ? freeReportsRemaining : creditsRemaining)
    : GUEST_PREVIEW_LIMIT
  const isAtLimit = !!user && remaining <= 0

  const planLimits = planConfig.plans[plan]
  const maxDocs = planLimits?.maxDocs ?? 3
  const maxPages = planLimits?.maxPages ?? 20

  // Values for the usage bar (credits for paid, free reports for free)
  const displayLimit = user
    ? (isFreePlan ? Math.max(1, freeReportsRemaining + creditsUsage.reportsUsed) : creditsAllocated)
    : GUEST_PREVIEW_LIMIT
  const displayUsed = user
    ? (isFreePlan ? creditsUsage.reportsUsed : creditsUsage.used)
    : 0

  /**
   * Turn an API failure into the right UI response. Quota failures open the
   * upgrade modal; everything else shows the server's message, which is now
   * specific (which limit, how many credits are left).
   */
  function handleApiFailure(code: string | undefined, message: string | undefined) {
    if (code === 'INSUFFICIENT_CREDITS' || code === 'FREE_REPORTS_EXHAUSTED') {
      setShowUpgradeModal(true)
      return
    }
    if (code === 'UNAUTHENTICATED') {
      openAuthModal()
      return
    }
    setError(message ?? t('home.errorGeneral'))
  }

  async function handleSubmit(tab: InputTab, value: string | File, language: string) {
    setError(null)

    // Analysis requires an account — the API meters every report against a
    // verified user, so there is nothing to run for a signed-out visitor.
    if (!user) { openAuthModal(); return }
    if (isAtLimit) { setShowUpgradeModal(true); return }

    setIsLoading(true)
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
        // Credits were already charged server-side before the analysis ran; the
        // ledger listener updates the usage bar on its own.
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
      } else {
        handleApiFailure(result.code, result.error)
      }
    } catch {
      setError(t('home.errorNetwork'))
    }
    setIsLoading(false)
  }

  async function handleDecisionSubmit(files: File[], goal: string, language: string, documentType: DocumentType = 'auto') {
    setError(null)

    if (!user) { openAuthModal(); return }
    if (isAtLimit) { setShowUpgradeModal(true); return }

    // Fail fast on the plan's document limit so the user isn't made to wait for
    // an upload the server will refuse. The server enforces it regardless.
    if (!isUnlimited(maxDocs) && files.length > maxDocs) {
      setError(
        t('home.errorDocLimit')
          .replace('{max}', String(maxDocs))
          .replace('{count}', String(files.length)),
      )
      return
    }

    setIsLoading(true)
    setShowDecisionLoader(true)
    setAnalysisLanguage(language)
    setUploadedFiles(files)
    setCurrentDecisionGoal(goal)

    if (user) await logActivity(user.uid, 'analysis_submitted', { inputType: 'pdf', language, documentType })

    try {
      const result = await analyzeDecision(files, goal, language, documentType)
      if (result.data) {
        setDecisionReport(result.data)
        // Credits were charged server-side, from the pages and documents the
        // server actually parsed, before the model was called. The ledger
        // listener refreshes the usage bar on its own.
        await logActivity(user.uid, 'analysis_completed', { language, documentType })
      } else {
        setShowDecisionLoader(false)
        handleApiFailure(result.code, result.error)
      }
    } catch {
      setShowDecisionLoader(false)
      setError(t('home.errorNetwork'))
    }
    setIsLoading(false)
  }

  function handleBack() {
    setReport(null)
    setDecisionReport(null)
    setError(null)
    setShowUpgradeModal(false)
    setShowDecisionLoader(false)
    setUploadedFiles([])
    setCurrentDecisionGoal('')
  }

  if (decisionReport) {
    return (
      <Suspense fallback={<div className="page-loading" />}>
        <DecisionResultPage
          report={decisionReport}
          onBack={handleBack}
          language={analysisLanguage}
          uploadedFiles={uploadedFiles}
          decisionGoal={currentDecisionGoal}
        />
      </Suspense>
    )
  }

  if (showDecisionLoader) {
    return <AnalysisLoader isComplete={!isLoading} />
  }

  if (report) {
    return (
      <Suspense fallback={<div className="page-loading" />}>
        <ResultPage report={report} onBack={handleBack} language={analysisLanguage} />
      </Suspense>
    )
  }

  const uploadForm = (
    <DecisionUpload
      hideHero
      onDecisionSubmit={handleDecisionSubmit}
      isLoading={isLoading}
      error={error}
      plan={plan}
      planLimit={displayLimit}
      monthlyUsage={displayUsed}
      maxDocs={maxDocs}
      maxPages={maxPages}
      isLoggedIn={!!user}
      onOpenAuth={openAuthModal}
      remaining={remaining}
      isAtLimit={isAtLimit}
    />
  )

  return (
    <>
      {showUpgradeModal && (
        <UpgradeModal
          plan={plan}
          planLimit={displayLimit}
          isLoggedIn={!!user}
          onClose={() => setShowUpgradeModal(false)}
          onOpenAuth={openAuthModal}
          t={t}
        />
      )}
      <LandingPage
        onSubmit={handleSubmit}
        isLoading={isLoading}
        error={error}
        plan={plan}
        planLimit={displayLimit}
        monthlyUsage={displayUsed}
        isLoggedIn={!!user}
        onOpenAuth={openAuthModal}
        remaining={remaining}
        isAtLimit={isAtLimit}
        uploadSection={uploadForm}
      />
    </>
  )
}
