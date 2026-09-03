import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import { verifyAuth, ApiError } from './_lib/auth.js'
import { resolveEntitlement, chargeAssistantQuestion, refundCredits } from './_lib/entitlements.js'
import {
  ASSISTANT_MODEL,
  MAX_ASSISTANT_CONTEXT_CHARS,
  ASSISTANT_TIMEOUT_MS,
  OPENAI_MAX_RETRIES,
  readUsage,
} from './_lib/aiConfig.js'
import { recordAiUsage } from './_lib/aiUsage.js'

const CHALLENGE_SYSTEM = `You are an AI Decision Reviewer assistant for TimeCut.
A user has received an AI-generated decision analysis report and wants to challenge or question a specific aspect of it.

Your role:
- Answer the user's question based ONLY on evidence and data in the provided report context
- Be direct, honest, and transparent about your reasoning
- Reference specific findings, risks, or evidence from the report when answering
- If asked for supporting or opposing evidence, give a balanced response
- Acknowledge uncertainty when the report lacks data to answer fully
- Keep responses concise (3-5 sentences typically)

Never fabricate information not found in the report.`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { question, reportContext, decisionGoal } = req.body as {
    question?: string
    reportContext?: string
    decisionGoal?: string
  }

  if (!question || !reportContext) {
    return res.status(400).json({ error: 'question and reportContext are required' })
  }

  // The browser already trims this before sending, but it must not be the only
  // thing deciding how much we pay OpenAI — same reasoning that puts credit
  // enforcement on the server. Every other model input is capped; this was the
  // one that was not.
  const boundedContext = reportContext.slice(0, MAX_ASSISTANT_CONTEXT_CHARS)

  // Signed-in callers only — the Decision Assistant quota is per account, and
  // an unauthenticated endpoint could be called indefinitely at our cost.
  const authed = await verifyAuth(req)
  if (!authed) {
    return res.status(401).json({
      code: 'UNAUTHENTICATED',
      error: 'Please sign in to use the Decision Assistant.',
    })
  }

  const ent = await resolveEntitlement(authed.uid)

  // Charge (or count against the free quota) before answering. Free plans have
  // a fixed monthly question allowance; paid plans pay from AI Credits.
  try {
    await chargeAssistantQuestion(ent)
  } catch (e) {
    if (e instanceof ApiError) return res.status(e.status).json({ code: e.code, error: e.message })
    throw e
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const completion = await openai.chat.completions.create({
      model: ASSISTANT_MODEL,
      messages: [
        { role: 'system', content: CHALLENGE_SYSTEM },
        {
          role: 'user',
          content: `Decision Goal: ${decisionGoal ?? 'Not specified'}\n\nReport Data:\n${boundedContext}\n\nUser Question: ${question}`,
        },
      ],
      max_tokens: 600,
    }, { timeout: ASSISTANT_TIMEOUT_MS, maxRetries: OPENAI_MAX_RETRIES })

    const answer = completion.choices[0]?.message?.content ?? 'Unable to generate a response.'
    await recordAiUsage({
      uid: ent.uid,
      plan: ent.plan,
      operation: 'assistant',
      model: ASSISTANT_MODEL,
      usage: readUsage(completion),
      creditsCharged: ent.isFree ? 0 : ent.cfg.creditCosts.assistantQuestion,
      truncated: reportContext.length > MAX_ASSISTANT_CONTEXT_CHARS,
    })
    return res.json({ answer })
  } catch (e) {
    // The answer never arrived — don't keep the credit we took for it.
    await refundCredits(ent, ent.isFree ? 0 : ent.cfg.creditCosts.assistantQuestion, { assistant: 1 })
    console.error('[CHALLENGE-AI ERROR]', e)
    const message = e instanceof Error ? e.message : 'Challenge AI failed'
    return res.status(500).json({ error: message })
  }
}
