import type { VercelRequest, VercelResponse } from '@vercel/node'
import formidable from 'formidable'
import fs from 'fs'
import PDFParser from 'pdf2json'
import { generateReport } from './_lib/shared.js'

function extractPDFText(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, true)
    parser.on('pdfParser_dataReady', () => resolve(parser.getRawTextContent()))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parser.on('pdfParser_dataError', (err: any) => reject(err.parserError ?? err))
    parser.parseBuffer(buffer)
  })
}

export const config = { api: { bodyParser: false } }

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const form = formidable({ maxFileSize: 10 * 1024 * 1024 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form.parse(req as any, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: 'File upload failed' })

    const file = Array.isArray(files.file) ? files.file[0] : files.file
    if (!file) return res.status(400).json({ error: 'No PDF uploaded' })

    const language =
      (Array.isArray(fields.language) ? fields.language[0] : fields.language) ?? 'English'

    try {
      const buffer = fs.readFileSync(file.filepath)
      const text = await extractPDFText(buffer)
      const meaningful = text.replace(/-+Page \(\d+\) Break-+/g, '').trim()
      if (meaningful.length < 50) {
        throw new Error('This PDF has no extractable text (likely scanned/image-based). Please upload a PDF with selectable text.')
      }
      const data = await generateReport(text, language)
      return res.json({ data })
    } catch (e) {
      console.error('[PDF ERROR]', e)
      return res.status(500).json({ error: e instanceof Error ? e.message : 'PDF analysis failed' })
    }
  })
}
