import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'

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

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: CHALLENGE_SYSTEM },
        {
          role: 'user',
          content: `Decision Goal: ${decisionGoal ?? 'Not specified'}\n\nReport Data:\n${reportContext}\n\nUser Question: ${question}`,
        },
      ],
      max_tokens: 600,
    })

    const answer = completion.choices[0]?.message?.content ?? 'Unable to generate a response.'
    return res.json({ answer })
  } catch (e) {
    console.error('[CHALLENGE-AI ERROR]', e)
    const message = e instanceof Error ? e.message : 'Challenge AI failed'
    return res.status(500).json({ error: message })
  }
}
