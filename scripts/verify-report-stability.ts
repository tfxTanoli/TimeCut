/**
 * Report stability check: run the same documents through the real decision
 * pipeline several times and measure how much the core decision moves.
 *
 * This is what backs the promise that identical inputs give a decision that
 * stays within a consistent range. It calls the same generate + normalise
 * functions as api/analyze-decision.ts, against the real OpenAI API, without
 * touching Firestore or anyone's credits.
 *
 * What it reports per run, then across runs:
 *   - best option (ranking[0]) and the full ranking order
 *   - overall_decision
 *   - Decision Readiness and confidence
 *   - document type and the number of High risks
 *
 * Usage:
 *   npx tsx scripts/verify-report-stability.ts [--runs 3] [--goal "..."] [--type auto] file1 file2 ...
 *
 * Cost: one report per run (roughly $0.03-0.06 each for three short quotations).
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { generateDecisionReport, normalizeDecisionReport } from '../api/_lib/shared.js'
import { extractDocument } from '../api/_lib/documents.js'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const RUNS = Number(arg('runs', '3'))
const GOAL = arg('goal', 'Choose the best office supplies supplier for a 12-month contract')
const TYPE = arg('type', 'auto')
const LANGUAGE = arg('language', 'English')

const flagValues = new Set(['--runs', '--goal', '--type', '--language'].flatMap(f => {
  const i = process.argv.indexOf(f)
  return i > -1 ? [process.argv[i + 1]] : []
}))
const files = process.argv.slice(2).filter(a => !a.startsWith('--') && !flagValues.has(a))

interface RunSummary {
  ms: number
  type: string
  best: string
  order: string
  decision: string
  readiness: number | undefined
  confidence: number | undefined
  highRisks: number
}

async function oneRun(documents: { name: string; content: string }[]): Promise<RunSummary> {
  const started = Date.now()
  const { data: raw } = await generateDecisionReport(documents, LANGUAGE, GOAL, TYPE)
  const report = normalizeDecisionReport(raw, documents.map(d => d.name))
  const ranking = (report.ranking ?? []) as { name: string }[]
  return {
    ms: Date.now() - started,
    type: String(report.document_type ?? ''),
    best: ranking[0]?.name ?? '',
    order: ranking.map(r => r.name).join(' > '),
    decision: String(report.overall_decision ?? ''),
    readiness: report.decision_readiness as number | undefined,
    confidence: report.confidence_score as number | undefined,
    highRisks: ((report.hidden_risks ?? []) as { severity: string }[]).filter(r => r.severity === 'High').length,
  }
}

/** Share of runs agreeing with the most common value. */
function agreement(values: string[]): { value: string; share: string } {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  const [value, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return { value, share: `${n}/${values.length}` }
}

function spread(values: (number | undefined)[]): string {
  const nums = values.filter((v): v is number => typeof v === 'number')
  if (nums.length === 0) return 'n/a'
  return `${Math.min(...nums)}-${Math.max(...nums)} (spread ${Math.max(...nums) - Math.min(...nums)})`
}

async function main() {
  if (files.length === 0) throw new Error('Pass at least one document path.')
  const documents = await Promise.all(files.map(async f => {
    const name = basename(f)
    const doc = await extractDocument(name, readFileSync(f))
    return { name, content: doc.text }
  }))

  console.log(`Report stability — ${RUNS} runs, ${documents.length} documents, type=${TYPE}\nGoal: ${GOAL}\n`)

  // One at a time: parallel runs trip the OpenAI tokens-per-minute limit on
  // lower usage tiers, which measures the rate limit rather than stability.
  const runs: RunSummary[] = []
  for (let i = 0; i < RUNS; i++) runs.push(await oneRun(documents))
  runs.forEach((r, i) => {
    console.log(`Run ${i + 1} (${(r.ms / 1000).toFixed(1)}s): type=${r.type} | ${r.decision} | readiness=${r.readiness} | confidence=${r.confidence} | High risks=${r.highRisks}\n        ranking: ${r.order}`)
  })

  const best = agreement(runs.map(r => r.best))
  const order = agreement(runs.map(r => r.order))
  const decision = agreement(runs.map(r => r.decision))
  const type = agreement(runs.map(r => r.type))
  console.log(`\nBest option:     ${best.value} (${best.share} runs)`)
  console.log(`Full ranking:    ${order.value} (${order.share} runs)`)
  console.log(`Decision:        ${decision.value} (${decision.share} runs)`)
  console.log(`Document type:   ${type.value} (${type.share} runs)`)
  console.log(`Readiness:       ${spread(runs.map(r => r.readiness))}`)
  console.log(`Confidence:      ${spread(runs.map(r => r.confidence))}`)
  console.log(`High risks:      ${spread(runs.map(r => r.highRisks))}`)
  console.log(`Slowest run:     ${(Math.max(...runs.map(r => r.ms)) / 1000).toFixed(1)}s`)
}

main().catch(e => { console.error(e); process.exit(1) })
