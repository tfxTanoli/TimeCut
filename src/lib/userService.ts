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
} from 'firebase/firestore'
import { db } from './firebase'
import type { User } from 'firebase/auth'
import type { InputTab, TimeCutReport } from '../types'

export type PlanType = 'free' | 'starter' | 'pro' | 'custom'

export const PLAN_LIMITS: Record<PlanType, number> = {
  free: 5,
  starter: 500,
  pro: 300,
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
}

export async function createUserDocument(user: User, name?: string) {
  const userRef = doc(db, 'users', user.uid)
  await setDoc(
    userRef,
    {
      uid: user.uid,
      name: name ?? user.displayName ?? null,
      email: user.email,
      provider: user.providerData[0]?.providerId === 'google.com' ? 'google' : 'email',
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      totalAnalyses: 0,
      totalTimeSaved: 0,
      plan: 'free',
    },
    { merge: true },
  )
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
}

export async function getUserData(uid: string): Promise<UserData | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? (snap.data() as UserData) : null
}

export async function updateUserName(uid: string, name: string) {
  await updateDoc(doc(db, 'users', uid), { name })
}
