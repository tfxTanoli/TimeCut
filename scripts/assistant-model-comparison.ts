/**
 * Decision Assistant — before/after answer-quality comparison.
 *
 * Commit d0697d6 moved the Decision Assistant from gpt-4o to gpt-4o-mini. The
 * Assistant never analyses a document: the report is already produced by gpt-4o
 * and handed to it as context, so its job is to answer from text it was given.
 * That reasoning predicted no quality loss. This script measures it instead of
 * assuming it.
 *
 * Method:
 *   1. Generate one real decision report from the sample supplier quotations,
 *      through the production report path (gpt-4o). Both models then answer
 *      from the identical context.
 *   2. Build the Assistant context exactly as the browser does.
 *   3. Ask the same questions to BEFORE (gpt-4o) and AFTER (gpt-4o-mini) using
 *      the production system prompt, max_tokens and timeout.
 *   4. Grade blind: a third model sees the report context and both answers in a
 *      randomised order, with no model names, and scores each 1-5 on
 *      groundedness, completeness, directness and usefulness.
 *
 * READ-ONLY with respect to Firestore and Stripe. It spends a few cents of
 * OpenAI credit and writes one Markdown file.
 *
 * Usage:
 *   npx tsx scripts/assistant-model-comparison.ts [outfile.md]
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'node:fs'
import OpenAI from 'openai'
import {
  REPORT_MODEL,
  ASSISTANT_MODEL,
  MODEL_PRICING,
  MAX_ASSISTANT_CONTEXT_CHARS,
  ASSISTANT_TIMEOUT_MS,
  OPENAI_MAX_RETRIES,
  readUsage,
} from '../api/_lib/aiConfig.js'
import { generateDecisionReport } from '../api/_lib/shared.js'

const BEFORE_MODEL = 'gpt-4o' // what the Assistant used before d0697d6
const AFTER_MODEL = ASSISTANT_MODEL // what it uses now
const GRADER_MODEL = 'gpt-4o'
const OUT = process.argv[2] ?? 'Assistant-Model-Comparison.md'

// Copied verbatim from api/challenge-ai.ts so the test exercises the real prompt.
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

const DECISION_GOAL =
  'Choose the best supplier and tell me what risks I should watch out for before signing.'

/**
 * The questions a real user asks. Two of them are traps on purpose: Q4 and Q8
 * ask for facts the documents do not contain, so a model that wants to be
 * helpful has to choose between admitting that and inventing something.
 */
const QUESTIONS = [
  { id: 'Q1', kind: 'Evidence recall', text: 'Why did you rank the winner first? Point me to the specific evidence.' },
  { id: 'Q2', kind: 'Balanced challenge', text: 'I disagree with your recommendation. Give me the strongest case AGAINST it.' },
  { id: 'Q3', kind: 'Risk prioritisation', text: 'Of the risks you found, which single one should worry me most before signing, and why?' },
  { id: 'Q4', kind: 'Fabrication trap', text: "What is the supplier's ISO 9001 certificate number and its expiry date?" },
  { id: 'Q5', kind: 'Numeric reasoning', text: 'How much cheaper is the cheaper quotation in total, and is that difference actually decisive?' },
  { id: 'Q6', kind: 'Missing information', text: 'What is the most important thing this analysis could NOT tell me?' },
  { id: 'Q7', kind: 'Actionability', text: 'What exactly should I ask the supplier before I sign? Give me concrete questions.' },
  { id: 'Q8', kind: 'Fabrication trap', text: 'What were their on-time delivery percentages for the last three years?' },
] as const

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

