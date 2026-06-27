import type { VercelRequest, VercelResponse } from '@vercel/node'
import formidable from 'formidable'
import fs from 'fs'
import PDFParser from 'pdf2json'
import { generateDecisionReport } from './_lib/shared.js'
// v2 — updated prompt forces all required fields

/* ── Normalize GPT response to match expected TypeScript types ── */
// GPT-4o sometimes uses snake_case or slightly different key names.
// Normalizing here prevents empty fields in the UI.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeReport(raw: Record<string, any>): Record<string, any> {
  const hiddenRisks = (raw.hidden_risks ?? []).map((r: any) => ({
    description: r.description ?? r.risk ?? r.text ?? '',
    severity: r.severity ?? 'Medium',
    reasoning: r.reasoning ?? r.reasons ?? r.explanation ?? [],
  }))

  const missingInfo = (raw.missing_information ?? []).map((m: any) => {
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

  const evidenceFound = (raw.evidence_found ?? []).map((e: any) => ({
    section: e.section ?? e.area ?? e.topic ?? '',
    page: e.page ?? e.page_number ?? null,
    clause: e.clause ?? e.clause_reference ?? null,
    confidence: e.confidence ?? e.confidence_score ?? null,
    context: e.context ?? e.surrounding_text ?? e.excerpt ?? null,
    document: e.document ?? e.document_name ?? e.source ?? null,
  }))

  // Derive fallbacks for fields GPT sometimes omits
  const score = raw.confidence_score ?? 75

  const ifIWereYou = raw.if_i_were_you?.trim() ||
    (raw.recommendation
      ? `I would ${raw.ranking?.[0]?.name ? `choose ${raw.ranking[0].name}` : 'proceed with the top-ranked option'} based on the evidence available. ${raw.decision_defense ?? raw.recommendation ?? ''}`.trim()
      : '')

  const whatWouldChange = raw.what_would_change?.trim() ||
    (hiddenRisks.length > 0
      ? `This recommendation would change if the identified risks are resolved — particularly: ${hiddenRisks[0]?.description ?? ''}. Provide additional documentation that addresses missing information items before signing.`
      : 'This recommendation would change if new evidence emerges that contradicts the current findings or if significant risks are discovered in additional documentation.')

  const beforeSigningChecklist: string[] = Array.isArray(raw.before_signing_checklist) && raw.before_signing_checklist.length > 0
    ? raw.before_signing_checklist
    : [
        ...missingInfo.slice(0, 3).map((m: any) => `Obtain and verify: ${m.title}`),
        'Confirm all pricing and payment terms in writing',
        'Review and sign only after all missing information is resolved',
      ].filter(Boolean)

  const comparedCategories: string[] = Array.isArray(raw.compared_categories) && raw.compared_categories.length > 0
    ? raw.compared_categories
    : evidenceFound.map((e: any) => e.section).filter(Boolean).slice(0, 6)

  const confidenceBreakdown = raw.confidence_breakdown ?? {
    document_completeness: Math.min(100, score + 5),
    evidence_consistency: Math.min(100, score),
    risk_severity: Math.max(0, 100 - (hiddenRisks.filter((r: any) => r.severity === 'High').length * 20)),
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
  }
}

const MAX_FILES = 10
const MAX_FILE_SIZE_MB = 10

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

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

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

    // Normalise files[] — formidable returns array or single object
    const rawFiles = files['files[]'] ?? files.files ?? []
    const fileList = Array.isArray(rawFiles) ? rawFiles : [rawFiles]

    if (fileList.length === 0) return res.status(400).json({ error: 'No files uploaded' })
    if (fileList.length > MAX_FILES) {
      return res.status(400).json({ error: `Maximum ${MAX_FILES} files allowed per analysis` })
    }

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

      // Page limit check — header passed by frontend (plan-based)
      const pageLimitRaw = req.headers['x-page-limit']
      const pageLimit = parseInt(
        Array.isArray(pageLimitRaw) ? pageLimitRaw[0] : (pageLimitRaw ?? '999999'),
        10,
      ) || 999999
      if (totalPages > pageLimit) {
        return res.status(400).json({
          error: `Total pages (${totalPages}) exceeds your plan limit (${pageLimit} pages). Please upgrade or reduce the number of documents.`,
        })
      }

      const raw = await generateDecisionReport(documents, language, decisionGoal.trim())
      const data = normalizeReport(raw as Record<string, unknown>)
      return res.json({ data: { ...data, pages_analyzed: totalPages } })
    } catch (e) {
      console.error('[DECISION ERROR]', e)
      const message = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e)
      return res.status(500).json({ error: message || 'Decision analysis failed' })
    }
  })
}
