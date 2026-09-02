import { useEffect, useMemo, useState } from 'react'
import {
  collection, doc, getDoc, getDocs, getCountFromServer,
  orderBy, query, where, limit, type Timestamp,
} from 'firebase/firestore'
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

/* ── AI usage & cost ────────────────────────────────────────────────────────
   Fed by api/_lib/aiUsage.ts, which records what every OpenAI call actually
   consumed. These are measured figures, not estimates — the point of the
   section is that plan margins can be checked against reality after launch
   rather than reasoned about from prompt sizes.
*/
interface UsageTotals {
  calls?: number
  tokensIn?: number
  tokensOut?: number
  costUsd?: number
}
interface MonthlyUsage extends UsageTotals {
  byOperation?: Record<string, UsageTotals>
}
interface UserUsageRow extends UsageTotals {
  id: string
  uid: string
  plan: string
  creditsCharged?: number
}

const OPERATION_LABELS: Record<string, string> = {
  content: 'Content analysis',
  decision: 'Decision report',
  assistant: 'Assistant question',
}

/** UTC month key, matching getCurrentMonthKey() in api/_lib/entitlements.ts. */
function currentMonthKey(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Costs here are fractions of a cent, so the usual 2dp currency format hides
 *  everything interesting. Small values get more precision, not less. */
function usd(n: number | undefined): string {
  const v = n ?? 0
  if (v === 0) return '$0'
  if (v < 0.01) return `$${v.toFixed(4)}`
  if (v < 1) return `$${v.toFixed(3)}`
  return `$${v.toFixed(2)}`
}

function compact(n: number | undefined): string {
  const v = n ?? 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return String(v)
}

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
  const [tab, setTab] = useState<'config' | 'feedback' | 'usage'>('config')
  const [monthly, setMonthly] = useState<MonthlyUsage | null>(null)
  const [usageRows, setUsageRows] = useState<UserUsageRow[]>([])
  const [subscribers, setSubscribers] = useState<Record<string, number>>({})
  const [usageError, setUsageError] = useState<string | null>(null)
  const monthKey = currentMonthKey()

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

      // AI usage for the current month. The headline totals are one document;
      // the per-account rows are queried once and reused for both the margin
      // breakdown and the top-spenders table.
      try {
        const monthlySnap = await getDoc(doc(db, 'aiUsageMonthly', monthKey))
        if (active) setMonthly(monthlySnap.exists() ? (monthlySnap.data() as MonthlyUsage) : null)

        const rows = await getDocs(query(
          collection(db, 'aiUsageByUser'),
          where('month', '==', monthKey),
          orderBy('costUsd', 'desc'),
          limit(500),
        ))
        if (active) {
          setUsageRows(rows.docs.map(d => ({ id: d.id, ...(d.data() as Omit<UserUsageRow, 'id'>) })))
        }

        // Subscriber counts come from the users collection rather than usage,
        // so a paying customer who ran nothing still counts toward revenue.
        const paid: PlanType[] = ['starter', 'pro', 'business']
        const counts = await Promise.all(paid.map(p =>
          getCountFromServer(query(collection(db, 'users'), where('plan', '==', p))),
        ))
        if (active) {
          setSubscribers(Object.fromEntries(paid.map((p, i) => [p, counts[i].data().count])))
        }
      } catch (e) {
        console.warn('[admin] usage load failed:', e)
        if (active) {
          setUsageError(
            e instanceof Error && /index/i.test(e.message)
              ? 'Usage query needs its Firestore index — deploy firestore.indexes.json, then reload.'
              : 'Could not load AI usage.',
          )
        }
      }
    })()
    return () => { active = false }
  }, [allowed, user, monthKey])

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

  // Revenue vs AI cost per plan. Revenue is subscriber count x list price;
  // cost is what those accounts actually consumed this month. Free is included
  // because free-plan usage is a real cost with no revenue behind it.
  const margins = useMemo(() => {
    const costByPlan: Record<string, number> = {}
    for (const r of usageRows) {
      costByPlan[r.plan] = (costByPlan[r.plan] ?? 0) + (r.costUsd ?? 0)
    }
    return (['free', 'starter', 'pro', 'business'] as PlanType[]).map(plan => {
      const count = subscribers[plan] ?? 0
      const revenue = (count * (cfg.plans[plan].priceCents ?? 0)) / 100
      const cost = costByPlan[plan] ?? 0
      return {
        plan,
        count,
        revenue,
        cost,
        marginPct: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : null,
      }
    })
  }, [usageRows, subscribers, cfg])

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
          <button className={`admin-tab ${tab === 'usage' ? 'admin-tab--active' : ''}`} onClick={() => setTab('usage')}>
            AI Usage &amp; Cost
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

        {tab === 'usage' && (
          <div className="admin-section">
            <p className="admin-hint">
              Measured OpenAI usage for <strong>{monthKey}</strong> (UTC). Every call records its
              real token counts, so these are actual costs rather than estimates. Cost is derived
              from the price table in <code>api/_lib/aiConfig.ts</code> — update it whenever OpenAI
              changes prices, or these figures drift.
            </p>
            {usageError && <p className="admin-error">{usageError}</p>}

            <div className="admin-stats-row">
              <div className="admin-stat-card">
                <span className="admin-stat-val">{usd(monthly?.costUsd)}</span>
                <span className="admin-stat-label">OpenAI cost this month</span>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-val">{compact(monthly?.calls)}</span>
                <span className="admin-stat-label">AI calls</span>
              </div>
              <div className="admin-stat-card admin-stat-card--muted">
                <span className="admin-stat-val">{compact(monthly?.tokensIn)}</span>
                <span className="admin-stat-label">Tokens in</span>
              </div>
              <div className="admin-stat-card admin-stat-card--muted">
                <span className="admin-stat-val">{compact(monthly?.tokensOut)}</span>
                <span className="admin-stat-label">Tokens out</span>
              </div>
            </div>

            <h2 className="admin-subtitle">By operation</h2>
            {!monthly?.byOperation ? (
              <p className="admin-hint">No AI calls recorded yet this month.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Operation</th>
                      <th>Calls</th>
                      <th>Tokens in</th>
                      <th>Tokens out</th>
                      <th>Avg cost / call</th>
                      <th>Total cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(monthly.byOperation).map(([op, t]) => (
                      <tr key={op}>
                        <td>{OPERATION_LABELS[op] ?? op}</td>
                        <td>{compact(t.calls)}</td>
                        <td>{compact(t.tokensIn)}</td>
                        <td>{compact(t.tokensOut)}</td>
                        <td>{usd(t.calls ? (t.costUsd ?? 0) / t.calls : 0)}</td>
                        <td>{usd(t.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h2 className="admin-subtitle">Plan margin this month</h2>
            <p className="admin-hint">
              Revenue is subscriber count x list price. Cost is what those accounts actually
              consumed. Free-plan cost has no revenue behind it, so it is shown for awareness
              rather than as a margin.
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Accounts</th>
                    <th>Revenue</th>
                    <th>AI cost</th>
                    <th>Gross margin</th>
                  </tr>
                </thead>
                <tbody>
                  {margins.map(m => (
                    <tr key={m.plan}>
                      <td>{m.plan.toUpperCase()}</td>
                      <td>{m.count}</td>
                      <td>{m.revenue > 0 ? `$${m.revenue.toFixed(2)}` : '—'}</td>
                      <td>{usd(m.cost)}</td>
                      <td>{m.marginPct == null ? '—' : `${m.marginPct}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="admin-subtitle">Highest-cost accounts</h2>
            {usageRows.length === 0 ? (
              <p className="admin-hint">No account usage recorded yet this month.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Plan</th>
                      <th>Calls</th>
                      <th>Credits used</th>
                      <th>AI cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageRows.slice(0, 10).map(r => (
                      <tr key={r.id}>
                        <td className="admin-insight">{r.uid}</td>
                        <td>{r.plan}</td>
                        <td>{compact(r.calls)}</td>
                        <td>{r.creditsCharged ?? 0}</td>
                        <td>{usd(r.costUsd)}</td>
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
