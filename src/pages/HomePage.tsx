import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { analyzeText, analyzePdf } from '../api'
import type { TimeCutReport, InputTab } from '../types'
import LandingPage from '../components/LandingPage'
import { useAuth } from '../contexts/AuthContext'
import { useAuthModal } from '../contexts/AuthModalContext'
import { useTranslation } from '../hooks/useTranslation'
import {
  logActivity,
  incrementAnalysisStats,
  saveAnalysis,
  checkAndIncrementUsage,
} from '../lib/userService'

const ResultPage = lazy(() => import('../components/ResultPage'))

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
}

function UpgradeModal({ plan, planLimit, isLoggedIn, onClose, onOpenAuth }: UpgradeModalProps) {
  const planNames: Record<string, string> = { free: 'Free', starter: 'Starter', pro: 'Pro', custom: 'Custom' }
  return (
    <div className="upgrade-modal-backdrop" onClick={onClose}>
      <div className="upgrade-modal-card" onClick={e => e.stopPropagation()}>
        <div className="upgrade-modal-icon">⏱</div>
        <h2 className="upgrade-modal-title">Monthly Limit Reached</h2>
        <p className="upgrade-modal-sub">
          You have used all <strong>{planLimit}</strong> analyses on your{' '}
          <strong>{planNames[plan] ?? plan}</strong> plan this month.
        </p>
        <p className="upgrade-modal-sub">
          Upgrade your plan to continue analyzing content without limits.
        </p>
        <div className="upgrade-modal-actions">
          {!isLoggedIn ? (
            <button
              className="btn-primary btn-cta upgrade-modal-cta"
              onClick={() => { onClose(); onOpenAuth() }}
            >
              Sign up free, get 5/month
            </button>
          ) : (
            <Link
              to="/pricing"
              className="btn-primary btn-cta upgrade-modal-cta"
              onClick={onClose}
            >
              Upgrade Plan →
            </Link>
          )}
          <button className="upgrade-modal-dismiss" onClick={onClose}>
            Maybe later
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
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysisLanguage, setAnalysisLanguage] = useState('English')
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  const anonRemaining = getAnonRemaining()
  const userRemaining = user ? Math.max(0, planLimit - monthlyUsage) : null
  const remaining = userRemaining ?? anonRemaining
  const isAtLimit = remaining <= 0

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

  function handleBack() {
    setReport(null)
    setError(null)
    setShowUpgradeModal(false)
  }

  if (report) {
    return (
      <Suspense fallback={<div className="page-loading" />}>
        <ResultPage report={report} onBack={handleBack} language={analysisLanguage} />
      </Suspense>
    )
  }

  return (
    <>
      {showUpgradeModal && (
        <UpgradeModal
          plan={plan}
          planLimit={user ? planLimit : ANON_LIMIT}
          isLoggedIn={!!user}
          onClose={() => setShowUpgradeModal(false)}
          onOpenAuth={openAuthModal}
        />
      )}
      <LandingPage
        onSubmit={handleSubmit}
        isLoading={isLoading}
        error={error}
        plan={plan}
        planLimit={user ? planLimit : ANON_LIMIT}
        monthlyUsage={user ? monthlyUsage : ANON_LIMIT - anonRemaining}
        isLoggedIn={!!user}
        onOpenAuth={openAuthModal}
        remaining={remaining}
        isAtLimit={isAtLimit}
      />
    </>
  )
}
