import {
  doc,
  setDoc,
  updateDoc,
  addDoc,
  getDoc,
  collection,
  serverTimestamp,
  increment,
  runTransaction,
  type Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type { User } from 'firebase/auth'
import type { InputTab, TimeCutReport } from '../types'

export type PlanType = 'free' | 'starter' | 'pro' | 'business' | 'custom'

export const PLAN_LIMITS: Record<PlanType, number> = {
  free: 2,
  starter: 5,
  pro: 20,
  business: 999999,
  custom: 999999,
}

export const PAGE_LIMITS: Record<PlanType, number> = {
  free: 20,
  starter: 50,
  pro: 100,
  business: 999999,
  custom: 999999,
}

export function getCurrentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export type ActivityType =
  | 'signup'
  | 'login'
  | 'logout'
  | 'analysis_submitted'
  | 'analysis_completed'
  | 'report_downloaded'
  | 'report_shared'

interface ActivityMetadata {
  provider?: string
  inputType?: InputTab
  language?: string
  verdict?: string
  valueScore?: number
  timeSavedMinutes?: number
  attentionQuality?: string
  documentType?: string
}

export async function createUserDocument(user: User, name?: string) {
  const userRef = doc(db, 'users', user.uid)
  const existing = await getDoc(userRef)

  if (existing.exists()) {
    // User already has a document — only touch safe metadata; NEVER overwrite plan or stats
    await updateDoc(userRef, {
      email: user.email,
      lastLoginAt: serverTimestamp(),
      ...(name ?? user.displayName ? { name: name ?? user.displayName } : {}),
    })
    return
  }

  // Brand-new user — create document with free plan
  await setDoc(userRef, {
    uid: user.uid,
    name: name ?? user.displayName ?? null,
    email: user.email,
    provider: user.providerData[0]?.providerId === 'google.com' ? 'google' : 'email',
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    totalAnalyses: 0,
    totalTimeSaved: 0,
    plan: 'free',
  })
}

export async function getMonthlyUsage(uid: string): Promise<number> {
  const monthKey = getCurrentMonthKey()
  const snap = await getDoc(doc(db, 'users', uid, 'usage', monthKey))
  return snap.exists() ? (snap.data().count as number) : 0
}

export async function checkAndIncrementUsage(uid: string, plan: PlanType): Promise<void> {
  const limit = PLAN_LIMITS[plan]
  const monthKey = getCurrentMonthKey()
  const usageRef = doc(db, 'users', uid, 'usage', monthKey)

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(usageRef)
    const current: number = snap.exists() ? (snap.data().count as number) : 0
    if (current >= limit) {
      throw new Error(`LIMIT_EXCEEDED:${limit}`)
    }
    tx.set(usageRef, { count: current + 1, updatedAt: serverTimestamp() }, { merge: true })
  })
}

export async function updateLastLogin(uid: string) {
  const userRef = doc(db, 'users', uid)
  await updateDoc(userRef, { lastLoginAt: serverTimestamp() })
}

export async function logActivity(
  uid: string,
  type: ActivityType,
  metadata: ActivityMetadata = {},
) {
  const activitiesRef = collection(db, 'users', uid, 'activities')
  await addDoc(activitiesRef, {
    type,
    timestamp: serverTimestamp(),
    ...metadata,
  })
}

export async function saveAnalysis(
  uid: string,
  report: TimeCutReport,
  inputType: InputTab,
  language: string,
) {
  const analysesRef = collection(db, 'users', uid, 'analyses')
  await addDoc(analysesRef, {
    // core verdict
    verdict: report.verdict,
    verdict_description: report.verdict_description,
    overall_value_score: report.overall_value_score,
    value_score: report.value_score,
    time_saved_minutes: report.time_saved_minutes,
    attention_quality: report.attention_quality,
    attention_quality_description: report.attention_quality_description,
    // detailed fields
    what_this_is_about: report.what_this_is_about,
    key_insights: report.key_insights,
    what_to_skip: report.what_to_skip,
    best_for: report.best_for,
    final_decision: report.final_decision,
    // meta
    inputType,
    language,
    createdAt: serverTimestamp(),
  })
}

export async function incrementAnalysisStats(uid: string, timeSavedMinutes: number) {
  const userRef = doc(db, 'users', uid)
  await updateDoc(userRef, {
    totalAnalyses: increment(1),
    totalTimeSaved: increment(timeSavedMinutes),
  })
}

export interface UserData {
  uid: string
  name: string | null
  email: string
  provider: string
  totalAnalyses: number
  totalTimeSaved: number
  plan: PlanType
  planStartDate?: Timestamp | null
  planExpiresAt?: Timestamp | null
}

export async function getUserData(uid: string): Promise<UserData | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? (snap.data() as UserData) : null
}

