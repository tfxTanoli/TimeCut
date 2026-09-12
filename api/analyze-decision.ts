import type { VercelRequest, VercelResponse } from '@vercel/node'
import formidable from 'formidable'
import fs from 'fs'
import PDFParser from 'pdf2json'
import { generateDecisionReport, normalizeDecisionReport } from './_lib/shared.js'
import { verifyAuth, ApiError } from './_lib/auth.js'
import { REPORT_MODEL, isTimeoutError, TIMEOUT_MESSAGE, toPageMarkedText } from './_lib/aiConfig.js'
import { recordAiUsage } from './_lib/aiUsage.js'
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


// Hard ceiling on what the endpoint will ever accept, independent of plan.
// The real, plan-specific document limit is enforced by
// assertWithinDocumentLimits() below using the caller's verified plan.
const MAX_FILES_ABSOLUTE = 10
const MAX_FILE_SIZE_MB = 10

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

/**
 * Extract a PDF as page-marked text.
 *
 * The page breaks pdf2json emits used to be counted for billing and then
 * stripped, which left the model with no way to know where one page ended and
 * the next began — while the report schema still asked it for a "page" per
 * piece of evidence, so it supplied invented ones. toPageMarkedText keeps them
 * as citable `[PAGE n]` headers; `pages` is still the break count, so what a
 * report costs does not change.
 */
function extractPDFText(buffer: Buffer): Promise<{ text: string; pages: number; contentChars: number }> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, true)
    parser.on('pdfParser_dataReady', () => {
      resolve(toPageMarkedText(parser.getRawTextContent()))
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parser.on('pdfParser_dataError', (errData: any) => {
      // pdf2json emits { parserError: string } — not an Error instance
      const raw = errData?.parserError ?? errData
      reject(new Error(typeof raw === 'string' ? raw : String(raw)))
    })
    parser.parseBuffer(buffer)
  })
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
    maxFileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
    multiples: true,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form.parse(req as any, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: 'File upload failed' })

    const decisionGoal =
      (Array.isArray(fields.decisionGoal) ? fields.decisionGoal[0] : fields.decisionGoal) ?? ''
    if (!decisionGoal || decisionGoal.trim().length < MIN_DECISION_GOAL_LENGTH) {
      return res.status(400).json({
        error: `Decision goal is required (minimum ${MIN_DECISION_GOAL_LENGTH} characters)`,
      })
    }

    const language =
      (Array.isArray(fields.language) ? fields.language[0] : fields.language) ?? 'English'

    const documentType =
      (Array.isArray(fields.documentType) ? fields.documentType[0] : fields.documentType) ?? 'auto'

    // Normalise files[] — formidable returns array or single object
    const rawFiles = files['files[]'] ?? files.files ?? []
    const fileList = Array.isArray(rawFiles) ? rawFiles : [rawFiles]

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
      const parseErrors: string[] = []
      let totalPages = 0

      for (const file of fileList) {
        const buffer = fs.readFileSync(file.filepath)
        const mimeType = file.mimetype ?? ''
        const originalName = file.originalFilename ?? `Document ${documents.length + 1}`

        if (mimeType === 'application/pdf' || originalName.toLowerCase().endsWith('.pdf')) {
          try {
            const { text, pages, contentChars } = await extractPDFText(buffer)
            // Measured without the [PAGE n] markers, so a scanned PDF whose
            // only output is page headers is still recognised as empty.
            if (contentChars < 50) {
              parseErrors.push(`"${originalName}" has no extractable text — it may be a scanned/image-based PDF.`)
              continue
            }
            totalPages += pages
            documents.push({ name: originalName, content: text })
          } catch (pdfErr) {
            const msg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr)
            console.warn(`[DECISION] PDF parse failed for "${originalName}":`, msg)
            parseErrors.push(`"${originalName}" could not be parsed: ${msg}`)
            continue
          }
        } else {
          const text = buffer.toString('utf-8').trim()
          if (text.length < 20) {
            parseErrors.push(`"${originalName}" appears to be empty.`)
            continue
          }
          const estimatedPages = Math.ceil(text.length / 3000)
          totalPages += estimatedPages
          documents.push({ name: originalName, content: text })
        }
      }

      if (documents.length === 0) {
        const detail = parseErrors.length ? ` ${parseErrors.join(' ')}` : ''
        return res.status(400).json({ error: `None of the uploaded files could be read.${detail}` })
      }

      if (parseErrors.length) {
        console.warn(`[DECISION] ${parseErrors.length} file(s) skipped:`, parseErrors)
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
      // taken up front. A user can no longer overrun their allowance, and we
      // never pay OpenAI for an analysis the plan cannot cover.
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
        decisionGoal.trim(),
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
      const message = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e)
      return res.status(500).json({ error: message || 'Decision analysis failed' })
    }
  })
}
