import admin from 'firebase-admin'
import { getAdminDb } from './stripe-admin.js'
import { getCurrentMonthKey } from './entitlements.js'
import { computeCostUsd, type TokenUsage } from './aiConfig.js'

// ── AI usage & cost ledger ──────────────────────────────────────────────────
// Records what every OpenAI call actually consumed, so real per-report and
// per-question costs can be read off the Admin dashboard instead of estimated.
// Nothing here may ever fail a request: an analysis the customer paid for must
// not be lost because a metrics write timed out.

export type AiOperation = 'content' | 'decision' | 'assistant'

export interface AiUsageRecord {
  uid: string
  plan: string
  operation: AiOperation
  model: string
  usage: TokenUsage
  /** AI Credits charged for this call (0 for free-plan reports). */
  creditsCharged?: number
  documents?: number
  pages?: number
  /** True when input had to be cut to fit the character budget. */
  truncated?: boolean
}

/**
 * Write one usage record plus the running rollups.
 *
 * Four documents are touched in a single batch:
 *  • `aiUsage/{autoId}`               — the raw per-call record, for drill-down
 *  • `aiUsageMonthly/{month}`         — headline totals, read as one document
 *  • `aiUsageByUser/{month}_{uid}`    — per-account totals, for the top-spenders list
 *  • `users/{uid}/credits/{month}`    — cost alongside the credits already tracked there
 *
 * Rollups are maintained on write because the alternative — summing thousands
 * of raw records in the browser — gets slower and more expensive every month.
 */
export async function recordAiUsage(rec: AiUsageRecord): Promise<void> {
  try {
    const adb = getAdminDb()
    if (!adb) return

    const month = getCurrentMonthKey()
    const costUsd = computeCostUsd(rec.model, rec.usage)
    const inc = admin.firestore.FieldValue.increment
    const now = admin.firestore.FieldValue.serverTimestamp()

    const batch = adb.batch()

    batch.set(adb.collection('aiUsage').doc(), {
      uid: rec.uid,
      plan: rec.plan,
      operation: rec.operation,
      model: rec.model,
      month,
      promptTokens: rec.usage.promptTokens,
      completionTokens: rec.usage.completionTokens,
      cachedTokens: rec.usage.cachedTokens,
      totalTokens: rec.usage.totalTokens,
      costUsd,
      creditsCharged: rec.creditsCharged ?? 0,
      documents: rec.documents ?? 0,
      pages: rec.pages ?? 0,
      truncated: rec.truncated ?? false,
      createdAt: now,
    })

    // Per-operation counters live under a nested map so a new operation type
    // never requires a schema change here.
    batch.set(
      adb.collection('aiUsageMonthly').doc(month),
      {
        month,
        calls: inc(1),
        tokensIn: inc(rec.usage.promptTokens),
        tokensOut: inc(rec.usage.completionTokens),
        costUsd: inc(costUsd),
        byOperation: {
          [rec.operation]: {
            calls: inc(1),
            tokensIn: inc(rec.usage.promptTokens),
            tokensOut: inc(rec.usage.completionTokens),
            costUsd: inc(costUsd),
          },
        },
        updatedAt: now,
      },
      { merge: true },
    )

    batch.set(
      adb.collection('aiUsageByUser').doc(`${month}_${rec.uid}`),
      {
        month,
        uid: rec.uid,
        plan: rec.plan,
        calls: inc(1),
        tokensIn: inc(rec.usage.promptTokens),
        tokensOut: inc(rec.usage.completionTokens),
        costUsd: inc(costUsd),
        creditsCharged: inc(rec.creditsCharged ?? 0),
        updatedAt: now,
      },
      { merge: true },
    )

    batch.set(
      adb.doc(`users/${rec.uid}/credits/${month}`),
      {
        tokensIn: inc(rec.usage.promptTokens),
        tokensOut: inc(rec.usage.completionTokens),
        costUsd: inc(costUsd),
      },
      { merge: true },
    )

    await batch.commit()
  } catch (e) {
    // Deliberately swallowed. Metrics are not worth failing a paid analysis for.
    console.warn('[aiUsage] usage logging failed:', e)
  }
}
