import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import type { PlanType } from './userService'

// ── Config-driven plan limits & AI Credits ───────────────────────────────────
// All plan limits live in a single Firestore doc `config/plans` so they can be
// tuned from the Admin Dashboard without code changes. The defaults below keep
// the app working before the doc exists and serve as the seed for the admin
// editor. NEVER hardcode limits elsewhere — read them from here.

/**
 * Report sections sold as plan differentiators. Mirrors api/_lib/planConfig.ts.
 * The server strips withheld sections from the response; these flags tell the
 * UI where to show an upgrade prompt instead.
 */
export interface PlanFeatures {
  /** Stage 5 "Decision Playbook" section. */
  playbook: boolean
  /** "Smart Skeptic" / verification questions section. */
  skepticQuestions: boolean
  /** Report export (print / save as PDF). */
  export: boolean
  /** "If I Were You" personal advisor section. */
  advisor: boolean
}

export interface PlanLimits {
  /** Monthly price in cents. null = custom / contact sales. */
  priceCents: number | null
  /** Monthly AI Credit allowance. null = custom allocation. 0 = none (free). */
  credits: number | null
  /** Max documents per report. */
  maxDocs: number
  /** Max pages per report. */
  maxPages: number
  /** Free one-off reports (free plan only). */
  freeReports?: number
  /** Decision Assistant follow-up questions allowed (per report / month). */
  assistantQuestions: number
  /** Which premium report sections this plan unlocks. */
  features?: Partial<PlanFeatures>
}

export interface CreditCosts {
  /** Base credits charged per Decision report. */
  reportBase: number
  /** Credits per analyzed page. */
  perPage: number
  /** Surcharge per scanned/OCR document. */
  ocrSurcharge: number
  /** Credits per Decision Assistant follow-up question. */
  assistantQuestion: number
  /** Multiplier applied to report cost when comparing more than one document. */
  multiDocMultiplier: number
}

export interface PlanConfig {
  plans: Record<PlanType, PlanLimits>
  creditCosts: CreditCosts
  referral: { freeReportReward: number }
}

const UNLIMITED = 9999

const NO_EXTRAS: PlanFeatures   = { playbook: false, skepticQuestions: false, export: false, advisor: false }
const PAID_EXTRAS: PlanFeatures = { playbook: true,  skepticQuestions: true,  export: true,  advisor: false }
const ALL_EXTRAS: PlanFeatures  = { playbook: true,  skepticQuestions: true,  export: true,  advisor: true }

export const DEFAULT_PLAN_CONFIG: PlanConfig = {
  plans: {
    free:     { priceCents: 0,     credits: 0,     maxDocs: 3,         maxPages: 20,        freeReports: 1, assistantQuestions: 3,         features: NO_EXTRAS },
    starter:  { priceCents: 900,   credits: 500,   maxDocs: 5,         maxPages: UNLIMITED,                 assistantQuestions: UNLIMITED, features: PAID_EXTRAS },
    pro:      { priceCents: 2900,  credits: 3000,  maxDocs: 10,        maxPages: UNLIMITED,                 assistantQuestions: UNLIMITED, features: ALL_EXTRAS },
    // Business/Custom are sold through Contact Sales, never self-serve. They
    // carry a real credit allowance (null used to resolve to zero, which locked
    // the highest-paying accounts out of the product); per-account allocations
    // are set by an admin via `creditsOverride` on the user document.
    business: { priceCents: null,  credits: 20000, maxDocs: UNLIMITED, maxPages: UNLIMITED,                 assistantQuestions: UNLIMITED, features: ALL_EXTRAS },
    custom:   { priceCents: null,  credits: 20000, maxDocs: UNLIMITED, maxPages: UNLIMITED,                 assistantQuestions: UNLIMITED, features: ALL_EXTRAS },
  },
  creditCosts: {
    reportBase: 10,
    perPage: 0.5,
    ocrSurcharge: 5,
    assistantQuestion: 1,
    multiDocMultiplier: 1.5,
  },
  referral: { freeReportReward: 1 },
}

const LS_KEY = 'tc-plan-config'

let memoryCache: PlanConfig | null = null
let inflight: Promise<PlanConfig> | null = null

