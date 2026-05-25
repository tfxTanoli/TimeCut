import type { VercelRequest, VercelResponse } from '@vercel/node'
import { generateReport } from './_lib/shared.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { content, language = 'English' } = req.body ?? {}
  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'content is required' })
  }

  try {
    const data = await generateReport(content, language as string)
    return res.json({ data })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Analysis failed' })
  }
}
