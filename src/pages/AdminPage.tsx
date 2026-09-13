import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  collection, deleteField, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query,
  serverTimestamp, Timestamp, updateDoc, where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { useTranslation } from '../hooks/useTranslation'
import { isAdminEmail, ensureAdminDoc } from '../lib/admin'
import {
  getPlanConfig,
  savePlanConfig,
  planFeatures,
  formatPrice,
  DEFAULT_PLAN_CONFIG,
  type PlanConfig,
  type PlanLimits,
  type PlanFeatures,
} from '../lib/planConfig'
import type { PlanType } from '../lib/userService'
import { renderRich } from '../lib/richText'
import Footer from '../components/Footer'

type Translate = (key: string) => string

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

/**
 * A contact-form submission, as stored by api/send-email.ts.
 *
 * These are also emailed to the support address, but that delivery is outside
 * the app's control — when it fails the Firestore copy is the only record of
 * what the customer sent, so the dashboard reads it directly.
 */
interface ContactRow {
  id: string
  name?: string
  email?: string
  subject?: string
  message?: string
  createdAt?: Timestamp | null
}

/** One user document, as shown and edited on the Accounts tab. */
interface AccountRow {
  uid: string
  email?: string
  name?: string | null
  plan?: PlanType
  subscriptionStatus?: string | null
  stripeSubscriptionId?: string | null
  creditsOverride?: number | null
  planExpiresAt?: Timestamp | null
  createdAt?: Timestamp | null
}

const PLAN_ORDER: PlanType[] = ['free', 'starter', 'pro', 'business']
const ALL_PLANS: PlanType[] = ['free', 'starter', 'pro', 'business', 'custom']
/** Plans a customer can buy through Stripe, whose price is charged as entered. */
const SELF_SERVE_PLANS: PlanType[] = ['starter', 'pro']
/** Stripe's minimum USD charge. Anything lower is a typo, not a price. */
const MIN_PRICE_CENTS = 50

// Only the numeric limits are edited with number inputs. `features` is a set of
// booleans and gets its own checkbox grid below.
type NumericPlanField = Exclude<keyof PlanLimits, 'features'>

const PLAN_FIELDS: { key: NumericPlanField; labelKey: string }[] = [
  { key: 'priceCents', labelKey: 'admin.fieldPrice' },
  { key: 'credits', labelKey: 'admin.fieldCredits' },
  { key: 'maxDocs', labelKey: 'admin.fieldMaxDocs' },
  { key: 'maxPages', labelKey: 'admin.fieldMaxPages' },
  { key: 'freeReports', labelKey: 'admin.fieldFreeReports' },
  { key: 'assistantQuestions', labelKey: 'admin.fieldAssistant' },
]
// Report sections sold as plan differentiators. Editing these changes what the
// server includes in the response, not just what the UI hides.
const FEATURE_FIELDS: { key: keyof PlanFeatures; labelKey: string }[] = [
  { key: 'playbook', labelKey: 'admin.featPlaybook' },
  { key: 'skepticQuestions', labelKey: 'admin.featSkeptic' },
  { key: 'export', labelKey: 'admin.featExport' },
  { key: 'advisor', labelKey: 'admin.featAdvisor' },
]

// The OCR surcharge is deliberately not editable. OCR is not implemented —
// scanned PDFs are rejected with a message — so the setting looked like a
// working lever while charging for nothing and changing nothing.
type EditableCostField = Exclude<keyof PlanConfig['creditCosts'], 'ocrSurcharge'>
const COST_FIELDS: { key: EditableCostField; labelKey: string }[] = [
  { key: 'reportBase', labelKey: 'admin.costReportBase' },
  { key: 'perPage', labelKey: 'admin.costPerPage' },
  { key: 'assistantQuestion', labelKey: 'admin.costAssistant' },
  { key: 'multiDocMultiplier', labelKey: 'admin.costMultiDoc' },
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

const OPERATION_LABEL_KEYS: Record<string, string> = {
  content: 'admin.opContent',
  decision: 'admin.opDecision',
  assistant: 'admin.opAssistant',
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

function toAccount(id: string, data: Record<string, unknown>): AccountRow {
  return { ...(data as Omit<AccountRow, 'uid'>), uid: id }
}

/** yyyy-mm-dd for a date input, in UTC to match how expiry is stored. */
function dateInputValue(ts?: Timestamp | null): string {
  return ts?.toDate ? ts.toDate().toISOString().slice(0, 10) : ''
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))
}

