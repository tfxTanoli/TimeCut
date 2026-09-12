import {
  doc,
  setDoc,
  updateDoc,
  addDoc,
  getDoc,
  getDocs,
  collection,
  limit,
  orderBy,
  query,
  serverTimestamp,
  increment,
  type Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type { User } from 'firebase/auth'
import type { DecisionReport, InputTab, TimeCutReport } from '../types'

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

// `updateLastLogin` used to live here and was called on every sign-in. It was
// a bare `updateDoc`, which throws `not-found` when the user document is
// missing — so an account whose document never got written could never log in
// again. `createUserDocument` already refreshes lastLoginAt and creates the
// document when it is absent, so the login paths call that instead.

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

// ── Decision reports ─────────────────────────────────────────────────────────
// A decision report used to live only in React state, so a refresh, a Back
// press or any navigation destroyed the thing the customer had just spent
// credits on — and the Security page promised the opposite ("saved to your own
// account so you can find it again from your profile"). Reports are persisted
// per account now, under the same `users/{uid}/analyses` collection the rules
// already restrict to its owner.

/** One stored report, as listed on the profile and opened at /report/:id. */
export interface StoredDecisionReport {
  id: string
  report: DecisionReport
  decisionGoal: string
  language: string
  documentType: string
  documentNames: string[]
  createdAt?: Timestamp | null
}

/**
 * Firestore rejects `undefined` anywhere in a document, and the report is
 * assembled from a model response where plenty of optional fields are simply
 * absent. A JSON round-trip drops those keys instead of throwing, which keeps a
 * save from failing over a field nobody reads.
 */
function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * Persist a decision report and return its id.
 *
 * Never throws into the analysis flow: the customer already has their report on
 * screen, and a Firestore hiccup must not read back as a failed analysis. A
 * miss here costs the history entry, not the report.
 */
export async function saveDecisionAnalysis(
  uid: string,
  report: DecisionReport,
  meta: { decisionGoal: string; language: string; documentType: string; documentNames: string[] },
): Promise<string | null> {
  try {
    // Only the report goes through stripUndefined. Running the whole payload
    // through it destroyed `createdAt`: serverTimestamp() returns a sentinel
    // object that a JSON round-trip flattens into a plain map, so Firestore
    // stored a map instead of a timestamp. The profile row then had no date to
    // show, and `orderBy('createdAt')` was ordering on a map — meaning the
    // report history was not actually in chronological order.
    const ref = await addDoc(collection(db, 'users', uid, 'analyses'), {
      kind: 'decision',
      report: stripUndefined(report),
      decisionGoal: meta.decisionGoal,
      language: meta.language,
      documentType: meta.documentType,
      documentNames: meta.documentNames,
      createdAt: serverTimestamp(),
    })
    return ref.id
  } catch (e) {
    console.warn('[analyses] could not save decision report:', e)
    return null
  }
}

/** Load one stored decision report. Returns null when it is missing or legacy. */
export async function getDecisionAnalysis(
  uid: string,
  id: string,
): Promise<StoredDecisionReport | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'analyses', id))
  if (!snap.exists()) return null
  const d = snap.data()
  // Reports written before this existed stored flat verdict fields rather than
  // a `report` object, and there is nothing for the decision view to render.
  if (!d.report) return null
  return {
    id: snap.id,
    report: d.report as DecisionReport,
    decisionGoal: d.decisionGoal ?? '',
    language: d.language ?? 'English',
    documentType: d.documentType ?? 'auto',
    documentNames: Array.isArray(d.documentNames) ? d.documentNames : [],
    createdAt: d.createdAt ?? null,
  }
}

/** Summary row for the profile's report history, newest first. */
export interface DecisionReportSummary {
  id: string
  decisionGoal: string
  documentType: string
  documentNames: string[]
  recommendation: string
  confidenceScore: number | null
  createdAt?: Timestamp | null
}

export async function listDecisionAnalyses(
  uid: string,
  max = 20,
): Promise<DecisionReportSummary[]> {
  const snap = await getDocs(query(
    collection(db, 'users', uid, 'analyses'),
    orderBy('createdAt', 'desc'),
    limit(max),
  ))
  return snap.docs
    .filter(d => !!d.data().report)
    .map(d => {
      const data = d.data()
      const report = data.report as DecisionReport
      return {
        id: d.id,
        decisionGoal: data.decisionGoal ?? '',
        documentType: data.documentType ?? 'auto',
        documentNames: Array.isArray(data.documentNames) ? data.documentNames : [],
        recommendation: report?.recommendation ?? '',
        confidenceScore: typeof report?.confidence_score === 'number' ? report.confidence_score : null,
        createdAt: data.createdAt ?? null,
      }
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
