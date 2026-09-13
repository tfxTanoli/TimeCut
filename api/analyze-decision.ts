import type { VercelRequest, VercelResponse } from '@vercel/node'
import formidable from 'formidable'
import fs from 'fs'
import { generateDecisionReport, normalizeDecisionReport } from './_lib/shared.js'
import { verifyAuth, ApiError } from './_lib/auth.js'
import { REPORT_MODEL, isTimeoutError, TIMEOUT_MESSAGE, ModelOutputError } from './_lib/aiConfig.js'
import { recordAiUsage } from './_lib/aiUsage.js'
import {
  extractDocument,
  DocumentReadError,
  MAX_FILES_ABSOLUTE,
  MAX_UPLOAD_TOTAL_BYTES,
} from './_lib/documents.js'
import { MAX_DECISION_GOAL_CHARS } from './_lib/assistant.js'
import {
  resolveEntitlement,
  assertWithinDocumentLimits,
  planFeatures,
  chargeCredits,
  refundCredits,
  consumeFreeReport,
  refundFreeReport,
  computeReportCost,
  type Entitlement,
} from './_lib/entitlements.js'
// Mirrors MIN_DECISION_GOAL_LENGTH in src/components/DecisionUpload.tsx. The
// API and the browser bundle build separately (see tsconfig.api.json), so this
// is duplicated the same way the plan config is — change both together, or the
// form will let through a goal the server then rejects with a 400.
const MIN_DECISION_GOAL_LENGTH = 2

const DOCUMENT_TYPES = new Set(['auto', 'cv', 'supplier_quotation', 'contract', 'business_proposal', 'general'])

/** A file that was uploaded but not analysed, and why. Returned to the UI. */
interface SkippedDocument {
  name: string
  /** English explanation, used when the UI has no translation for `code`. */
  reason: string
  /** Machine-readable reason, translated by the report UI. */
  code: string
}

/**
 * Remove the report sections the caller's plan does not include. Gating happens
 * here, on the server, so a withheld section never reaches the browser — the UI
 * shows an upgrade prompt in its place rather than hiding delivered content.
 */
function applyPlanGating(
  data: Record<string, unknown>,
  features: ReturnType<typeof planFeatures>,
): Record<string, unknown> {
  const out = { ...data }
  if (!features.playbook) delete out.decision_playbook
  if (!features.skepticQuestions) {
    delete out.verification_questions
    delete out.smart_skeptic_questions
  }
  if (!features.advisor) delete out.if_i_were_you
  return out
}