/**
 * Everything wrong with a config before it is saved.
 *
 * The price field goes straight to Stripe through getStripeAmount, and used to
 * be saved unchecked: 9 instead of 900 would have charged every new subscriber
 * $0.09 a month. An emptied field was just as quiet — it stored null, which the
 * config loader replaces with the hardcoded default, so the dashboard showed a
 * blank while the product used a number nobody had chosen.
 */
function validateConfig(cfg: PlanConfig, t: Translate): string[] {
  const errors: string[] = []
  for (const plan of PLAN_ORDER) {
    const limits = cfg.plans[plan]
    const planName = plan.toUpperCase()
    for (const { key, labelKey } of PLAN_FIELDS) {
      const value = limits[key]
      // Business is Contact Sales, so it has no list price; free reports only
      // mean anything on the Free plan.
      const optional = (key === 'priceCents' && plan === 'business') || (key === 'freeReports' && plan !== 'free')
      if (isBlank(value)) {
        if (!optional) errors.push(t('admin.errEmpty').replace('{plan}', planName).replace('{field}', t(labelKey)))
        continue
      }
      if (typeof value !== 'number' || value < 0) {
        errors.push(t('admin.errNegative').replace('{plan}', planName).replace('{field}', t(labelKey)))
      }
    }
    if (SELF_SERVE_PLANS.includes(plan)) {
      const cents = limits.priceCents
      if (typeof cents === 'number' && (!Number.isInteger(cents) || cents < MIN_PRICE_CENTS)) {
        errors.push(t('admin.errPrice')
          .replace('{plan}', planName)
          .replace('{min}', String(MIN_PRICE_CENTS))
          .replace('{minPrice}', formatPrice(MIN_PRICE_CENTS)))
      }
    }
    if (plan === 'free' && typeof limits.priceCents === 'number' && limits.priceCents !== 0) {
      errors.push(t('admin.errFreePrice'))
    }
  }
  for (const { key, labelKey } of COST_FIELDS) {
    const value = cfg.creditCosts[key]
    if (isBlank(value) || value < 0) errors.push(t('admin.errCost').replace('{field}', t(labelKey)))
  }
  if (isBlank(cfg.referral.freeReportReward) || cfg.referral.freeReportReward < 0) {
    errors.push(t('admin.errCost').replace('{field}', t('admin.referralReports')))
  }
  return errors
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [allowed, setAllowed] = useState<'checking' | 'yes' | 'no'>('checking')
  const [cfg, setCfg] = useState<PlanConfig>(DEFAULT_PLAN_CONFIG)
  // The config as last loaded or saved, so price changes can be confirmed.
  const [savedCfg, setSavedCfg] = useState<PlanConfig>(DEFAULT_PLAN_CONFIG)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'invalid'>('idle')
  const [saveErrors, setSaveErrors] = useState<string[]>([])
  const [feedback, setFeedback] = useState<FeedbackRow[]>([])
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [tab, setTab] = useState<'config' | 'accounts' | 'feedback' | 'messages' | 'usage'>('config')
  const [monthly, setMonthly] = useState<MonthlyUsage | null>(null)
  const [usageRows, setUsageRows] = useState<UserUsageRow[]>([])
  const [subscribers, setSubscribers] = useState<Record<string, number>>({})
  const [usageError, setUsageError] = useState<string | null>(null)
  const monthKey = currentMonthKey()

  // ── Accounts ──
  const [accountQuery, setAccountQuery] = useState('')
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [accountsState, setAccountsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [selected, setSelected] = useState<AccountRow | null>(null)
  const [editPlan, setEditPlan] = useState<PlanType>('free')
  const [editCredits, setEditCredits] = useState('')
  const [editExpiry, setEditExpiry] = useState('')
  const [editUsed, setEditUsed] = useState<number | null>(null)
  const [accountSave, setAccountSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [accountError, setAccountError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    let active = true
    isAdminEmail(user?.email).then(ok => { if (active) setAllowed(ok ? 'yes' : 'no') })
    return () => { active = false }
  }, [user, authLoading])

  // Signing out while on this page used to strand the admin here: the access
  // check flipped to 'no' and rendered a bare "you do not have access" screen
  // with no link and no redirect, which is what a logged-out admin saw instead
  // of the home page. There is nothing for a signed-out visitor to see at
  // /admin, so send them home. A signed-in non-admin is a different case and
  // still gets told why, with a way out — see the render branch below.
  useEffect(() => {
    if (!authLoading && !user) navigate('/', { replace: true })
  }, [authLoading, user, navigate])

  useEffect(() => {
    if (allowed !== 'yes') return
    let active = true
    ;(async () => {
      // Sync the Firestore admin allowlist first — the rules trust config/admins,
      // not the env var, so feedback reads & config saves depend on this.
      await ensureAdminDoc(user?.email)
      if (!active) return
      getPlanConfig(true)
        .then(c => { if (active) { setCfg(c); setSavedCfg(c) } })
        .catch(() => {})
      try {
        const snap = await getDocs(query(collection(db, 'feedback'), orderBy('createdAt', 'desc'), limit(100)))
        if (active) setFeedback(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<FeedbackRow, 'id'>) })))
      } catch (e) {
        console.warn('[admin] feedback load failed:', e)
      }

      // Contact-form submissions. Loaded in its own try so a failure here
      // cannot take the feedback or usage sections down with it.
      try {
        const snap = await getDocs(query(collection(db, 'contacts'), orderBy('createdAt', 'desc'), limit(200)))
        if (active) setContacts(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ContactRow, 'id'>) })))
      } catch (e) {
        console.warn('[admin] contacts load failed:', e)
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
              ? t('admin.usageIndexError')
              : t('admin.usageLoadError'),
          )
        }
      }
    })()
    return () => { active = false }
  }, [allowed, user, monthKey]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // An emptied cost field is kept as NaN so validation can flag it, rather
  // than being quietly turned into 0 (free reports) as it used to be.
  function setCostField(key: EditableCostField, raw: string) {
    setCfg(prev => ({ ...prev, creditCosts: { ...prev.creditCosts, [key]: raw === '' ? Number.NaN : Number(raw) } }))
  }

  async function handleSave() {
    const errors = validateConfig(cfg, t)
    setSaveErrors(errors)
    if (errors.length > 0) {
      setSaveState('invalid')
      return
    }

    // A price change alters what every new subscriber is charged, so it is
    // spelled out in dollars and needs an explicit yes.
    const changed = SELF_SERVE_PLANS.filter(p => savedCfg.plans[p].priceCents !== cfg.plans[p].priceCents)
    if (changed.length > 0) {
      const lines = changed
        .map(p => `${p.toUpperCase()}: ${formatPrice(savedCfg.plans[p].priceCents)} → ${formatPrice(cfg.plans[p].priceCents)}`)
        .join('\n')
      if (!window.confirm(t('admin.confirmPriceChange').replace('{changes}', lines))) return
    }

    setSaveState('saving')
    try {
      await savePlanConfig(cfg)
      setSavedCfg(cfg)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2500)
    } catch (e) {
      console.warn('[admin] save failed:', e)
      setSaveState('error')
    }
  }

  /* ── Accounts ──────────────────────────────────────────────────────────────
     Business and Custom plans are sold through Contact Sales, and there used to
     be no way to deliver one: an admin had to open the Firebase console and
     edit `plan` and `creditsOverride` on the user document by hand. The rules
     already let an admin update any user document; this is the interface.
  */
  async function runAccountQuery(load: () => Promise<AccountRow[]>) {
    setAccountsState('loading')
    setSelected(null)
    try {
      setAccounts(await load())
      setAccountsState('ready')
    } catch (e) {
      console.warn('[admin] account lookup failed:', e)
      setAccountsState('error')
    }
  }

  function searchAccounts(e: React.FormEvent) {
    e.preventDefault()
    const term = accountQuery.trim()
    if (!term) return
    void runAccountQuery(async () => {
      const found = new Map<string, AccountRow>()
      const emails = Array.from(new Set([term, term.toLowerCase()]))
      const snaps = await Promise.all(emails.map(v =>
        getDocs(query(collection(db, 'users'), where('email', '==', v), limit(10))),
      ))
      snaps.forEach(s => s.docs.forEach(d => found.set(d.id, toAccount(d.id, d.data()))))
      // A Firebase uid can be pasted straight from a support email or the
      // usage table.
      if (!term.includes('@') && /^[A-Za-z0-9]{10,64}$/.test(term)) {
        const byId = await getDoc(doc(db, 'users', term))
        if (byId.exists()) found.set(byId.id, toAccount(byId.id, byId.data()))
      }
      return [...found.values()]
    })
  }

  function loadRecentAccounts() {
    void runAccountQuery(async () => {
      const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(25)))
      return snap.docs.map(d => toAccount(d.id, d.data()))
    })
  }

  async function openAccount(row: AccountRow) {
    setSelected(row)
    setEditPlan(row.plan ?? 'free')
    setEditCredits(typeof row.creditsOverride === 'number' ? String(row.creditsOverride) : '')
    setEditExpiry(dateInputValue(row.planExpiresAt))
    setAccountSave('idle')
    setAccountError(null)
    setEditUsed(null)
    try {
      const snap = await getDoc(doc(db, 'users', row.uid, 'credits', monthKey))
      setEditUsed(snap.exists() ? (snap.data().used ?? 0) : 0)
    } catch {
      setEditUsed(null)
    }
  }

  async function saveAccount() {
    if (!selected) return
    setAccountError(null)

    let credits: number | null = null
    if (editCredits.trim() !== '') {
      const n = Number(editCredits)
      if (!Number.isInteger(n) || n < 0) { setAccountError(t('admin.errCredits')); return }
      credits = n
    }

    // No end date means the plan stays until changed here again — the usual
    // arrangement for a Business contract. A date is stored as the end of that
    // day in UTC; the server moves the account to Free once it passes.
    let expiry: Timestamp | null = null
    if (editPlan !== 'free' && editExpiry) {
      const end = new Date(`${editExpiry}T23:59:59Z`)
      if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) {
        setAccountError(t('admin.errExpiryPast'))
        return
      }
      expiry = Timestamp.fromDate(end)
    }

    // A Stripe webhook rewrites the plan on the next renewal or change, so a
    // manual edit to a live subscriber can be silently undone later.
    const liveStripe = !!selected.stripeSubscriptionId
      && ['active', 'trialing', 'past_due'].includes(selected.subscriptionStatus ?? '')
    if (liveStripe && !window.confirm(t('admin.confirmStripeOverride'))) return

    setAccountSave('saving')
    try {
      const planChanged = (selected.plan ?? 'free') !== editPlan
      await updateDoc(doc(db, 'users', selected.uid), {
        plan: editPlan,
        creditsOverride: credits === null ? deleteField() : credits,
        planExpiresAt: expiry,
        ...(planChanged ? { planStartDate: editPlan === 'free' ? null : serverTimestamp() } : {}),
        adminUpdatedBy: user?.email ?? null,
        adminUpdatedAt: serverTimestamp(),
      })
      const updated: AccountRow = { ...selected, plan: editPlan, creditsOverride: credits, planExpiresAt: expiry }
      setSelected(updated)
      setAccounts(prev => prev.map(a => (a.uid === updated.uid ? updated : a)))
      setAccountSave('saved')
    } catch (e) {
      console.warn('[admin] account update failed:', e)
      setAccountSave('error')
    }
  }

  if (authLoading || allowed === 'checking') {
    return <div className="page-loading" />
  }
  // Signed out: the effect above is already navigating home, so render the
  // loading placeholder rather than flashing a denial at someone who has simply
  // logged out.
  if (!user) {
    return <div className="page-loading" />
  }
  if (allowed === 'no') {
    return (
      <div className="admin-page container">
        <h1 className="admin-title">{t('admin.titleShort')}</h1>
        <p className="admin-denied">{t('admin.denied')}</p>
        <Link to="/" className="btn-primary">{t('admin.backHome')}</Link>
        <Footer />
      </div>
    )
  }

  const tabButton = (key: typeof tab, label: string) => (
    <button className={`admin-tab ${tab === key ? 'admin-tab--active' : ''}`} onClick={() => setTab(key)}>
      {label}
    </button>
  )

  return (
    <>
      <div className="admin-page container">
        <h1 className="admin-title">{t('admin.title')}</h1>
        <div className="admin-tabs">
          {tabButton('config', t('admin.tabConfig'))}
          {tabButton('accounts', t('admin.tabAccounts'))}
          {tabButton('feedback', t('admin.tabFeedback').replace('{n}', String(feedback.length)))}
          {tabButton('messages', t('admin.tabMessages').replace('{n}', String(contacts.length)))}
          {tabButton('usage', t('admin.tabUsage'))}
        </div>

        {tab === 'config' && (
          <div className="admin-section">
            <p className="admin-hint">{t('admin.configHint')}</p>

            <h2 className="admin-subtitle">{t('admin.plans')}</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t('admin.field')}</th>
                    {PLAN_ORDER.map(p => <th key={p}>{p.toUpperCase()}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {PLAN_FIELDS.map(({ key, labelKey }) => (
                    <tr key={key}>
                      <td>{t(labelKey)}</td>
                      {PLAN_ORDER.map(p => {
                        const value = cfg.plans[p][key]
                        return (
                          <td key={p}>
                            <input
                              type="number"
                              min={0}
                              step={key === 'priceCents' ? 1 : undefined}
                              className="admin-input"
                              value={value ?? ''}
                              onChange={e => setPlanField(p, key, e.target.value)}
                            />
                            {/* Prices are entered in cents; showing the dollar
                                amount beside the field is what catches 9 vs 900. */}
                            {key === 'priceCents' && typeof value === 'number' && (
                              <div className="admin-hint" style={{ margin: '4px 0 0', fontSize: 12 }}>
                                {t('admin.pricePreview').replace('{price}', formatPrice(value))}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="admin-subtitle">{t('admin.planFeatures')}</h2>
            <p className="admin-hint">{t('admin.featuresHint')}</p>
            <div className="admin-plan-grid">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t('admin.feature')}</th>
                    {PLAN_ORDER.map(p => <th key={p}>{p.toUpperCase()}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_FIELDS.map(({ key, labelKey }) => (
                    <tr key={key}>
                      <td>{t(labelKey)}</td>
                      {PLAN_ORDER.map(p => (
                        <td key={p}>
                          <input
                            type="checkbox"
                            checked={planFeatures(cfg, p)[key]}
                            onChange={e => setFeatureFlag(p, key, e.target.checked)}
                            aria-label={t('admin.featureOnPlan').replace('{feature}', t(labelKey)).replace('{plan}', p)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="admin-subtitle">{t('admin.creditCosts')}</h2>
            <div className="admin-cost-grid">
              {COST_FIELDS.map(({ key, labelKey }) => (
                <label key={key} className="admin-field">
                  <span>{t(labelKey)}</span>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    className="admin-input"
                    value={Number.isNaN(cfg.creditCosts[key]) ? '' : cfg.creditCosts[key]}
                    onChange={e => setCostField(key, e.target.value)}
                  />
                </label>
              ))}
              <label className="admin-field">
                <span>{t('admin.referralReports')}</span>
                <input
                  type="number"
                  min={0}
                  className="admin-input"
                  value={Number.isNaN(cfg.referral.freeReportReward) ? '' : cfg.referral.freeReportReward}
                  onChange={e => setCfg(prev => ({
                    ...prev,
                    referral: { freeReportReward: e.target.value === '' ? Number.NaN : Number(e.target.value) },
                  }))}
                />
              </label>
            </div>

            {saveState === 'invalid' && saveErrors.length > 0 && (
              <div className="admin-error" role="alert" style={{ marginTop: 16 }}>
                <p style={{ margin: '0 0 6px' }}><IconAlert />{t('admin.fixErrors')}</p>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {saveErrors.map(err => <li key={err}>{err}</li>)}
                </ul>
              </div>
            )}

            <div className="admin-save-row">
              <button className="btn-primary admin-save-btn" onClick={handleSave} disabled={saveState === 'saving'}>
                {saveState === 'saving'
                  ? <><span className="btn-spinner" />{t('admin.saving')}</>
                  : <><IconSave />{t('admin.save')}</>
                }
              </button>
              {saveState === 'saved' && <span className="admin-saved"><IconCheck />{t('admin.saved')}</span>}
              {saveState === 'error' && <span className="admin-error"><IconAlert />{t('admin.saveFailed')}</span>}
            </div>
          </div>
        )}

        {tab === 'accounts' && (
          <div className="admin-section">
            <p className="admin-hint">{t('admin.accountsHint')}</p>
            <form className="admin-save-row" onSubmit={searchAccounts} style={{ flexWrap: 'wrap' }}>
              <input
                type="search"
                className="admin-input"
                style={{ flex: '1 1 260px', width: 'auto', maxWidth: 420 }}
                value={accountQuery}
                onChange={e => setAccountQuery(e.target.value)}
                placeholder={t('admin.searchPlaceholder')}
                aria-label={t('admin.searchPlaceholder')}
              />
              <button
                type="submit"
                className="btn-primary admin-save-btn"
                disabled={accountsState === 'loading' || !accountQuery.trim()}
              >
                {t('admin.search')}
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={loadRecentAccounts}
                disabled={accountsState === 'loading'}
              >
                {t('admin.recent')}
              </button>
            </form>

            {accountsState === 'loading' && <p className="admin-hint">{t('admin.searching')}</p>}
            {accountsState === 'error' && <p className="admin-error">{t('admin.accountsError')}</p>}
            {accountsState === 'ready' && accounts.length === 0 && <p className="admin-hint">{t('admin.noAccounts')}</p>}

            {accounts.length > 0 && (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t('admin.colEmail')}</th>
                      <th>{t('admin.colName')}</th>
                      <th>{t('admin.colPlan')}</th>
                      <th>{t('admin.colStatus')}</th>
                      <th>{t('admin.colExpires')}</th>
                      <th>{t('admin.colCreated')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map(a => (
                      <tr key={a.uid}>
                        <td className="admin-insight">{a.email || a.uid}</td>
                        <td>{a.name || '—'}</td>
                        <td>{(a.plan ?? 'free').toUpperCase()}</td>
                        <td>{a.subscriptionStatus || '—'}</td>
                        <td>{a.planExpiresAt?.toDate?.().toLocaleDateString?.() ?? '—'}</td>
                        <td>{a.createdAt?.toDate?.().toLocaleDateString?.() ?? '—'}</td>
                        <td>
                          <button type="button" className="btn-outline" onClick={() => openAccount(a)}>
                            {t('admin.manage')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selected && (
              <div className="admin-section" style={{ marginTop: 24 }}>
                <h2 className="admin-subtitle">{t('admin.editTitle').replace('{email}', selected.email || selected.uid)}</h2>
                {editUsed !== null && (
                  <p className="admin-hint">{t('admin.currentUsage').replace('{used}', editUsed.toLocaleString())}</p>
                )}
                <div className="admin-cost-grid">
                  <label className="admin-field">
                    <span>{t('admin.editPlan')}</span>
                    <select
                      className="admin-input"
                      value={editPlan}
                      onChange={e => setEditPlan(e.target.value as PlanType)}
                    >
                      {ALL_PLANS.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>{t('admin.editCredits')}</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="admin-input"
                      value={editCredits}
                      onChange={e => setEditCredits(e.target.value)}
                      placeholder={String(cfg.plans[editPlan]?.credits ?? 0)}
                      disabled={editPlan === 'free'}
                    />
                    <small className="admin-hint">
                      {t('admin.editCreditsHint').replace('{n}', (cfg.plans[editPlan]?.credits ?? 0).toLocaleString())}
                    </small>
                  </label>
                  <label className="admin-field">
                    <span>{t('admin.editExpiry')}</span>
                    <input
                      type="date"
                      className="admin-input"
                      value={editExpiry}
                      onChange={e => setEditExpiry(e.target.value)}
                      disabled={editPlan === 'free'}
                    />
                    <small className="admin-hint">{t('admin.editExpiryHint')}</small>
                  </label>
                </div>

                {accountError && <p className="admin-error" role="alert">{accountError}</p>}

                <div className="admin-save-row">
                  <button
                    type="button"
                    className="btn-primary admin-save-btn"
                    onClick={saveAccount}
                    disabled={accountSave === 'saving'}
                  >
                    {accountSave === 'saving'
                      ? <><span className="btn-spinner" />{t('admin.saving')}</>
                      : <><IconSave />{t('admin.saveAccount')}</>}
                  </button>
                  <button type="button" className="btn-outline" onClick={() => setSelected(null)}>
                    {t('admin.cancel')}
                  </button>
                  {accountSave === 'saved' && <span className="admin-saved"><IconCheck />{t('admin.accountSaved')}</span>}
                  {accountSave === 'error' && <span className="admin-error"><IconAlert />{t('admin.accountSaveFailed')}</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'feedback' && (
          <div className="admin-section">
            {feedbackStats && (
              <div className="admin-stats-row">
                <div className="admin-stat-card">
                  <span className="admin-stat-val">{feedbackStats.helpedPct}%</span>
                  <span className="admin-stat-label">{t('admin.feedbackHelped')}</span>
                </div>
                <div className="admin-stat-card">
                  <span className="admin-stat-val">{feedbackStats.confidencePct}%</span>
                  <span className="admin-stat-label">{t('admin.feedbackConfident')}</span>
                </div>
                <div className="admin-stat-card">
                  <span className="admin-stat-val">{feedbackStats.wouldUseAgainPct}%</span>
                  <span className="admin-stat-label">{t('admin.feedbackAgain')}</span>
                </div>
                <div className="admin-stat-card admin-stat-card--muted">
                  <span className="admin-stat-val">{feedbackStats.total}</span>
                  <span className="admin-stat-label">{t('admin.feedbackResponses')}</span>
                </div>
              </div>
            )}
            {feedback.length === 0 ? (
              <p className="admin-hint">{t('admin.noFeedback')}</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t('admin.colDate')}</th>
                      <th>{t('admin.colHelped')}</th>
                      <th>{t('admin.colConfidence')}</th>
                      <th>{t('admin.colMiss')}</th>
                      <th>{t('admin.colAgain')}</th>
                      <th>{t('admin.colInsight')}</th>
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

        {tab === 'messages' && (
          <div className="admin-section">
            <p className="admin-hint">{renderRich(t('admin.messagesHint'))}</p>
            {contacts.length === 0 ? (
              <p className="admin-hint">{t('admin.noMessages')}</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t('admin.colDate')}</th>
                      <th>{t('admin.colName')}</th>
                      <th>{t('admin.colEmail')}</th>
                      <th>{t('admin.colSubject')}</th>
                      <th>{t('admin.colMessage')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map(c => (
                      <tr key={c.id}>
                        <td>{c.createdAt?.toDate?.().toLocaleDateString?.() ?? '—'}</td>
                        <td>{c.name || '—'}</td>
                        <td>
                          {c.email
                            ? (
                              <a href={`mailto:${c.email}?subject=${encodeURIComponent(t('admin.replySubject').replace('{subject}', c.subject || t('admin.replyDefault')))}`}>
                                {c.email}
                              </a>
                            )
                            : '—'}
                        </td>
                        <td>{c.subject || '—'}</td>
                        <td className="admin-insight">{c.message || '—'}</td>
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
            <p className="admin-hint">{renderRich(t('admin.usageHint').replace('{month}', monthKey))}</p>
            {usageError && <p className="admin-error">{usageError}</p>}

            <div className="admin-stats-row">
              <div className="admin-stat-card">
                <span className="admin-stat-val">{usd(monthly?.costUsd)}</span>
                <span className="admin-stat-label">{t('admin.statCost')}</span>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-val">{compact(monthly?.calls)}</span>
                <span className="admin-stat-label">{t('admin.statCalls')}</span>
              </div>
              <div className="admin-stat-card admin-stat-card--muted">
                <span className="admin-stat-val">{compact(monthly?.tokensIn)}</span>
                <span className="admin-stat-label">{t('admin.statTokensIn')}</span>
              </div>
              <div className="admin-stat-card admin-stat-card--muted">
                <span className="admin-stat-val">{compact(monthly?.tokensOut)}</span>
                <span className="admin-stat-label">{t('admin.statTokensOut')}</span>
              </div>
            </div>

            <h2 className="admin-subtitle">{t('admin.byOperation')}</h2>
            {!monthly?.byOperation ? (
              <p className="admin-hint">{t('admin.noCallsMonth')}</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t('admin.colOperation')}</th>
                      <th>{t('admin.colCalls')}</th>
                      <th>{t('admin.statTokensIn')}</th>
                      <th>{t('admin.statTokensOut')}</th>
                      <th>{t('admin.colAvgCost')}</th>
                      <th>{t('admin.colTotalCost')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(monthly.byOperation).map(([op, totals]) => (
                      <tr key={op}>
                        <td>{OPERATION_LABEL_KEYS[op] ? t(OPERATION_LABEL_KEYS[op]) : op}</td>
                        <td>{compact(totals.calls)}</td>
                        <td>{compact(totals.tokensIn)}</td>
                        <td>{compact(totals.tokensOut)}</td>
                        <td>{usd(totals.calls ? (totals.costUsd ?? 0) / totals.calls : 0)}</td>
                        <td>{usd(totals.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h2 className="admin-subtitle">{t('admin.marginTitle')}</h2>
            <p className="admin-hint">{t('admin.marginHint')}</p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t('admin.colPlan')}</th>
                    <th>{t('admin.colAccounts')}</th>
                    <th>{t('admin.colRevenue')}</th>
                    <th>{t('admin.colAiCost')}</th>
                    <th>{t('admin.colMargin')}</th>
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

            <h2 className="admin-subtitle">{t('admin.topAccounts')}</h2>
            {usageRows.length === 0 ? (
              <p className="admin-hint">{t('admin.noAccountUsage')}</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t('admin.colAccount')}</th>
                      <th>{t('admin.colPlan')}</th>
                      <th>{t('admin.colCalls')}</th>
                      <th>{t('admin.colCreditsUsed')}</th>
                      <th>{t('admin.colAiCost')}</th>
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
