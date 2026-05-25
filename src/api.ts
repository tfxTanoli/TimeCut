import type { AnalyzeResponse } from './types'

export async function analyzeText(content: string, language: string): Promise<AnalyzeResponse> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'text', content, language }),
  })
  return res.json()
}

export async function analyzePdf(file: File, language: string): Promise<AnalyzeResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('language', language)
  const res = await fetch('/api/analyze-pdf', { method: 'POST', body: form })
  return res.json()
}
