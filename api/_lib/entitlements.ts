import admin from 'firebase-admin'
import { getAdminDb } from './stripe-admin.js'
import { getPlanConfig, computeReportCost, type PlanConfig, type PlanLimits, type PlanType } from './planConfig.js'
import { ApiError } from './auth.js'

// ── Server-side entitlements & AI Credit ledger ──────────────────────────────
// This module is the ONLY place that decides what a user may do and what it
// costs them. It runs with the Admin SDK, so it reads the plan from the user
// document (which security rules make read-only to the client) and writes the
// credit ledger the client can only read. Nothing here trusts request input.

const UNLIMITED = 9999

/** Month key for the credit ledger. UTC so the client and server never disagree. */
export function getCurrentMonthKey(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export interface Entitlement {
  uid: string
  plan: PlanType
  limits: PlanLimits
  cfg: PlanConfig
  isFree: boolean
  /** Monthly credit allowance. 0 for the free plan. */
  allowance: number
}

/**
 * Resolve the caller's effective plan. An expired plan is treated as free
 * immediately (and written back), so a lapsed subscription cannot keep paid
 * limits just because nobody opened the app to trigger the downgrade.
 */
export async function resolveEntitlement(uid: string): Promise<Entitlement> {
  const cfg = await getPlanConfig()
  const adb = getAdminDb()

  let plan: PlanType = 'free'
  let creditsOverride: number | null = null

  if (adb) {
    const snap = await adb.doc(`users/${uid}`).get()
    const data = snap.exists ? (snap.data() ?? {}) : {}
    const stored = data.plan as PlanType | undefined
    const expiresAt = (data.planExpiresAt as admin.firestore.Timestamp | undefined)?.toDate?.()

    // Per-account credit allocation — how "Custom Credit Allocation" is
    // actually delivered for Business accounts. Only admins can write it.
    const override = data.creditsOverride
    if (typeof override === 'number' && override >= 0) creditsOverride = override

    if (stored && cfg.plans[stored]) plan = stored

    if (plan !== 'free' && expiresAt && expiresAt.getTime() < Date.now()) {
      plan = 'free'
      try {
        await adb.doc(`users/${uid}`).update({
          plan: 'free',
          planStartDate: null,
          planExpiresAt: null,
        })
        console.log(`[entitlements] uid=${uid} plan expired → downgraded to free`)
      } catch (e) {
        console.warn('[entitlements] expiry write-back failed:', e)
      }
    }
  }

  const limits = cfg.plans[plan]
  // A per-account override only applies to paid plans — it must never hand
  // credits to someone whose subscription lapsed back to free.
  const allowance = plan !== 'free' && creditsOverride != null
    ? creditsOverride
    : limits.credits ?? 0

  return {
    uid,
    plan,
    limits,
    cfg,
    isFree: plan === 'free',
    allowance,
  }
}

/** True when a plan's numeric limit means "no practical ceiling". */
export function isUnlimited(n: number | null | undefined): boolean {
  return n == null || n >= UNLIMITED
}

/**
 * Enforce the plan's per-report document and page ceilings. Throws ApiError so
 * the route can return a specific, actionable message.
 */
export function assertWithinDocumentLimits(
  ent: Entitlement,
  opts: { docs: number; pages: number },
): void {
  const { maxDocs, maxPages } = ent.limits

  if (!isUnlimited(maxDocs) && opts.docs > maxDocs) {
    throw new ApiError(
      400,
      'DOC_LIMIT',
      `Your plan allows up to ${maxDocs} document${maxDocs === 1 ? '' : 's'} per report. You uploaded ${opts.docs}.`,
    )
  }

  if (!isUnlimited(maxPages) && opts.pages > maxPages) {
    throw new ApiError(
      400,
      'PAGE_LIMIT',
      `Total pages (${opts.pages}) exceeds your plan limit of ${maxPages} pages. Upgrade your plan or reduce the number of documents.`,
    )
  }
}

/** Feature flags for the caller's plan, with safe defaults for older configs. */
export function planFeatures(ent: Entitlement) {
  const f = ent.limits.features ?? {}
  return {
    playbook: f.playbook ?? !ent.isFree,
    skepticQuestions: f.skepticQuestions ?? !ent.isFree,
    export: f.export ?? !ent.isFree,
    advisor: f.advisor ?? ['pro', 'business', 'custom'].includes(ent.plan),
  }
}

function ledgerRef(uid: string) {
  const adb = getAdminDb()
  if (!adb) throw new ApiError(500, 'DB_UNAVAILABLE', 'Usage tracking is unavailable. Please try again.')
  return adb.doc(`users/${uid}/credits/${getCurrentMonthKey()}`)
}

interface DebitExtras {
  reports?: number
  assistant?: number
  documents?: number
}

/**
 * Atomically charge AI Credits for the current month. Throws
 * INSUFFICIENT_CREDITS when the cost would exceed the plan allowance — the
 * charge happens *before* the work, so a user can never overrun their plan.
 */
export async function chargeCredits(
  ent: Entitlement,
  cost: number,
  extra: DebitExtras = {},
): Promise<void> {
  const adb = getAdminDb()
  if (!adb) throw new ApiError(500, 'DB_UNAVAILABLE', 'Usage tracking is unavailable. Please try again.')

  const ref = ledgerRef(ent.uid)
  const inc = admin.firestore.FieldValue.increment

  await adb.runTransaction(async tx => {
    const snap = await tx.get(ref)
    const used: number = snap.exists ? (snap.data()?.used ?? 0) : 0

    if (used + cost > ent.allowance) {
      throw new ApiError(
        402,
        'INSUFFICIENT_CREDITS',
        `Not enough AI Credits. This analysis needs ${cost} credits and you have ${Math.max(0, ent.allowance - used)} left this month.`,
      )
    }

    tx.set(
      ref,
      {
        used: used + cost,
        allocated: ent.allowance,
        reportsUsed: inc(extra.reports ?? 0),
        assistantUsed: inc(extra.assistant ?? 0),
        documentsUploaded: inc(extra.documents ?? 0),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  })
}

/** Give credits back when the work we charged for failed. Never goes below 0. */
export async function refundCredits(
  ent: Entitlement,
  cost: number,
  extra: DebitExtras = {},
): Promise<void> {
  const adb = getAdminDb()
  if (!adb) return
  const ref = ledgerRef(ent.uid)
  const inc = admin.firestore.FieldValue.increment
  try {
    await adb.runTransaction(async tx => {
      const snap = await tx.get(ref)
      const used: number = snap.exists ? (snap.data()?.used ?? 0) : 0
      tx.set(
        ref,
        {
          used: Math.max(0, used - cost),
          reportsUsed: inc(-(extra.reports ?? 0)),
          assistantUsed: inc(-(extra.assistant ?? 0)),
          documentsUploaded: inc(-(extra.documents ?? 0)),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    })
  } catch (e) {
    console.warn('[entitlements] refund failed:', e)
  }
}

/**
 * Free plan: consume one free report. Allowance is the configured base plus any
 * referral rewards earned. Throws FREE_REPORTS_EXHAUSTED when none remain.
 */
export async function consumeFreeReport(ent: Entitlement, documents: number): Promise<void> {
  const adb = getAdminDb()
  if (!adb) throw new ApiError(500, 'DB_UNAVAILABLE', 'Usage tracking is unavailable. Please try again.')

  const userRef = adb.doc(`users/${ent.uid}`)
  const ref = ledgerRef(ent.uid)
  const inc = admin.firestore.FieldValue.increment
  const base = ent.cfg.plans.free.freeReports ?? 1

  await adb.runTransaction(async tx => {
    const snap = await tx.get(userRef)
    const data = snap.exists ? (snap.data() ?? {}) : {}
    const usedFree: number = data.freeReportsUsed ?? 0
    const earned: number = data.freeReportsEarned ?? 0

    if (usedFree >= base + earned) {
      throw new ApiError(
        402,
        'FREE_REPORTS_EXHAUSTED',
        'You have used your free report. Upgrade to a paid plan to run more analyses.',
      )
    }

    tx.set(userRef, { freeReportsUsed: usedFree + 1 }, { merge: true })
    tx.set(
      ref,
      {
        reportsUsed: inc(1),
        documentsUploaded: inc(documents),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  })
}

/** Undo consumeFreeReport when the analysis it paid for failed. */
export async function refundFreeReport(ent: Entitlement, documents: number): Promise<void> {
  const adb = getAdminDb()
  if (!adb) return
  const inc = admin.firestore.FieldValue.increment
  try {
    await adb.doc(`users/${ent.uid}`).set({ freeReportsUsed: inc(-1) }, { merge: true })
    await ledgerRef(ent.uid).set(
      { reportsUsed: inc(-1), documentsUploaded: inc(-documents) },
      { merge: true },
    )
  } catch (e) {
    console.warn('[entitlements] free-report refund failed:', e)
  }
}

/**
 * Charge for one Decision Assistant question. Free plans get a fixed monthly
 * quota and are not charged credits; paid plans pay per question from credits.
 */
export async function chargeAssistantQuestion(ent: Entitlement): Promise<void> {
  const adb = getAdminDb()
  if (!adb) throw new ApiError(500, 'DB_UNAVAILABLE', 'Usage tracking is unavailable. Please try again.')

  if (!ent.isFree) {
    await chargeCredits(ent, ent.cfg.creditCosts.assistantQuestion, { assistant: 1 })
    return
  }

  const quota = ent.limits.assistantQuestions
  const ref = ledgerRef(ent.uid)
  const inc = admin.firestore.FieldValue.increment

  await adb.runTransaction(async tx => {
    const snap = await tx.get(ref)
    const usedQs: number = snap.exists ? (snap.data()?.assistantUsed ?? 0) : 0

    if (!isUnlimited(quota) && usedQs >= quota) {
      throw new ApiError(
        402,
        'ASSISTANT_LIMIT',
        `You have used all ${quota} Decision Assistant questions included with the Free plan. Upgrade to ask more.`,
      )
    }

    tx.set(
      ref,
      {
        assistantUsed: inc(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  })
}

/** Cost of a report, from the shared config. Re-exported so routes agree. */
export { computeReportCost }