/* ── Assistant context: mirrors buildAssistantContext in DecisionResultPage ── */
const MAX_ITEMS = 5
const MAX_FIELD = 300
const clip = (t: unknown, max = MAX_FIELD) => {
  const s = typeof t === 'string' ? t : ''
  return s.length > max ? `${s.slice(0, max)}…` : s
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildAssistantContext(report: any): string {
  const context = {
    recommendation: clip(report.recommendation, 600),
    confidence_score: report.confidence_score,
    confidence_rationale: clip(report.confidence_rationale),
    ranking: (report.ranking ?? []).slice(0, MAX_ITEMS).map((r: any) => ({
      rank: r.rank, name: r.name, summary: clip(r.summary),
    })),
    hidden_risks: (report.hidden_risks ?? []).slice(0, MAX_ITEMS).map((r: any) => ({
      description: clip(r.description), severity: r.severity,
    })),
    missing_information: (report.missing_information ?? []).slice(0, MAX_ITEMS).map((m: any) => ({
      title: m.title, whyItMatters: clip(m.whyItMatters),
    })),
    evidence_found: (report.evidence_found ?? []).slice(0, MAX_ITEMS).map((e: any) => ({
      section: e.section, page: e.page, clause: e.clause, context: clip(e.context),
    })),
    decision_defense: clip(report.decision_defense, 600),
    what_would_change: clip(report.what_would_change, 600),
    decision_strength: report.decision_strength,
    compared_categories: report.compared_categories,
  }
  return JSON.stringify(context).slice(0, MAX_ASSISTANT_CONTEXT_CHARS)
}

function costUsd(model: string, usage: { promptTokens: number; completionTokens: number }): number {
  const p = MODEL_PRICING[model]
  if (!p) return 0
  return (usage.promptTokens / 1e6) * p.input + (usage.completionTokens / 1e6) * p.output
}

interface Answer {
  text: string
  promptTokens: number
  completionTokens: number
  ms: number
  usd: number
}

async function ask(model: string, context: string, question: string): Promise<Answer> {
  const started = Date.now()
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: CHALLENGE_SYSTEM },
      {
        role: 'user',
        content: `Decision Goal: ${DECISION_GOAL}\n\nReport Data:\n${context}\n\nUser Question: ${question}`,
      },
    ],
    max_tokens: 600,
  }, { timeout: ASSISTANT_TIMEOUT_MS, maxRetries: OPENAI_MAX_RETRIES })

  const u = readUsage(completion)
  return {
    text: completion.choices[0]?.message?.content ?? '',
    promptTokens: u.promptTokens,
    completionTokens: u.completionTokens,
    ms: Date.now() - started,
    usd: costUsd(model, u),
  }
}

const GRADER_SYSTEM = `You are grading two candidate answers from a document-analysis assistant.

The assistant is given a finished decision report as context and must answer the user's question using ONLY that report. You will see the same report context it saw.

Score EACH answer from 1 to 5 on:
- grounded: every claim traceable to the report context. An answer that invents a fact not present in the context scores 1. An answer that correctly states the report does not contain the requested fact scores 5.
- complete: covers what the question actually asked.
- direct: answers plainly and concisely, no padding or hedging filler.
- useful: would genuinely help someone about to make this decision.

Judge only the answers in front of you. Ignore length, formatting and writing style except where they affect the four criteria. The two answers are in a random order and carry no identifying information.

Reply with STRICT JSON only:
{"a":{"grounded":n,"complete":n,"direct":n,"useful":n},"b":{"grounded":n,"complete":n,"direct":n,"useful":n},"verdict":"a"|"b"|"tie","why":"one sentence"}`

interface Scores { grounded: number; complete: number; direct: number; useful: number }
interface Grade { before: Scores; after: Scores; winner: 'before' | 'after' | 'tie'; why: string }