export async function updateUserName(uid: string, name: string) {
  await updateDoc(doc(db, 'users', uid), { name })
}

// ── AI Credits ledger ────────────────────────────────────────────────────────
// Monthly credit consumption is tracked per month at users/{uid}/credits/{monthKey}.
// The monthly allowance is derived from the plan config (not persisted), so it
// resets automatically each month and reflects plan changes immediately.

export interface CreditsUsage {
  used: number
  reportsUsed: number
  assistantUsed: number
  documentsUploaded: number
}

export async function getCreditsUsage(
  uid: string,
  monthKey = getCurrentMonthKey(),
): Promise<CreditsUsage> {
  const snap = await getDoc(doc(db, 'users', uid, 'credits', monthKey))
  const d = snap.exists() ? snap.data() : {}
  return {
    used: d.used ?? 0,
    reportsUsed: d.reportsUsed ?? 0,
    assistantUsed: d.assistantUsed ?? 0,
    documentsUploaded: d.documentsUploaded ?? 0,
  }
}

/**
 * Atomically consume credits for the current month. `allowance` is the plan's
 * monthly credit allowance (from config). Throws `INSUFFICIENT_CREDITS:{left}`
 * when the cost would exceed the allowance.
 */
export async function consumeCredits(
  uid: string,
  allowance: number,
  cost: number,
  extra: { reports?: number; assistant?: number; documents?: number; clamp?: boolean } = {},
): Promise<void> {
  const monthKey = getCurrentMonthKey()
  const ref = doc(db, 'users', uid, 'credits', monthKey)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    const used: number = snap.exists() ? (snap.data().used ?? 0) : 0
    if (used + cost > allowance) {
      // clamp: the work already happened (e.g. report generated) — deduct what
      // remains rather than erroring, so the next attempt is correctly blocked.
      if (!extra.clamp) {
        throw new Error(`INSUFFICIENT_CREDITS:${Math.max(0, allowance - used)}`)
      }
    }
    const nextUsed = extra.clamp ? Math.min(allowance, used + cost) : used + cost
    tx.set(
      ref,
      {
        used: nextUsed,
        allocated: allowance,
        reportsUsed: increment(extra.reports ?? 0),
        assistantUsed: increment(extra.assistant ?? 0),
        documentsUploaded: increment(extra.documents ?? 0),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })
}

/**
 * Free plan: consume one free report. Allowance = base free reports + earned
 * (referral) reports. Throws `FREE_REPORTS_EXHAUSTED` when none remain.
 */
export async function consumeFreeReport(
  uid: string,
  baseFreeReports: number,
  documents = 0,
): Promise<void> {
  const userRef = doc(db, 'users', uid)
  const monthKey = getCurrentMonthKey()
  const creditsRef = doc(db, 'users', uid, 'credits', monthKey)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef)
    const data = snap.data() ?? {}
    const usedFree: number = data.freeReportsUsed ?? 0
    const earned: number = data.freeReportsEarned ?? 0
    const allowed = baseFreeReports + earned
    if (usedFree >= allowed) throw new Error('FREE_REPORTS_EXHAUSTED')
    tx.set(userRef, { freeReportsUsed: usedFree + 1 }, { merge: true })
    tx.set(
      creditsRef,
      {
        reportsUsed: increment(1),
        documentsUploaded: increment(documents),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })
}

/** Generate and persist a short referral code on the user doc if missing. */
export async function ensureReferralCode(uid: string): Promise<string> {
  const userRef = doc(db, 'users', uid)
  const snap = await getDoc(userRef)
  const existing = snap.data()?.referralCode as string | undefined
  if (existing) return existing
  const code = uid.slice(0, 6).toUpperCase()
  await updateDoc(userRef, { referralCode: code })
  return code
}

export interface ReportFeedbackAnswers {
  helped: string            // "Yes, definitely" | "Somewhat" | "Not really" | "No"
  mostValuableInsight: string
  confidence: string        // "Much more confident" | ...
  wouldHaveMissed: string   // "Definitely" | "Probably" | "Not sure" | "No"
  wouldUseAgain: string     // "Yes, definitely" | "Maybe" | "No"
}

/**
 * Store report feedback in a top-level `feedback` collection so it can be
 * reviewed from the Admin Dashboard. Anonymous users are allowed (uid null).
 */
export async function saveReportFeedback(
  answers: ReportFeedbackAnswers,
  meta: { uid?: string | null; decisionGoal?: string; language?: string; documentType?: string } = {},
) {
  await addDoc(collection(db, 'feedback'), {
    ...answers,
    uid: meta.uid ?? null,
    decisionGoal: meta.decisionGoal ?? null,
    language: meta.language ?? null,
    documentType: meta.documentType ?? null,
    createdAt: serverTimestamp(),
  })
}
