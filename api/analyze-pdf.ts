import type { VercelRequest, VercelResponse } from '@vercel/node'
import formidable from 'formidable'
import fs from 'fs'
import { generateReport } from './_lib/shared.js'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string }>

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
      const { text } = await pdfParse(buffer)
      if (!text?.trim()) throw new Error('Could not extract text from PDF')
      const data = await generateReport(text, language)
      return res.json({ data })
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : 'PDF analysis failed' })
    }
  })
}