function firstField(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

export const config = { api: { bodyParser: false } }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── 1. Who is calling? ──
  // Verified from the Firebase ID token, never from the request body. Without
  // this, plan limits and credit metering are unenforceable.
  const authed = await verifyAuth(req)
  if (!authed) {
    return res.status(401).json({
      code: 'UNAUTHENTICATED',
      error: 'Please sign in to run an analysis.',
    })
  }

  // ── 2. What is that user entitled to? ──
  let ent: Entitlement
  try {
    ent = await resolveEntitlement(authed.uid)
  } catch (e) {
    console.error('[DECISION] entitlement lookup failed:', e)
    return res.status(500).json({ error: 'Could not verify your plan. Please try again.' })
  }
  const features = planFeatures(ent)

  const form = formidable({
    maxFileSize: MAX_UPLOAD_TOTAL_BYTES,
    maxTotalFileSize: MAX_UPLOAD_TOTAL_BYTES,
    maxFiles: MAX_FILES_ABSOLUTE,
    multiples: true,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form.parse(req as any, async (err, fields, files) => {
    // Temp files are removed however the request ends — the Security page
    // promises uploads are not kept, and a warm instance would otherwise
    // accumulate them in /tmp.
    const rawFiles = files?.['files[]'] ?? files?.files ?? []
    const fileList = Array.isArray(rawFiles) ? rawFiles : [rawFiles]
    const cleanup = () => {
      for (const f of fileList) fs.promises.unlink(f.filepath).catch(() => {})
    }

    if (err) {
      cleanup()
      const httpCode = (err as { httpCode?: number }).httpCode
      if (httpCode === 413) {
        return res.status(413).json({
          code: 'UPLOAD_TOO_LARGE',
          error: `Your upload is too large. Files must total under ${MAX_UPLOAD_TOTAL_BYTES / (1024 * 1024)} MB, with at most ${MAX_FILES_ABSOLUTE} files per analysis.`,
        })
      }
      console.warn('[DECISION] upload parse failed:', err)
      return res.status(400).json({ error: 'File upload failed. Please try again.' })
    }

    try {
      return await runAnalysis(fields, fileList)
    } finally {
      cleanup()
    }
  })

  async function runAnalysis(
    fields: formidable.Fields,
    fileList: formidable.File[],
  ) {
    const decisionGoal = firstField(fields.decisionGoal).trim().slice(0, MAX_DECISION_GOAL_CHARS)
    if (decisionGoal.length < MIN_DECISION_GOAL_LENGTH) {
      return res.status(400).json({
        error: `Decision goal is required (minimum ${MIN_DECISION_GOAL_LENGTH} characters)`,
      })
    }

    const language = firstField(fields.language).slice(0, 40) || 'English'
    const requestedType = firstField(fields.documentType)
    const documentType = DOCUMENT_TYPES.has(requestedType) ? requestedType : 'auto'

    if (fileList.length === 0) return res.status(400).json({ error: 'No files uploaded' })
    if (fileList.length > MAX_FILES_ABSOLUTE) {
      return res.status(400).json({ error: `Maximum ${MAX_FILES_ABSOLUTE} files allowed per analysis` })
    }

    // ── 3. Plan document limit, before any parsing work ──
    try {
      assertWithinDocumentLimits(ent, { docs: fileList.length, pages: 0 })
    } catch (e) {
      if (e instanceof ApiError) return res.status(e.status).json({ code: e.code, error: e.message })
      throw e
    }

    // Tracks what we charged so a failed analysis can be refunded.
    let charged: { credits: number; docs: number } | null = null

    try {
      const documents: { name: string; content: string }[] = []
      // Every file we could not use is reported back. These used to go only to
      // the server log, so three uploads with two unreadable scans produced a
      // full-confidence report on one document and nothing on screen saying
      // the other two had been dropped.
      const skipped: SkippedDocument[] = []
      let totalPages = 0

      for (const [i, file] of fileList.entries()) {
        const name = (file.originalFilename ?? `Document ${i + 1}`).slice(0, 200)
        try {
          const buffer = await fs.promises.readFile(file.filepath)
          const doc = await extractDocument(name, buffer)
          totalPages += doc.pages
          documents.push({ name, content: doc.text })
        } catch (e) {
          if (e instanceof DocumentReadError) {
            skipped.push({ name, reason: e.message, code: e.code })
          } else {
            console.warn(`[DECISION] could not read "${name}":`, e)
            skipped.push({ name, reason: `"${name}" could not be read.`, code: 'unreadable' })
          }
        }
      }

      if (documents.length === 0) {
        return res.status(400).json({
          code: 'NO_READABLE_DOCUMENTS',
          error: `None of the uploaded files could be read. ${skipped.map(s => s.reason).join(' ')}`.trim(),
          skipped_documents: skipped,
        })
      }

      // ── 4. Plan page limit, from the plan — not from a request header ──
      try {
        assertWithinDocumentLimits(ent, { docs: documents.length, pages: totalPages })
      } catch (e) {
        if (e instanceof ApiError) return res.status(e.status).json({ code: e.code, error: e.message })
        throw e
      }

      // ── 5. Charge before doing the expensive work ──
      // Pages and documents are already known here, so the exact cost can be
      // taken up front. A skipped file is never billed: only what is analysed
      // counts toward pages and documents.
      const cost = computeReportCost(ent.cfg, { pages: totalPages, docs: documents.length })
      try {
        if (ent.isFree) {
          await consumeFreeReport(ent, documents.length)
        } else {
          await chargeCredits(ent, cost, { reports: 1, documents: documents.length })
        }
        charged = { credits: cost, docs: documents.length }
      } catch (e) {
        if (e instanceof ApiError) return res.status(e.status).json({ code: e.code, error: e.message })
        throw e
      }

      // ── 6. Generate, then gate the response to the caller's plan ──
      const { data: raw, usage, truncatedDocuments } = await generateDecisionReport(
        documents,
        language,
        decisionGoal,
        documentType,
      )
      const data = normalizeDecisionReport(raw)
      const gated = applyPlanGating(data, features)

      await recordAiUsage({
        uid: ent.uid,
        plan: ent.plan,
        operation: 'decision',
        model: REPORT_MODEL,
        usage,
        creditsCharged: ent.isFree ? 0 : cost,
        documents: documents.length,
        pages: totalPages,
        truncated: truncatedDocuments.length > 0,
      })

      return res.json({
        data: {
          ...gated,
          pages_analyzed: totalPages,
          documents_analyzed: documents.length,
          // Surfaced in the UI. A contract-review tool must say when it only
          // read part of a document rather than let the user assume otherwise.
          truncated_documents: truncatedDocuments,
          // Surfaced in the UI for the same reason: files that were uploaded
          // but not part of this analysis at all.
          skipped_documents: skipped,
        },
        entitlements: { plan: ent.plan, features, creditsCharged: ent.isFree ? 0 : cost },
      })
    } catch (e) {
      // The analysis failed after we charged for it — give the credits back.
      if (charged) {
        if (ent.isFree) await refundFreeReport(ent, charged.docs)
        else await refundCredits(ent, charged.credits, { reports: 1, documents: charged.docs })
      }
      console.error('[DECISION ERROR]', e)
      if (e instanceof ApiError) return res.status(e.status).json({ code: e.code, error: e.message })
      // A deadline hit is not a broken request — say what happened and confirm
      // the refund, rather than showing the raw SDK message.
      if (isTimeoutError(e)) return res.status(504).json({ code: 'TIMEOUT', error: TIMEOUT_MESSAGE })
      if (e instanceof ModelOutputError) return res.status(502).json({ code: 'MODEL_OUTPUT', error: e.message })
      const message = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e)
      return res.status(500).json({ error: message || 'Decision analysis failed' })
    }
  }
}