/** Deep-merge a partial Firestore doc onto defaults so missing keys stay valid. */
function mergeConfig(raw: Partial<PlanConfig> | undefined | null): PlanConfig {
  if (!raw) return DEFAULT_PLAN_CONFIG
  const plans = { ...DEFAULT_PLAN_CONFIG.plans }
  if (raw.plans) {
    for (const key of Object.keys(plans) as PlanType[]) {
      const override = raw.plans[key]
      if (!override) continue
      // `features` merges one level deeper so a partial override in Firestore
      // can flip a single flag without dropping the others.
      plans[key] = {
        ...plans[key],
        ...override,
        features: { ...plans[key].features, ...(override.features ?? {}) },
      }
    }
  }
  return {
    plans,
    creditCosts: { ...DEFAULT_PLAN_CONFIG.creditCosts, ...(raw.creditCosts ?? {}) },
    referral: { ...DEFAULT_PLAN_CONFIG.referral, ...(raw.referral ?? {}) },
  }
}

/**
 * Synchronous best-effort config for first render. Returns the in-memory cache,
 * then a localStorage snapshot, then the built-in defaults. Always non-null.
 */
export function getCachedPlanConfig(): PlanConfig {
  if (memoryCache) return memoryCache
  try {
    const stored = localStorage.getItem(LS_KEY)
    if (stored) {
      memoryCache = mergeConfig(JSON.parse(stored))
      return memoryCache
    }
  } catch { /* ignore */ }
  return DEFAULT_PLAN_CONFIG
}

/**
 * Persist the plan config to Firestore (admin only — enforced by security
 * rules). Updates the in-memory + localStorage caches so the change is
 * reflected immediately without a reload.
 */
export async function savePlanConfig(cfg: PlanConfig): Promise<void> {
  await setDoc(doc(db, 'config', 'plans'), { ...cfg, updatedAt: serverTimestamp() }, { merge: true })
  memoryCache = cfg
  try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)) } catch { /* ignore */ }
}

/** Fetch the live config from Firestore (cached, single inflight request). */
export async function getPlanConfig(force = false): Promise<PlanConfig> {
  if (!force && memoryCache) return memoryCache
  if (!force && inflight) return inflight

  inflight = (async () => {
    try {
      const snap = await getDoc(doc(db, 'config', 'plans'))
      const merged = mergeConfig(snap.exists() ? (snap.data() as Partial<PlanConfig>) : null)
      memoryCache = merged
      try { localStorage.setItem(LS_KEY, JSON.stringify(merged)) } catch { /* ignore */ }
      return merged
    } catch (e) {
      console.warn('[planConfig] load failed, using defaults/cache:', e)
      return getCachedPlanConfig()
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/**
 * Compute the credit cost of a Decision report (client-side mirror of the
 * backend computeReportCost). Used for display estimates and pre-checks.
 * cost = (reportBase + perPage*pages) * (multiDocMultiplier if >1 doc) + ocrSurcharge*ocrDocs
 */
export function computeReportCost(
  cfg: PlanConfig,
  opts: { pages: number; docs: number; ocrDocs?: number },
): number {
  const c = cfg.creditCosts
  let cost = c.reportBase + c.perPage * Math.max(0, opts.pages)
  if (opts.docs > 1) cost *= c.multiDocMultiplier
  cost += c.ocrSurcharge * (opts.ocrDocs ?? 0)
  return Math.ceil(cost)
}

/** Format cents as a price string, e.g. 900 -> "$9". null -> "Custom". */
export function formatPrice(cents: number | null): string {
  if (cents == null) return 'Custom'
  if (cents === 0) return '$0'
  const dollars = cents / 100
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

/**
 * Resolve which premium sections a plan unlocks. Falls back to sensible
 * defaults so a config written before feature flags existed still behaves.
 * The server enforces the same flags — this is for rendering only.
 */
export function planFeatures(cfg: PlanConfig, plan: PlanType): PlanFeatures {
  const f = cfg.plans[plan]?.features ?? {}
  const isFree = plan === 'free'
  return {
    playbook: f.playbook ?? !isFree,
    skepticQuestions: f.skepticQuestions ?? !isFree,
    export: f.export ?? !isFree,
    advisor: f.advisor ?? ['pro', 'business', 'custom'].includes(plan),
  }
}

/** True when a plan limit means "no practical ceiling". */
export function isUnlimited(n: number | null | undefined): boolean {
  return n == null || n >= UNLIMITED
}
