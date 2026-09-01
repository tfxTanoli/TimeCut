import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, orderBy, query, limit, type Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { isAdminEmail, ensureAdminDoc } from '../lib/admin'
import {
  getPlanConfig,
  savePlanConfig,
  planFeatures,
  DEFAULT_PLAN_CONFIG,
  type PlanConfig,
  type PlanLimits,
  type PlanFeatures,
} from '../lib/planConfig'
import type { PlanType } from '../lib/userService'
import Footer from '../components/Footer'

interface FeedbackRow {
  id: string
  helped?: string
  mostValuableInsight?: string
  confidence?: string
  wouldHaveMissed?: string
  wouldUseAgain?: string
  uid?: string | null
  decisionGoal?: string | null
  createdAt?: Timestamp | null
}

const PLAN_ORDER: PlanType[] = ['free', 'starter', 'pro', 'business']

// Only the numeric limits are edited with number inputs. `features` is a set of
// booleans and gets its own checkbox grid below.
type NumericPlanField = Exclude<keyof PlanLimits, 'features'>

const PLAN_FIELDS: { key: NumericPlanField; label: string }[] = [
  { key: 'priceCents', label: 'Price (cents)' },
  { key: 'credits', label: 'Credits/mo' },
  { key: 'maxDocs', label: 'Max docs' },
  { key: 'maxPages', label: 'Max pages' },
  { key: 'freeReports', label: 'Free reports' },
  { key: 'assistantQuestions', label: 'Assistant Qs' },
]
// Report sections sold as plan differentiators. Editing these changes what the
// server includes in the response, not just what the UI hides.
const FEATURE_FIELDS: { key: keyof PlanFeatures; label: string }[] = [
  { key: 'playbook', label: 'Decision Playbook' },
  { key: 'skepticQuestions', label: 'Smart Skeptic Questions' },
  { key: 'export', label: 'Print / Save as PDF' },
  { key: 'advisor', label: '"If I Were You" advisor' },
]

