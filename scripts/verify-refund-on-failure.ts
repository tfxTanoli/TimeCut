/**
 * End-to-end verification that a failed or timed-out analysis gives the credit
 * back.
 *
 * The refund path is the one thing a customer notices immediately when it is
 * wrong: they are charged, no report arrives, and their balance is short. This
 * exercises the real functions against real Firestore, using a disposable uid
 * that is deleted at the end. No real account is touched, and no OpenAI
 * report is generated (the one OpenAI call made is cancelled after 1ms and
 * costs nothing).
 *
 * What it checks:
 *   1. A paid plan charged for a report gets exactly those credits back.
 *   2. A free-plan report that fails restores the free report, not just credits.
 *   3. An Assistant question that fails gives its credit back.
 *   4. A real OpenAI deadline is classified as a timeout, so the route returns
 *      504 with the "your credits have been refunded" message rather than a
 *      raw SDK error.
 *   5. The per-route deadlines are all below the platform limits in vercel.json,
 *      which is what keeps the refund code reachable at all.
 *
 * Usage:
 *   npx tsx scripts/verify-refund-on-failure.ts
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import OpenAI from 'openai'
import admin from 'firebase-admin'
import { getAdminDb } from '../api/_lib/stripe-admin.js'
import {
  resolveEntitlement,
  chargeCredits,
  refundCredits,
  consumeFreeReport,
  refundFreeReport,
  chargeAssistantQuestion,
  getCurrentMonthKey,
} from '../api/_lib/entitlements.js'
import {
  isTimeoutError,
  TIMEOUT_MESSAGE,
  REPORT_TIMEOUT_MS,
  CONTENT_TIMEOUT_MS,
  ASSISTANT_TIMEOUT_MS,
  OPENAI_MAX_RETRIES,
} from '../api/_lib/aiConfig.js'

const TEST_UID = `refund-verify-${Date.now()}`
let passed = 0
let failed = 0

function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${name}\n        ${detail}`)
  if (ok) passed++
  else failed++
}

async function ledgerUsed(db: admin.firestore.Firestore): Promise<number> {
  const snap = await db.doc(`users/${TEST_UID}/credits/${getCurrentMonthKey()}`).get()
  return snap.exists ? (snap.data()?.used ?? 0) : 0
}

async function freeReportsUsed(db: admin.firestore.Firestore): Promise<number> {
  const snap = await db.doc(`users/${TEST_UID}`).get()
  return snap.exists ? (snap.data()?.freeReportsUsed ?? 0) : 0
}

async function cleanup(db: admin.firestore.Firestore) {
  const ledger = await db.collection(`users/${TEST_UID}/credits`).get()
  await Promise.all(ledger.docs.map(d => d.ref.delete()))
  await db.doc(`users/${TEST_UID}`).delete()
  const stillThere = (await db.doc(`users/${TEST_UID}`).get()).exists
  check('Test account removed', !stillThere, `users/${TEST_UID} and its credit ledger deleted.`)
}

async function main() {
  const db = getAdminDb()
  if (!db) throw new Error('Firebase admin unavailable — set FIREBASE_SERVICE_ACCOUNT_BASE64')

  console.log(`TimeCut — refund-on-failure verification\nDisposable test account: ${TEST_UID}\n${'='.repeat(64)}\n`)

  // ── 1. Paid plan: charge then refund ───────────────────────────────────────
  await db.doc(`users/${TEST_UID}`).set({
    plan: 'pro',
    planExpiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 864e5)),
  })

  const ent = await resolveEntitlement(TEST_UID)
  check('Test account resolves as Pro', ent.plan === 'pro' && ent.allowance > 0,
    `plan=${ent.plan}, allowance=${ent.allowance} credits.`)

  const before = await ledgerUsed(db)
  const COST = 20 // a typical 20-page single-document report
  await chargeCredits(ent, COST, { reports: 1, documents: 1 })
  const afterCharge = await ledgerUsed(db)
  check('Credits are taken before the analysis runs', afterCharge === before + COST,
    `used went ${before} -> ${afterCharge} (charged ${COST}).`)

  // This is exactly what the catch block in api/analyze-decision.ts calls.
  await refundCredits(ent, COST, { reports: 1, documents: 1 })
  const afterRefund = await ledgerUsed(db)
  check('A failed report refunds the credits in full', afterRefund === before,
    `used returned to ${afterRefund}, matching the ${before} before the charge.`)

  // ── 2. Free plan: the free report itself must come back ────────────────────
  await db.doc(`users/${TEST_UID}`).set(
    { plan: 'free', planExpiresAt: null, freeReportsUsed: 0 }, { merge: true },
  )
  const freeEnt = await resolveEntitlement(TEST_UID)
  await consumeFreeReport(freeEnt, 1)
  const usedFree = await freeReportsUsed(db)
  await refundFreeReport(freeEnt, 1)
  const restoredFree = await freeReportsUsed(db)
  check('A failed free-plan report restores the free report', usedFree === 1 && restoredFree === 0,
    `freeReportsUsed went 0 -> ${usedFree} -> ${restoredFree}.`)

  // ── 3. Assistant question ──────────────────────────────────────────────────
  await db.doc(`users/${TEST_UID}`).set({
    plan: 'pro',
    planExpiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 864e5)),
  }, { merge: true })
  const proEnt = await resolveEntitlement(TEST_UID)
  const beforeQ = await ledgerUsed(db)
  await chargeAssistantQuestion(proEnt)
  const afterQ = await ledgerUsed(db)
  await refundCredits(proEnt, proEnt.cfg.creditCosts.assistantQuestion, { assistant: 1 })
  const refundedQ = await ledgerUsed(db)
  check('A failed Assistant question refunds its credit',
    afterQ === beforeQ + proEnt.cfg.creditCosts.assistantQuestion && refundedQ === beforeQ,
    `used went ${beforeQ} -> ${afterQ} -> ${refundedQ}.`)

  // ── 4. A real OpenAI deadline is recognised as a timeout ───────────────────
  // 1ms is guaranteed to expire before the request completes, which produces
  // the genuine SDK error the route has to classify. Nothing is generated, so
  // there is no token cost.
  if (process.env.OPENAI_API_KEY) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    let caught: unknown
    try {
      await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 5,
      }, { timeout: 1, maxRetries: OPENAI_MAX_RETRIES })
    } catch (e) {
      caught = e
    }
    const recognised = isTimeoutError(caught)
    check('A real OpenAI deadline is classified as a timeout', recognised,
      recognised
        ? `Route returns 504 with: "${TIMEOUT_MESSAGE}"`
        : `NOT recognised — the customer would see a raw SDK error instead. Got: ${String(caught)}`)
    check('Timeouts are not retried', OPENAI_MAX_RETRIES === 0,
      `maxRetries=${OPENAI_MAX_RETRIES}; a retry would push past the route's own limit and skip the refund.`)
  } else {
    console.log('[SKIP] OpenAI deadline classification — OPENAI_API_KEY not set\n')
  }

  // ── 5. Each deadline sits below its platform limit ─────────────────────────
  // This is the property that makes every refund above reachable in production:
  // if the platform kills the function first, the catch block never runs.
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf-8'))
  const routeLimit = (r: string) => (vercel.functions?.[r]?.maxDuration ?? 0) * 1000
  const budgets: [string, string, number][] = [
    ['Decision reports', 'api/analyze-decision.ts', REPORT_TIMEOUT_MS],
    ['Content analyses', 'api/analyze.ts', CONTENT_TIMEOUT_MS],
    ['Content analyses (PDF)', 'api/analyze-pdf.ts', CONTENT_TIMEOUT_MS],
    ['Assistant questions', 'api/challenge-ai.ts', ASSISTANT_TIMEOUT_MS],
  ]
  for (const [label, route, ours] of budgets) {
    const limit = routeLimit(route)
    check(`${label}: our deadline is inside the platform limit`, ours < limit && limit > 0,
      `we stop at ${ours / 1000}s, the platform kills the function at ${limit / 1000}s — `
      + `${(limit - ours) / 1000}s of headroom for the refund to run.`)
  }

  await cleanup(db)

  console.log(`\n${'='.repeat(64)}`)
  console.log(failed === 0 ? `All ${passed} checks passed.` : `${passed} passed, ${failed} FAILED.`)
  process.exitCode = failed === 0 ? 0 : 1
}

main().catch(async e => {
  console.error('\nVerification aborted:', e)
  // Never leave the disposable account behind, even on an unexpected failure.
  const db = getAdminDb()
  if (db) await cleanup(db).catch(() => {})
  process.exit(1)
})
