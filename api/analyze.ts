import type { VercelRequest, VercelResponse } from '@vercel/node'
import { generateReport } from './_lib/shared.js'
import { verifyAuth, ApiError } from './_lib/auth.js'
import {
  resolveEntitlement,
  chargeCredits,
  refundCredits,
  consumeFreeReport,
  refundFreeReport,
  computeReportCost,
} from './_lib/entitlements.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
  // Content analysis has no page count, so it costs the base report price.
  const cost = computeReportCost(ent.cfg, { pages: 0, docs: 1 })

  try {
    if (ent.isFree) await consumeFreeReport(ent, 1)
    else await chargeCredits(ent, cost, { reports: 1, documents: 1 })
  } catch (e) {
    if (e instanceof ApiError) return res.status(e.status).json({ code: e.code, error: e.message })
    throw e
  }

  try {
    const data = await generateReport(content, language as string)
    return res.json({ data })
  } catch (err) {
    if (ent.isFree) await refundFreeReport(ent, 1)
    else await refundCredits(ent, cost, { reports: 1, documents: 1 })
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Analysis failed' })
  }
}
