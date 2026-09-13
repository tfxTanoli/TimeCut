import type { VercelRequest, VercelResponse } from '@vercel/node'
import { generateReport } from './_lib/shared.js'
import { verifyAuth, ApiError } from './_lib/auth.js'
import { REPORT_MODEL, MAX_CONTENT_CHARS, ModelOutputError, isTimeoutError, TIMEOUT_MESSAGE } from './_lib/aiConfig.js'
import { recordAiUsage } from './_lib/aiUsage.js'
import { estimatePages } from './_lib/documents.js'
import {
  resolveEntitlement,
  assertWithinDocumentLimits,
  chargeCredits,
  refundCredits,
  consumeFreeReport,
  refundFreeReport,
  computeReportCost,
} from './_lib/entitlements.js'

/**
 * Pasted-text content analysis ("is this worth my time").
 *
 * No screen in the product calls this any more — the site runs on decision
 * reports — but the route stayed deployed, metered and billable, which is pure
 * attack and cost surface. It is switched off unless ENABLE_CONTENT_ANALYSIS is
 * set to "true", and when it is on it bills and limits by length like every
 * other analysis instead of charging a flat fee for any amount of text.
 */
export function contentAnalysisEnabled(): boolean {
  return process.env.ENABLE_CONTENT_ANALYSIS === 'true'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!contentAnalysisEnabled()) return res.status(404).json({ error: 'Not found' })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { content, language = 'English' } = req.body ?? {}
  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'content is required' })
  }

  const authed = await verifyAuth(req)
  if (!authed) {
    return res.status(401).json({ code: 'UNAUTHENTICATED', error: 'Please sign in to run an analysis.' })
  }

  const ent = await resolveEntitlement(authed.uid)

  // Priced on what the model actually reads. This used to be the flat base
  // price for any length, which made pasted text cheaper than the same text as
  // a PDF and sidestepped the Free plan's page cap entirely.
  const pages = estimatePages(content.slice(0, MAX_CONTENT_CHARS))
  const cost = computeReportCost(ent.cfg, { pages, docs: 1 })

  try {
    assertWithinDocumentLimits(ent, { docs: 1, pages })
    if (ent.isFree) await consumeFreeReport(ent, 1)
    else await chargeCredits(ent, cost, { reports: 1, documents: 1 })
  } catch (e) {
    if (e instanceof ApiError) return res.status(e.status).json({ code: e.code, error: e.message })
    throw e
  }

  try {
    const { data, usage, truncated } = await generateReport(content, String(language).slice(0, 40))
    await recordAiUsage({
      uid: ent.uid,
      plan: ent.plan,
      operation: 'content',
      model: REPORT_MODEL,
      usage,
      creditsCharged: ent.isFree ? 0 : cost,
      documents: 1,
      pages,
      truncated,
    })
    return res.json({ data: { ...data, content_truncated: truncated } })
  } catch (err) {
    if (ent.isFree) await refundFreeReport(ent, 1)
    else await refundCredits(ent, cost, { reports: 1, documents: 1 })
    console.error('[ANALYZE ERROR]', err)
    if (isTimeoutError(err)) return res.status(504).json({ code: 'TIMEOUT', error: TIMEOUT_MESSAGE })
    if (err instanceof ModelOutputError) return res.status(502).json({ code: 'MODEL_OUTPUT', error: err.message })
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Analysis failed' })
  }
}
