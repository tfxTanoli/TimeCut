import type { VercelRequest, VercelResponse } from '@vercel/node'
import formidable from 'formidable'
import fs from 'fs'
import PDFParser from 'pdf2json'
import { generateDecisionReport } from './_lib/shared.js'

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

      const data = await generateDecisionReport(documents, language, decisionGoal.trim())
      return res.json({ data: { ...(data as object), pages_analyzed: totalPages } })
    } catch (e) {
      console.error('[DECISION ERROR]', e)
      const message = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e)
      return res.status(500).json({ error: message || 'Decision analysis failed' })
    }
  })
}
