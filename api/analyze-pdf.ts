import type { VercelRequest, VercelResponse } from '@vercel/node'
import formidable from 'formidable'
import fs from 'fs'
import { generateReport } from './_lib/shared.js'
import { verifyAuth, ApiError } from './_lib/auth.js'
import { REPORT_MODEL, ModelOutputError, isTimeoutError, TIMEOUT_MESSAGE } from './_lib/aiConfig.js'
import { recordAiUsage } from './_lib/aiUsage.js'
import { extractDocument, DocumentReadError, MAX_UPLOAD_TOTAL_BYTES } from './_lib/documents.js'
import {
  resolveEntitlement,
  assertWithinDocumentLimits,
  chargeCredits,
  refundCredits,
  consumeFreeReport,
  refundFreeReport,
  computeReportCost,
  type Entitlement,
} from './_lib/entitlements.js'

export const config = { api: { bodyParser: false } }

/**
 * Single-PDF content analysis. Like api/analyze.ts, nothing in the product
 * calls this any more, so it stays switched off unless ENABLE_CONTENT_ANALYSIS
 * is "true". When enabled it bills per page and enforces the plan's page cap.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (process.env.ENABLE_CONTENT_ANALYSIS !== 'true') return res.status(404).json({ error: 'Not found' })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authed = await verifyAuth(req)
  if (!authed) {
    return res.status(401).json({ code: 'UNAUTHENTICATED', error: 'Please sign in to run an analysis.' })
  }

  let ent: Entitlement
  try {
    ent = await resolveEntitlement(authed.uid)
  } catch (e) {
    console.error('[PDF] entitlement lookup failed:', e)
    return res.status(500).json({ error: 'Could not verify your plan. Please try again.' })
  }

  const form = formidable({ maxFileSize: MAX_UPLOAD_TOTAL_BYTES, maxTotalFileSize: MAX_UPLOAD_TOTAL_BYTES })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form.parse(req as any, async (err, fields, files) => {
    const file = Array.isArray(files?.file) ? files.file[0] : files?.file
    const cleanup = () => { if (file) fs.promises.unlink(file.filepath).catch(() => {}) }

    if (err) {
      cleanup()
      const tooLarge = (err as { httpCode?: number }).httpCode === 413
      return res.status(tooLarge ? 413 : 400).json({
        code: tooLarge ? 'UPLOAD_TOO_LARGE' : undefined,
        error: tooLarge ? 'This file is too large to analyse.' : 'File upload failed',
      })
    }
    if (!file) return res.status(400).json({ error: 'No PDF uploaded' })

    const language = String((Array.isArray(fields.language) ? fields.language[0] : fields.language) ?? 'English').slice(0, 40)
    let charged: number | null = null

    try {
      const name = file.originalFilename ?? 'document.pdf'
      const doc = await extractDocument(name, await fs.promises.readFile(file.filepath))
      if (doc.kind !== 'pdf') {
        return res.status(400).json({ error: `"${name}" is not a PDF.` })
      }

      // Priced and limited by the document's real page count, not a flat fee.
      const cost = computeReportCost(ent.cfg, { pages: doc.pages, docs: 1 })
      try {
        assertWithinDocumentLimits(ent, { docs: 1, pages: doc.pages })
        if (ent.isFree) await consumeFreeReport(ent, 1)
        else await chargeCredits(ent, cost, { reports: 1, documents: 1 })
        charged = cost
      } catch (e) {
        if (e instanceof ApiError) return res.status(e.status).json({ code: e.code, error: e.message })
        throw e
      }

      const { data, usage, truncated } = await generateReport(doc.text, language)
      await recordAiUsage({
        uid: ent.uid,
        plan: ent.plan,
        operation: 'content',
        model: REPORT_MODEL,
        usage,
        creditsCharged: ent.isFree ? 0 : cost,
        documents: 1,
        pages: doc.pages,
        truncated,
      })
      return res.json({ data: { ...data, content_truncated: truncated } })
    } catch (e) {
      if (charged !== null) {
        if (ent.isFree) await refundFreeReport(ent, 1)
        else await refundCredits(ent, charged, { reports: 1, documents: 1 })
      }
      console.error('[PDF ERROR]', e)
      if (e instanceof DocumentReadError) return res.status(400).json({ error: e.message })
      if (isTimeoutError(e)) return res.status(504).json({ code: 'TIMEOUT', error: TIMEOUT_MESSAGE })
      if (e instanceof ModelOutputError) return res.status(502).json({ code: 'MODEL_OUTPUT', error: e.message })
      return res.status(500).json({ error: e instanceof Error ? e.message : 'PDF analysis failed' })
    } finally {
      cleanup()
    }
  })
}