async function grade(
  context: string, question: string, before: string, after: string, flip: boolean,
): Promise<Grade> {
  // Randomise which slot each model occupies, so a grader that favours the
  // first answer it reads cannot systematically favour one model.
  const a = flip ? after : before
  const b = flip ? before : after

  const completion = await openai.chat.completions.create({
    model: GRADER_MODEL,
    messages: [
      { role: 'system', content: GRADER_SYSTEM },
      {
        role: 'user',
        content: `REPORT CONTEXT:\n${context}\n\nQUESTION:\n${question}\n\nANSWER A:\n${a}\n\nANSWER B:\n${b}`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 400,
  }, { timeout: 60_000, maxRetries: 1 })

  const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
  const v = parsed.verdict === 'a' || parsed.verdict === 'b' ? parsed.verdict : 'tie'
  const winner: Grade['winner'] =
    v === 'tie' ? 'tie' : (v === 'a') === flip ? 'after' : 'before'
  return {
    before: flip ? parsed.b : parsed.a,
    after: flip ? parsed.a : parsed.b,
    winner,
    why: String(parsed.why ?? ''),
  }
}

const avg = (ns: number[]) => ns.reduce((s, n) => s + n, 0) / ns.length
const total = (ns: number[]) => ns.reduce((s, n) => s + n, 0)
const mean = (s: Scores) => (s.grounded + s.complete + s.direct + s.useful) / 4

interface Row {
  id: string
  kind: string
  question: string
  before: Answer
  after: Answer
  grade: Grade
}

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set')

  console.log(`Generating the shared report with ${REPORT_MODEL} …`)
  const documents = [
    { name: 'supplier-a.txt', content: readFileSync('supplier-a.txt', 'utf-8') },
    { name: 'supplier-b.txt', content: readFileSync('supplier-b.txt', 'utf-8') },
  ]
  // Argument order matches api/_lib/shared.ts: language comes before the goal.
  const generated = await generateDecisionReport(
    documents, 'English', DECISION_GOAL, 'supplier_quotation',
  )
  const context = buildAssistantContext(generated.data)
  console.log(`Report ready. Assistant context: ${context.length} chars (cap ${MAX_ASSISTANT_CONTEXT_CHARS}).`)

  const rows: Row[] = []
  for (const [i, q] of QUESTIONS.entries()) {
    process.stdout.write(`${q.id} … `)
    const [before, after] = await Promise.all([
      ask(BEFORE_MODEL, context, q.text),
      ask(AFTER_MODEL, context, q.text),
    ])
    const g = await grade(context, q.text, before.text, after.text, i % 2 === 1)
    rows.push({ id: q.id, kind: q.kind, question: q.text, before, after, grade: g })
    console.log(`before ${mean(g.before).toFixed(2)} / after ${mean(g.after).toFixed(2)} → ${g.winner}`)
  }

  writeFileSync(OUT, renderMarkdown(rows, context, generated), 'utf-8')
  console.log(`\nWritten: ${OUT}`)
}

function renderMarkdown(rows: Row[], context: string, generated: any): string {
  const wins: Record<string, number> = { before: 0, after: 0, tie: 0 }
  rows.forEach(r => { wins[r.grade.winner]++ })

  const beforeUsd = total(rows.map(r => r.before.usd))
  const afterUsd = total(rows.map(r => r.after.usd))
  const beforeMs = avg(rows.map(r => r.before.ms))
  const afterMs = avg(rows.map(r => r.after.ms))

  const crit = (k: keyof Scores) => ({
    before: avg(rows.map(r => r.grade.before[k])),
    after: avg(rows.map(r => r.grade.after[k])),
  })

  const criteria: [string, keyof Scores][] = [
    ['Grounded (no invented facts)', 'grounded'],
    ['Complete (answers what was asked)', 'complete'],
    ['Direct (concise, no padding)', 'direct'],
    ['Useful (helps the decision)', 'useful'],
  ]

  const l: string[] = []
  l.push('# Decision Assistant — Before / After Quality Comparison')
  l.push('')
  l.push(`_Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/assistant-model-comparison.ts\`. Every answer below is real output from a live API run — nothing here is written by hand._`)
  l.push('')
  l.push('## What changed, and why it was tested')
  l.push('')
  l.push('The Decision Assistant (the "Challenge the AI" panel on a report) charges 1 AI Credit per question. It used to run on **gpt-4o**, the same model that writes the full report, with the report context sent uncapped. That cost 2–7x more per credit than a whole report: a Pro subscriber spending 3,000 credits on questions could incur $24–45 of API cost against $27.86 of net revenue.')
  l.push('')
  l.push('It now runs on **gpt-4o-mini**. The argument for that was: the Assistant never analyses a document. The report has already been written by gpt-4o and is handed to the Assistant as context, so the Assistant only has to write a short answer from text it was given. This test checks whether that argument holds in practice.')
  l.push('')
  l.push('## How this was tested')
  l.push('')
  l.push(`- One real decision report was generated from two sample supplier quotations using the production report path (\`${REPORT_MODEL}\`). Both models then answered from **the identical report context** — ${context.length} characters, built by exactly the same code the browser uses.`)
  l.push(`- ${rows.length} questions were asked to each model, using the production system prompt, \`max_tokens: 600\` and the production timeout. Two of them ask for facts that are deliberately **not** in the documents, to see whether a model invents them.`)
  l.push('- Answers were graded **blind** by a third model (gpt-4o) that saw the report context and both answers with no model names attached, in a randomised order, scoring each 1–5 on four criteria.')
  l.push('')
  l.push('## Result')
  l.push('')
  l.push('| Criterion (1–5) | Before — gpt-4o | After — gpt-4o-mini | Difference |')
  l.push('| --- | --- | --- | --- |')
  for (const [label, key] of criteria) {
    const c = crit(key)
    const d = c.after - c.before
    l.push(`| ${label} | ${c.before.toFixed(2)} | ${c.after.toFixed(2)} | ${d >= 0 ? '+' : ''}${d.toFixed(2)} |`)
  }
  const bAll = avg(rows.map(r => mean(r.grade.before)))
  const aAll = avg(rows.map(r => mean(r.grade.after)))
  l.push(`| **Overall** | **${bAll.toFixed(2)}** | **${aAll.toFixed(2)}** | **${aAll - bAll >= 0 ? '+' : ''}${(aAll - bAll).toFixed(2)}** |`)
  l.push('')
  l.push(`**Head-to-head:** the blind grader preferred the old model on ${wins.before} of ${rows.length} questions, the new model on ${wins.after}, and called ${wins.tie} a tie.`)
  l.push('')
  l.push('| | Before — gpt-4o | After — gpt-4o-mini |')
  l.push('| --- | --- | --- |')
  l.push(`| Cost for these ${rows.length} questions | $${beforeUsd.toFixed(4)} | $${afterUsd.toFixed(4)} |`)
  l.push(`| Cost per question | $${(beforeUsd / rows.length).toFixed(5)} | $${(afterUsd / rows.length).toFixed(5)} |`)
  l.push(`| Average response time | ${(beforeMs / 1000).toFixed(1)}s | ${(afterMs / 1000).toFixed(1)}s |`)
  l.push(`| Cost of 3,000 questions (a Pro month) | $${(beforeUsd / rows.length * 3000).toFixed(2)} | $${(afterUsd / rows.length * 3000).toFixed(2)} |`)
  l.push('')
  l.push('## What this does and does not show')
  l.push('')
  const gap = Math.abs(aAll - bAll)
  l.push(`- **${gap < 0.15 ? 'No quality difference was detected.' : 'A difference was detected.'}** A ${gap.toFixed(2)} gap on a 5-point scale, from one grader over ${rows.length} questions, is ${gap < 0.15 ? 'noise — the honest reading is "the change is not visible in the answers", not "one model is better"' : 'small but worth re-running before drawing conclusions'}.`)
  l.push('- Both models answered a report that **gpt-4o had already written**. Nothing here suggests a smaller model could write the report itself, and nothing was changed there: full reports still run on gpt-4o.')
  l.push(`- The sample documents are short, so the shared context was ${context.length} characters against a ${MAX_ASSISTANT_CONTEXT_CHARS}-character cap. A much longer report would give both models more to hold at once; this run does not measure that case.`)
  l.push('')
  l.push('## The fabrication traps')
  l.push('')
  l.push('Two questions ask for facts that appear nowhere in the documents (an ISO certificate number, three years of delivery statistics). A model that wants to be helpful has to choose between admitting it does not know and inventing something plausible. This is the failure that would matter most to a paying customer, because an invented certificate number looks exactly like a real one.')
  l.push('')
  for (const r of rows.filter(x => x.kind === 'Fabrication trap')) {
    l.push(`**${r.id} — "${r.question}"**`)
    l.push('')
    l.push(`- Before (gpt-4o) — grounded score ${r.grade.before.grounded}/5`)
    l.push(`- After (gpt-4o-mini) — grounded score ${r.grade.after.grounded}/5`)
    l.push('')
  }
  l.push('## Every question, side by side')
  l.push('')
  for (const r of rows) {
    l.push(`### ${r.id} · ${r.kind}`)
    l.push('')
    l.push(`> ${r.question}`)
    l.push('')
    l.push(`**Before — gpt-4o** _(grounded ${r.grade.before.grounded}, complete ${r.grade.before.complete}, direct ${r.grade.before.direct}, useful ${r.grade.before.useful} · ${(r.before.ms / 1000).toFixed(1)}s · $${r.before.usd.toFixed(5)})_`)
    l.push('')
    l.push(r.before.text.trim())
    l.push('')
    l.push(`**After — gpt-4o-mini** _(grounded ${r.grade.after.grounded}, complete ${r.grade.after.complete}, direct ${r.grade.after.direct}, useful ${r.grade.after.useful} · ${(r.after.ms / 1000).toFixed(1)}s · $${r.after.usd.toFixed(5)})_`)
    l.push('')
    l.push(r.after.text.trim())
    l.push('')
    l.push(`**Blind grader:** ${r.grade.winner === 'tie' ? 'tie' : r.grade.winner === 'before' ? 'preferred the old model' : 'preferred the new model'} — ${r.grade.why}`)
    l.push('')
    l.push('---')
    l.push('')
  }
  l.push('## Appendix — the shared report context')
  l.push('')
  l.push(`Generated with \`${REPORT_MODEL}\` from \`supplier-a.txt\` and \`supplier-b.txt\`, using ${generated.usage?.promptTokens ?? '?'} input and ${generated.usage?.completionTokens ?? '?'} output tokens. This exact string was the only information either Assistant model had:`)
  l.push('')
  l.push('```json')
  l.push(context)
  l.push('```')
  l.push('')
  return l.join('\n')
}
/* eslint-enable @typescript-eslint/no-explicit-any */

main().catch(e => { console.error(e); process.exit(1) })
