import type { AnalyzeResponse, DecisionAnalyzeResponse, ChallengeAIResponse } from './types'
import { authHeaders } from './lib/firebase'

// Every metered endpoint is authenticated: the server reads the account from
// the Firebase ID token and enforces plan limits and AI Credit charges itself.
// The client no longer sends limits or uids — they cannot be trusted, and are
// no longer believed by the API.

export async function analyzeText(content: string, language: string): Promise<AnalyzeResponse> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ type: 'text', content, language }),
  })
  return res.json()
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
  return res.json()
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
  return res.json()
}

export async function challengeAI(
  question: string,
  reportContext: string,
  decisionGoal: string,
): Promise<ChallengeAIResponse> {
  const res = await fetch('/api/challenge-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ question, reportContext, decisionGoal }),
  })
  return res.json()
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
  return res.json()
}
