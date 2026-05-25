import OpenAI from 'openai'

const SYSTEM_PROMPT = `You are the Time Intelligence Engine for "Time Cut", a tool that helps users decide whether content is truly worth their time.

Analyze the content and return an honest, specific, direct JSON report.

OUTPUT FORMAT (JSON ONLY, no markdown, no extra keys):
{
  "verdict": "MUST READ" | "SKIM ONLY" | "SKIP IT",
  "verdict_description": "One clear sentence explaining the verdict",
  "overall_value_score": <number 0.0 to 10.0>,
  "time_saved_minutes": <integer, estimated minutes the user can safely skip>,
  "value_score": <number 0.0 to 10.0, based on information density and originality>,
  "attention_quality": "High" | "Medium" | "Low",
  "attention_quality_description": "One sentence describing the quality of attention this content deserves",
  "what_this_is_about": "2 to 3 sentences describing what the content actually covers",
  "key_insights": ["insight 1", "insight 2", "insight 3", "insight 4"],
  "what_to_skip": ["element to skip 1", "element to skip 2", "element to skip 3"],
  "best_for": ["audience type 1", "audience type 2", "audience type 3"],
  "final_decision": "2 to 3 sentences with a clear, actionable final recommendation"
}

SCORING GUIDE:
- "MUST READ": overall_value_score 8 to 10, highly original, valuable, worth full attention
- "SKIM ONLY": overall_value_score 4 to 7.9, some value but significant filler or repetition
- "SKIP IT": overall_value_score 0 to 3.9, low value, repetitive, or misleading

Generate ALL text fields in the user's selected language.`

export async function generateReport(content: string, language: string) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
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
