import type { AnalyzeResponse, DecisionAnalyzeResponse, ChallengeAIResponse } from './types'
import { authHeaders } from './lib/firebase'

// Every metered endpoint is authenticated: the server reads the account from
// the Firebase ID token and enforces plan limits and AI Credit charges itself.
// The client no longer sends limits or uids — they cannot be trusted, and are
// no longer believed by the API.

/**
 * Read an API response as JSON without ever throwing on its shape.
 *
 * `res.json()` rejects whenever the body is not JSON — which is exactly what
 * the platform returns when a request never reaches our code (Vercel's 413 for
 * an oversized upload, a 502/504 gateway page). Every caller used to catch
 * that as a generic "network error", hiding the real, fixable cause.
 */
async function readJson<T extends { error?: string; code?: string }>(res: Response): Promise<T> {
  const text = await res.text().catch(() => '')
  if (text) {
    try {
      return JSON.parse(text) as T
    } catch {
      // not JSON — fall through
    }
  }
  if (res.status === 413) {
    return { code: 'UPLOAD_TOO_LARGE', error: 'Your upload is too large. Files must total under 4 MB per analysis.' } as T
  }
  if (res.status === 504) {
    return { code: 'TIMEOUT', error: 'The request took too long. Please try again.' } as T
  }
  return { code: `HTTP_${res.status}`, error: `The server could not complete the request (${res.status}). Please try again.` } as T
}

export async function analyzeText(content: string, language: string): Promise<AnalyzeResponse> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ type: 'text', content, language }),
  })
  return readJson<AnalyzeResponse>(res)
}

export async function analyzePdf(file: File, language: string): Promise<AnalyzeResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('language', language)
  const res = await fetch('/api/analyze-pdf', {
    method: 'POST',
    headers: await authHeaders(),
    body: form,
  })
  return readJson<AnalyzeResponse>(res)
}

export async function analyzeDecision(
  files: File[],
  decisionGoal: string,
  language: string,
  documentType: string = 'auto',
): Promise<DecisionAnalyzeResponse> {
  const form = new FormData()
  files.forEach(f => form.append('files[]', f))
  form.append('decisionGoal', decisionGoal)
  form.append('language', language)
  form.append('documentType', documentType)
  const res = await fetch('/api/analyze-decision', {
    method: 'POST',
    headers: await authHeaders(),
    body: form,
  })
  return readJson<DecisionAnalyzeResponse>(res)
}

/**
 * Ask the Decision Assistant about a report. `reportId`, when the report has
 * been saved, lets the server read the report from the account instead of
 * trusting the context the browser sends.
 */
export async function challengeAI(
  question: string,
  reportContext: string,
  decisionGoal: string,
  reportId?: string | null,
): Promise<ChallengeAIResponse> {
  const res = await fetch('/api/challenge-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ question, reportContext, decisionGoal, ...(reportId ? { reportId } : {}) }),
  })
  return readJson<ChallengeAIResponse>(res)
}

/**
 * Open the Stripe Billing Portal so the customer can cancel, change their card
 * or download invoices. Returns the URL to redirect to.
 */
export async function createBillingPortalSession(): Promise<{ url?: string; error?: string }> {
  const res = await fetch('/api/billing-portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
  })
  return readJson<{ url?: string; error?: string; code?: string }>(res)
}
