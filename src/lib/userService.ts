import {
  doc,
  setDoc,
  updateDoc,
  addDoc,
  getDoc,
  collection,
  serverTimestamp,
  increment,
  type Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type { User } from 'firebase/auth'
import type { InputTab, TimeCutReport } from '../types'

export type PlanType = 'free' | 'starter' | 'pro' | 'business' | 'custom'

// PLAN_LIMITS / PAGE_LIMITS used to live here with hardcoded figures that had
// drifted away from the pricing page (2/5/20 reports, 20/50/100 pages). Every
// limit now comes from `config/plans` via lib/planConfig, so the pricing page,
// the checkout modal and the product all quote the same numbers.

/**
 * Ledger month key. UTC so the browser and the server always address the same
 * document — a local-time key put users near the date line on a different
 * month's ledger than the one the server debits.
 */
export function getCurrentMonthKey(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
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
  /** Mirrors the Stripe subscription status (active, past_due, canceled…). */
  subscriptionStatus?: string | null
  /** Per-account AI Credit allocation set by an admin. Overrides the plan default. */
  creditsOverride?: number | null
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

// Credit consumption used to happen here, in the browser, against a ledger the
// user could rewrite. It now lives in api/_lib/entitlements.ts: the server
// verifies the plan, charges before doing the work, and refunds if the work
// fails. Firestore rules make users/{uid}/credits/{month} read-only to the
// client, so this file only reads the ledger for display.

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