const COST_FIELDS: { key: keyof PlanConfig['creditCosts']; label: string }[] = [
  { key: 'reportBase', label: 'Report base' },
  { key: 'perPage', label: 'Per page' },
  { key: 'ocrSurcharge', label: 'OCR surcharge' },
  { key: 'assistantQuestion', label: 'Assistant question' },
  { key: 'multiDocMultiplier', label: 'Multi-doc multiplier' },
]

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth()
  const [allowed, setAllowed] = useState<'checking' | 'yes' | 'no'>('checking')
  const [cfg, setCfg] = useState<PlanConfig>(DEFAULT_PLAN_CONFIG)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [feedback, setFeedback] = useState<FeedbackRow[]>([])
  const [tab, setTab] = useState<'config' | 'feedback'>('config')

  useEffect(() => {
    if (authLoading) return
    let active = true
    isAdminEmail(user?.email).then(ok => { if (active) setAllowed(ok ? 'yes' : 'no') })
    return () => { active = false }
  }, [user, authLoading])

  useEffect(() => {
    if (allowed !== 'yes') return
    let active = true
    ;(async () => {
      // Sync the Firestore admin allowlist first — the rules trust config/admins,
      // not the env var, so feedback reads & config saves depend on this.
      await ensureAdminDoc(user?.email)
      if (!active) return
      getPlanConfig(true).then(c => active && setCfg(c)).catch(() => {})
      try {
        const snap = await getDocs(query(collection(db, 'feedback'), orderBy('createdAt', 'desc'), limit(100)))
        if (active) setFeedback(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<FeedbackRow, 'id'>) })))
      } catch (e) {
        console.warn('[admin] feedback load failed:', e)
      }
    })()
    return () => { active = false }
  }, [allowed, user])

  const feedbackStats = useMemo(() => {
    const total = feedback.length
    if (total === 0) return null
    const helpedPositive = feedback.filter(f => f.helped === 'Yes, definitely' || f.helped === 'Somewhat').length
    const confidencePositive = feedback.filter(f => f.confidence === 'Much more confident' || f.confidence === 'Somewhat more confident').length
    const wouldUseAgainPositive = feedback.filter(f => f.wouldUseAgain === 'Yes, definitely').length
    return {
      total,
      helpedPct: Math.round((helpedPositive / total) * 100),
      confidencePct: Math.round((confidencePositive / total) * 100),
      wouldUseAgainPct: Math.round((wouldUseAgainPositive / total) * 100),
    }
  }, [feedback])

  function setPlanField(plan: PlanType, key: NumericPlanField, raw: string) {
    const value = raw === '' ? null : Number(raw)
    setCfg(prev => ({
      ...prev,
      plans: { ...prev.plans, [plan]: { ...prev.plans[plan], [key]: value } },
    }))
  }

  function setFeatureFlag(plan: PlanType, key: keyof PlanFeatures, value: boolean) {
    setCfg(prev => ({
      ...prev,
      plans: {
        ...prev.plans,
        [plan]: {
          ...prev.plans[plan],
          features: { ...prev.plans[plan].features, [key]: value },
        },
      },
    }))
  }

  function setCostField(key: keyof PlanConfig['creditCosts'], raw: string) {
    setCfg(prev => ({ ...prev, creditCosts: { ...prev.creditCosts, [key]: Number(raw) || 0 } }))
  }

  async function handleSave() {
    setSaveState('saving')
    try {
      await savePlanConfig(cfg)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2500)
    } catch (e) {
      console.warn('[admin] save failed:', e)
      setSaveState('error')
    }
  }

  if (authLoading || allowed === 'checking') {
    return <div className="page-loading" />
  }
  if (allowed === 'no') {
    return (
      <div className="admin-page container">
        <h1 className="admin-title">Admin</h1>
        <p className="admin-denied">You do not have access to this page.</p>
        <Footer />
      </div>
    )
  }

  return (
    <>
      <div className="admin-page container">
        <h1 className="admin-title">Admin Dashboard</h1>
        <div className="admin-tabs">
          <button className={`admin-tab ${tab === 'config' ? 'admin-tab--active' : ''}`} onClick={() => setTab('config')}>
            Plans & Credits
          </button>
          <button className={`admin-tab ${tab === 'feedback' ? 'admin-tab--active' : ''}`} onClick={() => setTab('feedback')}>
            Feedback ({feedback.length})
          </button>
        </div>

        {tab === 'config' && (
          <div className="admin-section">
            <p className="admin-hint">
              Edit plan limits, prices and credit costs. Changes apply across the app without a redeploy.
            </p>

            <h2 className="admin-subtitle">Plans</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    {PLAN_ORDER.map(p => <th key={p}>{p.toUpperCase()}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {PLAN_FIELDS.map(({ key, label }) => (
                    <tr key={key}>
                      <td>{label}</td>
                      {PLAN_ORDER.map(p => (
                        <td key={p}>
                          <input
                            type="number"
                            className="admin-input"
                            value={cfg.plans[p][key] ?? ''}
                            onChange={e => setPlanField(p, key, e.target.value)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="admin-subtitle">Plan Features</h2>
            <p className="admin-hint">
              Controls which report sections each plan receives. The server omits the underlying
              data for anything switched off, so these must match the pricing page.
            </p>
            <div className="admin-plan-grid">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    {PLAN_ORDER.map(p => <th key={p}>{p.toUpperCase()}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_FIELDS.map(({ key, label }) => (
                    <tr key={key}>
                      <td>{label}</td>
                      {PLAN_ORDER.map(p => (
                        <td key={p}>
                          <input
                            type="checkbox"
                            checked={planFeatures(cfg, p)[key]}
                            onChange={e => setFeatureFlag(p, key, e.target.checked)}
                            aria-label={`${label} on ${p}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="admin-subtitle">Credit Costs</h2>
            <div className="admin-cost-grid">
              {COST_FIELDS.map(({ key, label }) => (
                <label key={key} className="admin-field">
                  <span>{label}</span>
                  <input
                    type="number"
                    step="0.1"
                    className="admin-input"
                    value={cfg.creditCosts[key]}
                    onChange={e => setCostField(key, e.target.value)}
                  />
                </label>
              ))}
              <label className="admin-field">
                <span>Referral free reports</span>
                <input
                  type="number"
                  className="admin-input"
                  value={cfg.referral.freeReportReward}
                  onChange={e => setCfg(prev => ({ ...prev, referral: { freeReportReward: Number(e.target.value) || 0 } }))}
                />
              </label>
            </div>

            <div className="admin-save-row">
              <button className="btn-primary admin-save-btn" onClick={handleSave} disabled={saveState === 'saving'}>
                {saveState === 'saving'
                  ? <><span className="btn-spinner" />Saving…</>
                  : <><IconSave />Save Changes</>
                }
              </button>
              {saveState === 'saved' && <span className="admin-saved"><IconCheck />Saved</span>}
              {saveState === 'error' && <span className="admin-error"><IconAlert />Save failed — check your permissions.</span>}
            </div>
          </div>
        )}

        {tab === 'feedback' && (
          <div className="admin-section">
            {feedbackStats && (
              <div className="admin-stats-row">
                <div className="admin-stat-card">
                  <span className="admin-stat-val">{feedbackStats.helpedPct}%</span>
                  <span className="admin-stat-label">Helped make a better decision</span>
                </div>
                <div className="admin-stat-card">
                  <span className="admin-stat-val">{feedbackStats.confidencePct}%</span>
                  <span className="admin-stat-label">More confident after reading</span>
                </div>
                <div className="admin-stat-card">
                  <span className="admin-stat-val">{feedbackStats.wouldUseAgainPct}%</span>
                  <span className="admin-stat-label">Would use TimeCut again</span>
                </div>
                <div className="admin-stat-card admin-stat-card--muted">
                  <span className="admin-stat-val">{feedbackStats.total}</span>
                  <span className="admin-stat-label">Responses (last 100)</span>
                </div>
              </div>
            )}
            {feedback.length === 0 ? (
              <p className="admin-hint">No feedback yet.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Helped?</th>
                      <th>Confidence</th>
                      <th>Would miss?</th>
                      <th>Use again?</th>
                      <th>Most valuable insight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedback.map(f => (
                      <tr key={f.id}>
                        <td>{f.createdAt?.toDate?.().toLocaleDateString?.() ?? '—'}</td>
                        <td>{f.helped ?? '—'}</td>
                        <td>{f.confidence ?? '—'}</td>
                        <td>{f.wouldHaveMissed ?? '—'}</td>
                        <td>{f.wouldUseAgain ?? '—'}</td>
                        <td className="admin-insight">{f.mostValuableInsight || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
      <Footer />
    </>
  )
}

function IconSave() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function IconAlert() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <line x1="12" y1="16.5" x2="12.01" y2="16.5" />
    </svg>
  )
}
