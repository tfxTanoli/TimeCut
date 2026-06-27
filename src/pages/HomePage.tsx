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
  checkAndIncrementUsage,
  PAGE_LIMITS,
} from '../lib/userService'

const ResultPage = lazy(() => import('../components/ResultPage'))
const DecisionResultPage = lazy(() => import('../components/DecisionResultPage'))

const ANON_LIMIT = 1
const ANON_KEY = 'tc_anon_usage'

function getAnonUsage(): { month: string; count: number } {
  try {
    const raw = localStorage.getItem(ANON_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  const now = new Date()
  return { month: `${now.getFullYear()}-${now.getMonth()}`, count: 0 }
}
function incrementAnonUsage() {
  const now = new Date()
  const month = `${now.getFullYear()}-${now.getMonth()}`
  const current = getAnonUsage()
  const count = current.month === month ? current.count + 1 : 1
  localStorage.setItem(ANON_KEY, JSON.stringify({ month, count }))
}
function getAnonRemaining(): number {
  const now = new Date()
  const month = `${now.getFullYear()}-${now.getMonth()}`
  const current = getAnonUsage()
  if (current.month !== month) return ANON_LIMIT
  return Math.max(0, ANON_LIMIT - current.count)
}

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
  const { user, plan, planLimit, monthlyUsage, refreshUsage } = useAuth()
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

  const anonRemaining = getAnonRemaining()
  const userRemaining = user ? Math.max(0, planLimit - monthlyUsage) : null
  const remaining = userRemaining ?? anonRemaining
  const isAtLimit = remaining <= 0
  const pageLimit = PAGE_LIMITS[plan]

  async function handleSubmit(tab: InputTab, value: string | File, language: string) {
    setError(null)

    // ── Block immediately if at limit ──
    if (isAtLimit) {
      setShowUpgradeModal(true)
      return
    }

    // ── Plan enforcement (atomic Firestore transaction for logged-in users) ──
    if (user) {
      try {
        await checkAndIncrementUsage(user.uid, plan)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : ''
        if (msg.startsWith('LIMIT_EXCEEDED')) {
          setShowUpgradeModal(true)
          return
        }
        setError(t('home.errorGeneral'))
        return
      }
    } else {
      if (anonRemaining <= 0) {
        setShowUpgradeModal(true)
        return
      }
      incrementAnonUsage()
    }

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
            refreshUsage(),
          ])
        }
      } else {
        if (user) refreshUsage()
        setError(result.error ?? t('home.errorGeneral'))
      }
    } catch {
      if (user) refreshUsage()
      setError(t('home.errorNetwork'))
    }
    setIsLoading(false)
  }

  async function handleDecisionSubmit(files: File[], goal: string, language: string, documentType: DocumentType = 'auto') {
    setError(null)

    if (isAtLimit) { setShowUpgradeModal(true); return }

    if (user) {
      try {
        await checkAndIncrementUsage(user.uid, plan)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : ''
        if (msg.startsWith('LIMIT_EXCEEDED')) { setShowUpgradeModal(true); return }
        setError(t('home.errorGeneral'))
        return
      }
    } else {
      if (anonRemaining <= 0) { setShowUpgradeModal(true); return }
      incrementAnonUsage()
    }

    setIsLoading(true)
    setShowDecisionLoader(true)
    setAnalysisLanguage(language)
    setUploadedFiles(files)
    setCurrentDecisionGoal(goal)

    if (user) await logActivity(user.uid, 'analysis_submitted', { inputType: 'pdf', language, documentType })

    try {
      const result = await analyzeDecision(files, goal, language, pageLimit, documentType)
      if (result.data) {
        setDecisionReport(result.data)
        if (user) {
          await Promise.all([
            refreshUsage(),
            logActivity(user.uid, 'analysis_completed', { language, documentType }),
          ])
        }
      } else {
        if (user) refreshUsage()
        setShowDecisionLoader(false)
        setError(result.error ?? t('home.errorGeneral'))
      }
    } catch {
      if (user) refreshUsage()
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
          plan={plan}
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
      planLimit={user ? planLimit : 2}
      monthlyUsage={user ? monthlyUsage : ANON_LIMIT - anonRemaining}
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
          planLimit={user ? planLimit : 4}
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
        planLimit={user ? planLimit : 4}
        monthlyUsage={user ? monthlyUsage : ANON_LIMIT - anonRemaining}
        isLoggedIn={!!user}
        onOpenAuth={openAuthModal}
        remaining={remaining}
        isAtLimit={isAtLimit}
        uploadSection={uploadForm}
      />
    </>
  )
}
