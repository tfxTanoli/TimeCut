import 'dotenv/config'
import { createRequire } from 'module'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import OpenAI from 'openai'

const _require = createRequire(import.meta.url)
const pdfParse = _require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>

const SYSTEM_PROMPT = `You are the Time Intelligence Engine for "Time Cut" — a tool that helps users decide whether content is truly worth their time.

Analyze the content and return an honest, specific, direct JSON report.

OUTPUT FORMAT (JSON ONLY — no markdown, no extra keys):
{
  "verdict": "MUST READ" | "SKIM ONLY" | "SKIP IT",
  "verdict_description": "One clear sentence explaining the verdict",
  "overall_value_score": <number 0.0–10.0>,
  "time_saved_minutes": <integer — estimated minutes the user can safely skip>,
  "value_score": <number 0.0–10.0, based on information density and originality>,
  "attention_quality": "High" | "Medium" | "Low",
  "attention_quality_description": "One sentence describing the quality of attention this content deserves",
  "what_this_is_about": "2–3 sentences describing what the content actually covers",
  "key_insights": ["insight 1", "insight 2", "insight 3", "insight 4"],
  "what_to_skip": ["element to skip 1", "element to skip 2", "element to skip 3"],
  "best_for": ["audience type 1", "audience type 2", "audience type 3"],
  "final_decision": "2–3 sentences with a clear, actionable final recommendation"
}

SCORING GUIDE:
- "MUST READ" → overall_value_score 8–10: highly original, valuable, worth full attention
- "SKIM ONLY" → overall_value_score 4–7.9: some value but significant filler or repetition
- "SKIP IT"   → overall_value_score 0–3.9: low value, repetitive, or misleading

Generate ALL text fields in the user's selected language.`

const app = express()
app.use(cors())

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function generateReport(content: string, language: string) {
  const truncated = content.slice(0, 15000)
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Language: ${language}\n\nContent to analyze:\n${truncated}` },
    ],
  })
  const raw = completion.choices[0]?.message?.content ?? '{}'
  return JSON.parse(raw)
}

// Text or URL analysis
app.post('/api/analyze', express.json(), async (req, res) => {
  const { type, content, url, language = 'English' } = req.body
  try {
    let textContent: string
    if (type === 'url') {
      if (!url?.trim()) { res.status(400).json({ error: 'url is required' }); return }
      const resp = await fetch(`https://r.jina.ai/${url}`, { headers: { Accept: 'text/plain' } })
      if (!resp.ok) throw new Error(`Could not fetch article (${resp.status})`)
      textContent = await resp.text()
    } else {
      if (!content?.trim()) { res.status(400).json({ error: 'content is required' }); return }
      textContent = content
    }
    const data = await generateReport(textContent, language)
    res.json({ data })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Analysis failed' })
  }
})

// PDF analysis
app.post('/api/analyze-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'No PDF file uploaded' }); return }
    const pdfData = await pdfParse(req.file.buffer)
    if (!pdfData.text?.trim()) throw new Error('Could not extract text from PDF')
    const language = req.body.language || 'English'
    const data = await generateReport(pdfData.text, language)
    res.json({ data })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'PDF parsing failed' })
  }
})

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => console.log(`Time Cut server running on http://localhost:${PORT}`))
