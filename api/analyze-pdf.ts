import type { VercelRequest, VercelResponse } from '@vercel/node'
import formidable from 'formidable'
import fs from 'fs'
import PDFParser from 'pdf2json'
import { generateReport } from './_lib/shared.js'
import { verifyAuth, ApiError } from './_lib/auth.js'
import { REPORT_MODEL } from './_lib/aiConfig.js'
import { recordAiUsage } from './_lib/aiUsage.js'
import {
  resolveEntitlement,
  chargeCredits,
  refundCredits,
  consumeFreeReport,
  refundFreeReport,
  computeReportCost,
  type Entitlement,
} from './_lib/entitlements.js'

function extractPDFText(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, true)
    parser.on('pdfParser_dataReady', () => resolve(parser.getRawTextContent()))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parser.on('pdfParser_dataError', (errData: any) => {
      const raw = errData?.parserError ?? errData
      reject(new Error(typeof raw === 'string' ? raw : String(raw)))
    })
    parser.parseBuffer(buffer)
  })
}

export const config = { api: { bodyParser: false } }

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  const form = formidable({ maxFileSize: 10 * 1024 * 1024 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form.parse(req as any, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: 'File upload failed' })

    const file = Array.isArray(files.file) ? files.file[0] : files.file
    if (!file) return res.status(400).json({ error: 'No PDF uploaded' })

    const language =
      (Array.isArray(fields.language) ? fields.language[0] : fields.language) ?? 'English'

    // Content analysis has no page count, so it costs the base report price.
    const cost = computeReportCost(ent.cfg, { pages: 0, docs: 1 })
    let charged = false

    try {
      const buffer = fs.readFileSync(file.filepath)
      const text = await extractPDFText(buffer)
      const meaningful = text.replace(/-+Page \(\d+\) Break-+/g, '').trim()
      if (meaningful.length < 50) {
        throw new Error('This PDF has no extractable text (likely scanned/image-based). Please upload a PDF with selectable text.')
      }

      // Charge only once we know the file is actually analysable.
      try {
        if (ent.isFree) await consumeFreeReport(ent, 1)
        else await chargeCredits(ent, cost, { reports: 1, documents: 1 })
        charged = true
      } catch (e) {
        if (e instanceof ApiError) return res.status(e.status).json({ code: e.code, error: e.message })
        throw e
      }

      const { data, usage, truncated } = await generateReport(text, language)
      await recordAiUsage({
        uid: ent.uid,
        plan: ent.plan,
        operation: 'content',
        model: REPORT_MODEL,
        usage,
        creditsCharged: ent.isFree ? 0 : cost,
        documents: 1,
        truncated,
      })
      return res.json({ data: { ...data, content_truncated: truncated } })
    } catch (e) {
      if (charged) {
        if (ent.isFree) await refundFreeReport(ent, 1)
        else await refundCredits(ent, cost, { reports: 1, documents: 1 })
      }
      console.error('[PDF ERROR]', e)
      return res.status(500).json({ error: e instanceof Error ? e.message : 'PDF analysis failed' })
    }
  })
}
