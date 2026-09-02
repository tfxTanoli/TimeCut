import type { VercelRequest, VercelResponse } from '@vercel/node'
import formidable from 'formidable'
import fs from 'fs'
import PDFParser from 'pdf2json'
import { generateDecisionReport } from './_lib/shared.js'
import { verifyAuth, ApiError } from './_lib/auth.js'
import { REPORT_MODEL } from './_lib/aiConfig.js'
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
// v2 — updated prompt forces all required fields

/* ── Normalize GPT response to match expected TypeScript types ── */
// GPT-4o sometimes uses snake_case or slightly different key names.
// Normalizing here prevents empty fields in the UI.

/**
 * One node of the JSON the model returned. Its shape is not guaranteed — every
 * field below is read defensively — so `any` is the honest type here rather
 * than a narrower one that would only be a lie. Declared once so the rule is
 * suppressed in a single documented place instead of on every callback.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any
function normalizeReport(raw: Record<string, Raw>): Record<string, Raw> {
  const hiddenRisks = (raw.hidden_risks ?? []).map((r: Raw) => ({
    description: r.description ?? r.risk ?? r.text ?? '',
    severity: r.severity ?? 'Medium',
    reasoning: r.reasoning ?? r.reasons ?? r.explanation ?? [],
  }))

  const missingInfo = (raw.missing_information ?? []).map((m: Raw) => {
    if (typeof m === 'string' && m.trim()) {
      return { title: m.trim(), whyItMatters: '', action: '', evidence: 'Not found' }
    }
    return {
      title: m.title ?? m.name ?? m.item ?? m.topic ?? '',
      whyItMatters: m.whyItMatters ?? m.why_it_matters ?? m.why ?? m.importance ?? m.impact ?? '',
      action: m.action ?? m.recommended_action ?? m.recommendation ?? m.next_step ?? m.steps ?? '',
      evidence: m.evidence ?? m.evidence_status ?? m.status ?? m.availability ?? '',
    }
  })

  const evidenceFound = (raw.evidence_found ?? []).map((e: Raw) => ({
    section: e.section ?? e.area ?? e.topic ?? '',
    page: e.page ?? e.page_number ?? null,
    clause: e.clause ?? e.clause_reference ?? null,
    confidence: e.confidence ?? e.confidence_score ?? null,
    context: e.context ?? e.surrounding_text ?? e.excerpt ?? null,
    document: e.document ?? e.document_name ?? e.source ?? null,
  }))

  // Normalize verification_questions
  const verificationQuestions = (raw.verification_questions ?? []).map((q: Raw) => ({
    question: q.question ?? q.q ?? '',
    strong_answer_should_include: Array.isArray(q.strong_answer_should_include)
      ? q.strong_answer_should_include
      : (Array.isArray(q.strong_answer) ? q.strong_answer : []),
    red_flags: Array.isArray(q.red_flags) ? q.red_flags : [],
    why_it_matters: q.why_it_matters ?? q.why ?? q.importance ?? '',
  })).filter((q: Raw) => q.question)

  // Normalize recommended_actions
  const recommendedActions = (raw.recommended_actions ?? []).map((a: Raw) => ({
    action: a.action ?? a.step ?? a.recommendation ?? '',
    reason: a.reason ?? a.why ?? a.rationale ?? '',
    priority: (['High', 'Medium', 'Low'].includes(a.priority)) ? a.priority : 'Medium',
  })).filter((a: Raw) => a.action)

  // Normalize negotiation_suggestions
  const negotiationSuggestions = (raw.negotiation_suggestions ?? []).map((n: Raw) => ({
    clause: n.clause ?? n.term ?? n.item ?? '',
    issue: n.issue ?? n.problem ?? n.concern ?? '',
    suggested_improvement: n.suggested_improvement ?? n.improvement ?? n.suggestion ?? n.recommended_change ?? '',
    leverage: n.leverage ?? n.leverage_point ?? n.rationale ?? undefined,
  })).filter((n: Raw) => n.clause)

  // Normalize weak_evidence
  const weakEvidence = (raw.weak_evidence ?? []).map((w: Raw) => ({
    claim: w.claim ?? w.statement ?? '',
    issue: w.issue ?? w.problem ?? w.why_weak ?? '',
    recommendation: w.recommendation ?? w.action ?? w.suggestion ?? '',
  })).filter((w: Raw) => w.claim)

  // Normalize decision_playbook.
  // The Playbook is a paid-plan feature, so it must not silently disappear when
  // the model omits a field. Anything missing is derived from the rest of the
  // report — the same approach already used for if_i_were_you and the
  // before-signing checklist.
  const dp = raw.decision_playbook ?? {}
  const playbookReasons = Array.isArray(dp.key_reasons) && dp.key_reasons.length > 0
    ? dp.key_reasons
    : recommendedActions.slice(0, 3).map((a: { reason: string }) => a.reason).filter(Boolean)
  const playbookRisks = Array.isArray(dp.remaining_risks) && dp.remaining_risks.length > 0
    ? dp.remaining_risks
    : hiddenRisks.slice(0, 3).map((r: { description: string }) => r.description).filter(Boolean)
  const playbookChecklist = Array.isArray(dp.action_checklist) && dp.action_checklist.length > 0
    ? dp.action_checklist
    : recommendedActions.map((a: { action: string }) => a.action).filter(Boolean)
  const decisionPlaybook = {
    final_recommendation:
      (dp.final_recommendation ?? dp.recommendation ?? '').trim()
      || (raw.recommendation
        ? (hiddenRisks.length > 0 || missingInfo.length > 0 ? 'Negotiate' : 'Proceed')
        : ''),
    key_reasons: playbookReasons,
    remaining_risks: playbookRisks,
    action_checklist: playbookChecklist,
  }

  // Derive fallbacks for fields GPT sometimes omits
  const score = raw.confidence_score ?? 75

  const ifIWereYou = raw.if_i_were_you?.trim() ||
    (raw.recommendation
      ? `I would ${raw.ranking?.[0]?.name ? `choose ${raw.ranking[0].name}` : 'proceed with the top-ranked option'} based on the evidence available. ${raw.decision_defense ?? raw.recommendation ?? ''}`.trim()
      : '')

  const whatWouldChange = raw.what_would_change?.trim() ||
    (hiddenRisks.length > 0
      ? `This recommendation would change if the identified risks are resolved — particularly: ${hiddenRisks[0]?.description ?? ''}. Provide additional documentation that addresses missing information items before proceeding.`
      : 'This recommendation would change if new evidence emerges that contradicts the current findings or if significant risks are discovered in additional documentation.')

  const beforeSigningChecklist: string[] = Array.isArray(raw.before_signing_checklist) && raw.before_signing_checklist.length > 0
    ? raw.before_signing_checklist
    : [
        ...missingInfo.slice(0, 3).map((m: Raw) => `Obtain and verify: ${m.title}`),
        'Confirm all key terms in writing before proceeding',
        'Resolve all identified missing information before signing or deciding',
      ].filter(Boolean)

  const comparedCategories: string[] = Array.isArray(raw.compared_categories) && raw.compared_categories.length > 0
    ? raw.compared_categories
    : evidenceFound.map((e: Raw) => e.section).filter(Boolean).slice(0, 6)

  const confidenceBreakdown = raw.confidence_breakdown ?? {
    document_completeness: Math.min(100, score + 5),
    evidence_consistency: Math.min(100, score),
    risk_severity: Math.max(0, 100 - (hiddenRisks.filter((r: Raw) => r.severity === 'High').length * 20)),
    missing_information: Math.max(0, 100 - (missingInfo.length * 15)),
  }

  return {
    ...raw,
    hidden_risks: hiddenRisks,
    missing_information: missingInfo,
    evidence_found: evidenceFound,
    if_i_were_you: ifIWereYou,
    what_would_change: whatWouldChange,
    before_signing_checklist: beforeSigningChecklist,
    compared_categories: comparedCategories,
    confidence_breakdown: confidenceBreakdown,
    verification_questions: verificationQuestions,
    recommended_actions: recommendedActions,
    negotiation_suggestions: negotiationSuggestions,
    weak_evidence: weakEvidence,
    decision_playbook: decisionPlaybook,
    interview_red_flags: Array.isArray(raw.interview_red_flags) ? raw.interview_red_flags : [],
  }
}

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

function extractPDFText(buffer: Buffer): Promise<{ text: string; pages: number }> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, true)
    parser.on('pdfParser_dataReady', () => {
      const pdfData = parser.getRawTextContent()
      const pageBreaks = (pdfData.match(/-+Page \(\d+\) Break-+/g) ?? []).length
      const text = pdfData.replace(/-+Page \(\d+\) Break-+/g, '').trim()
      resolve({ text, pages: Math.max(pageBreaks, 1) })
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
    if (!decisionGoal || decisionGoal.trim().length < 5) {
      return res.status(400).json({ error: 'Decision goal is required (minimum 5 characters)' })
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
            const { text, pages } = await extractPDFText(buffer)
            if (text.length < 50) {
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
      const data = normalizeReport(raw)
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
      const message = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e)
      return res.status(500).json({ error: message || 'Decision analysis failed' })
    }
  })
}
