import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import Footer from '../components/Footer'
import { useAuth } from '../contexts/AuthContext'
import { useAuthModal } from '../contexts/AuthModalContext'
import { useTranslation } from '../hooks/useTranslation'
import { getDecisionAnalysis, type StoredDecisionReport } from '../lib/userService'
import { getFreshReport } from '../lib/freshReports'

const DecisionResultPage = lazy(() => import('../components/DecisionResultPage'))

/**
 * A saved decision report at its own address.
 *
 * Reports used to live only in the component state of the page that produced
 * them, so a refresh or a Back press destroyed what the customer had just paid
 * credits for. Every report is persisted to the account now, and this route is
 * how it is opened — straight after the analysis finishes, from the profile's
 * history, from a bookmark, or from the link the report page copies.
 *
 * Access is enforced by Firestore rules, not here: `users/{uid}/analyses` is
 * readable only by its owner, so a signed-out visitor or the wrong account
 * simply gets nothing back.
 */
export default function ReportPage() {
  const { id } = useParams<{ id: string }>()
  const { user, loading: authLoading } = useAuth()
  const { openLogin } = useAuthModal()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  // Arrived straight from the analysis that produced it. That history entry
  // keeps the flag across a refresh, so Back still means "home" there, while a
  // report opened from the profile goes back to the list.
  const fromAnalysis = (location.state as { fresh?: boolean } | null)?.fresh === true
  // Same session as the analysis: render it at once, with the uploaded files
  // the evidence links need. After a refresh this is empty and it loads below.
  const fresh = fromAnalysis && id ? getFreshReport(id) : null

  const [stored, setStored] = useState<StoredDecisionReport | null>(null)
  const [fetchState, setFetchState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')

  // Only the fetch itself lives in the effect. Whether we are even allowed to
  // fetch — session still restoring, signed out, no id — is derived below
  // during render, so the effect never has to set state synchronously to
  // express it.
  const canLoad = !fresh && !authLoading && !!user && !!id

  useEffect(() => {
    if (!canLoad || !user || !id) return

    let active = true
    getDecisionAnalysis(user.uid, id)
      .then(found => {
        if (!active) return
        if (found) { setStored(found); setFetchState('ready') }
        else setFetchState('missing')
      })
      .catch(e => {
        console.warn('[report] load failed:', e)
        if (active) setFetchState('error')
      })
    return () => { active = false }
  }, [canLoad, user, id])

  const backProps = fromAnalysis
    ? { onBack: () => navigate('/') }
    : { onBack: () => navigate('/profile'), backLabelKey: 'result.backToReports' }

  if (fresh && id) {
    return (
      <Suspense fallback={<div className="page-loading" />}>
        <DecisionResultPage
          report={fresh.report}
          {...backProps}
          language={fresh.language}
          uploadedFiles={fresh.uploadedFiles}
          decisionGoal={fresh.decisionGoal}
          reportId={id}
        />
      </Suspense>
    )
  }

  // Wait for the session to restore before deciding anything — on a cold load
  // of a bookmarked report `user` is briefly null for a signed-in owner too.
  if (authLoading) return <div className="page-loading" />

  const state = canLoad ? fetchState : 'missing'

  if (state === 'loading') {
    return <div className="page-loading" />
  }

  if (state === 'ready' && stored) {
    return (
      <Suspense fallback={<div className="page-loading" />}>
        <DecisionResultPage
          report={stored.report}
          {...backProps}
          language={stored.language}
          decisionGoal={stored.decisionGoal}
          reportId={stored.id}
        />
      </Suspense>
    )
  }

  // Signed out, wrong account, deleted, or a report from before reports were
  // saved. All of these read the same from here, and saying which one it was
  // would leak whether a given id exists on someone else's account.
  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">{t('report.notFoundBadge')}</span>
          <h1 className="page-hero-title">{t('report.notFoundTitle')}</h1>
          <p className="page-hero-sub">
            {state === 'error' ? t('report.loadError') : t('report.notFoundSub')}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 28 }}>
            {!user ? (
              <button className="btn-primary btn-cta" onClick={openLogin}>
                {t('report.notFoundLogIn')}
              </button>
            ) : (
              <Link to="/profile" className="btn-primary btn-cta">{t('result.backToReports')}</Link>
            )}
            <Link to="/" className="btn-outline btn-cta">{t('nf.home')}</Link>
          </div>
        </div>
      </section>
      <Footer />
    </>
  )
}
