import { getAdminDb } from './stripe-admin.js'

// ── Backend mirror of src/lib/planConfig.ts ─────────────────────────────────
// Reads the same Firestore `config/plans` doc via the Admin SDK so server-side
// credit metering and limit enforcement use the same source of truth. Cached
// per cold-start. Falls back to defaults when the doc or admin DB is missing.

export type PlanType = 'free' | 'starter' | 'pro' | 'business' | 'custom'

export interface PlanLimits {
  priceCents: number | null
  credits: number | null
  maxDocs: number
  maxPages: number
  freeReports?: number
  assistantQuestions: number
}

export interface CreditCosts {
  reportBase: number
  perPage: number
  ocrSurcharge: number
  assistantQuestion: number
  multiDocMultiplier: number
}

export interface PlanConfig {
  plans: Record<PlanType, PlanLimits>
  creditCosts: CreditCosts
  referral: { freeReportReward: number }
}

const UNLIMITED = 9999

export const DEFAULT_PLAN_CONFIG: PlanConfig = {
  plans: {
    free:     { priceCents: 0,     credits: 0,    maxDocs: 3,         maxPages: 20,        freeReports: 1, assistantQuestions: 3 },
    starter:  { priceCents: 900,   credits: 500,  maxDocs: 5,         maxPages: UNLIMITED, assistantQuestions: UNLIMITED },
    pro:      { priceCents: 2900,  credits: 3000, maxDocs: 10,        maxPages: UNLIMITED, assistantQuestions: UNLIMITED },
    business: { priceCents: null,  credits: null, maxDocs: UNLIMITED, maxPages: UNLIMITED, assistantQuestions: UNLIMITED },
    custom:   { priceCents: null,  credits: null, maxDocs: UNLIMITED, maxPages: UNLIMITED, assistantQuestions: UNLIMITED },
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

let cache: PlanConfig | null = null

function mergeConfig(raw: Partial<PlanConfig> | undefined | null): PlanConfig {
  if (!raw) return DEFAULT_PLAN_CONFIG
  const plans = { ...DEFAULT_PLAN_CONFIG.plans }
  if (raw.plans) {
    for (const key of Object.keys(plans) as PlanType[]) {
      if (raw.plans[key]) plans[key] = { ...plans[key], ...raw.plans[key] }
    }
  }
  return {
    plans,
    creditCosts: { ...DEFAULT_PLAN_CONFIG.creditCosts, ...(raw.creditCosts ?? {}) },
    referral: { ...DEFAULT_PLAN_CONFIG.referral, ...(raw.referral ?? {}) },
  }
}

export async function getPlanConfig(): Promise<PlanConfig> {
  if (cache) return cache
  try {
    const adb = getAdminDb()
    if (!adb) { cache = DEFAULT_PLAN_CONFIG; return cache }
    const snap = await adb.collection('config').doc('plans').get()
    cache = mergeConfig(snap.exists ? (snap.data() as Partial<PlanConfig>) : null)
    return cache
  } catch (e) {
    console.warn('[planConfig] backend load failed, using defaults:', e)
    cache = DEFAULT_PLAN_CONFIG
    return cache
  }
}

// Last-resort charge amounts (cents) used only when `config/plans` has no
// explicit price for a plan (e.g. Business, which is "Contact Sales" on the
// pricing page and therefore has priceCents = null). Everything else must come
// from the Firestore doc so the site and Stripe never disagree.
const FALLBACK_AMOUNT_CENTS: Record<string, number> = {
  starter: 900,
  pro: 2900,
  business: 14900,
}

/**
 * The amount (in cents) to actually charge for a paid plan. Single source of
 * truth for Stripe: reads `config/plans` (admin-editable) and only falls back
 * to FALLBACK_AMOUNT_CENTS when the plan has no price configured.
 */
export async function getStripeAmount(plan: string): Promise<number> {
  const cfg = await getPlanConfig()
  const cents = cfg.plans[plan as PlanType]?.priceCents
  if (typeof cents === 'number' && cents > 0) return cents
  return FALLBACK_AMOUNT_CENTS[plan] ?? 0
}

/**
 * Compute the credit cost of a Decision report.
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
