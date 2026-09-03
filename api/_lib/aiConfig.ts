// ── Central AI configuration ────────────────────────────────────────────────
// Single source of truth for which model runs what, how much input we are
// willing to send it, and what a call costs. Both the Vercel routes in `api/`
// and the local dev server in `server/index.ts` import from here, so the two
// code paths can never drift apart — previously each held its own copy of the
// model name and the truncation limits.

/** Model used for document analysis and report generation. */
export const REPORT_MODEL = 'gpt-4o'

/**
 * Model used for the Decision Assistant chat.
 *
 * The Assistant never analyses a document. The report has already been produced
 * by REPORT_MODEL, and we hand it that finished report as context — its job is
 * to write a 3-5 sentence answer grounded in text it has been given. A small
 * model does that just as well, at roughly 1/25th of the cost.
 */
export const ASSISTANT_MODEL = 'gpt-4o-mini'

/**
 * USD per 1,000,000 tokens.
 *
 * MUST be re-checked against https://openai.com/api/pricing/ whenever OpenAI
 * changes prices — every cost figure in the Admin dashboard is derived from
 * this table, so a stale entry produces confidently wrong numbers.
 * Last verified: 2026-09-02.
 */
export const MODEL_PRICING: Record<string, { input: number; cachedInput: number; output: number }> = {
  'gpt-4o':      { input: 2.50, cachedInput: 1.25,  output: 10.00 },
  'gpt-4o-mini': { input: 0.15, cachedInput: 0.075, output: 0.60  },
}

/* ── Input ceilings ──────────────────────────────────────────────────────────
   Documents used to be cut to 8,000 characters each, which silently dropped
   everything past roughly page 3-5 of a contract: a liability clause on page 30
   was never seen by the model, and nothing told the user. These limits raise
   that a long way while keeping a hard ceiling on what one report can cost.

   MAX_TOTAL_CHARS is the load-bearing one. Without it, ten documents at the
   per-document allowance would send 500k characters (~125k tokens) and cost
   ~$0.35 a report, which 3,000 monthly credits of would outrun a $29
   subscription. The budget is shared across documents instead: a single
   upload gets the full allowance, ten documents get 8,000 each.
*/

/** Single-content analyses (pasted text, one PDF). ~18 pages of dense text. */
export const MAX_CONTENT_CHARS = 50_000
/** The most any single document may contribute to a decision report. */
export const MAX_DOC_CHARS = 50_000
/**
 * Total across every document in one decision report. A single upload gets the
 * full MAX_DOC_CHARS; beyond that the budget is divided, so two documents get
 * 40,000 each and five get 16,000 each. MIN_DOC_CHARS wins over this above ten
 * documents, which is deliberate — 10 x 8,000 is exactly what shipped
 * originally, and lowering it to satisfy this number would make large reports
 * worse than they already are.
 */
export const MAX_TOTAL_CHARS = 80_000
/** Floor per document, so a 10-document report is never worse than before. */
export const MIN_DOC_CHARS = 8_000
/** Ceiling on the report context sent with each Decision Assistant question. */
export const MAX_ASSISTANT_CONTEXT_CHARS = 6_000

/* ── Request deadlines ───────────────────────────────────────────────────────
   Each of these sits below its route's `maxDuration` in vercel.json, so a slow
   OpenAI response fails inside our own code with time to spare.

   This matters because credits are charged before the model call and refunded
   in the catch block. If the platform kills the function first, that catch
   never runs: the customer is charged, we pay OpenAI, and no report arrives.
   Timing out ourselves keeps the refund path reachable.

   Retries are off for the same reason. The SDK retries timed-out requests by
   default, which would push a second attempt straight past the route's ceiling.
*/

/** Decision reports — route allows 60s. */
export const REPORT_TIMEOUT_MS = 50_000
/** Content analyses — route allows 30s. */
export const CONTENT_TIMEOUT_MS = 25_000
/** Assistant questions — route allows 30s, and answers are short. */
export const ASSISTANT_TIMEOUT_MS = 20_000
/** No retry fits inside these budgets; the caller refunds and reports instead. */
export const OPENAI_MAX_RETRIES = 0

/**
 * True when a failure was our own deadline rather than a fault in the request.
 * The SDK reports these as APIConnectionTimeoutError; matching on the name
 * avoids importing the error class into every route.
 */
export function isTimeoutError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  return e.name === 'APIConnectionTimeoutError' || /timed?\s?out/i.test(e.message)
}

/** What to tell someone whose analysis ran out of time. Credits are already
 *  refunded by the time this is shown, and saying so prevents a support ticket. */
export const TIMEOUT_MESSAGE =
  'The analysis took too long and was stopped. Your AI Credits have been refunded — '
  + 'please try again, or split very large documents into smaller files.'

/** How many characters each document may use, given how many were uploaded. */
export function perDocumentBudget(documentCount: number): number {
  if (documentCount <= 0) return MAX_DOC_CHARS
  const share = Math.floor(MAX_TOTAL_CHARS / documentCount)
  return Math.min(MAX_DOC_CHARS, Math.max(MIN_DOC_CHARS, share))
}

export interface DocsBlockResult {
  /** The prompt block to send to the model. */
  block: string
  /** Names of documents that did not fit and were cut short. */
  truncated: string[]
}

/**
 * Build the document block for a decision report, sharing MAX_TOTAL_CHARS
 * across the uploaded documents and reporting which ones were cut. The caller
 * is expected to surface `truncated` to the user — silent truncation is the
 * problem this replaces.
 */
export function buildDocsBlock(documents: { name: string; content: string }[]): DocsBlockResult {
  const budget = perDocumentBudget(documents.length)
  const truncated: string[] = []

  const block = documents
    .map((d, i) => {
      const cut = d.content.length > budget
      if (cut) truncated.push(d.name)
      return `--- Document ${i + 1}: ${d.name} ---\n${cut ? d.content.slice(0, budget) : d.content}`
    })
    .join('\n\n')

  return { block, truncated }
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  /** Prompt tokens served from OpenAI's automatic prompt cache, at half price. */
  cachedTokens: number
  totalTokens: number
}

/** Pull token counts off a chat completion, tolerating a missing usage block. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readUsage(completion: any): TokenUsage {
  const u = completion?.usage ?? {}
  const promptTokens = u.prompt_tokens ?? 0
  const completionTokens = u.completion_tokens ?? 0
  return {
    promptTokens,
    completionTokens,
    cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
    totalTokens: u.total_tokens ?? promptTokens + completionTokens,
  }
}

/**
 * USD cost of one call. Cached prompt tokens are billed at the discounted rate,
 * so they are subtracted from the full-price prompt tokens rather than counted
 * twice. An unknown model costs 0 rather than throwing — logging must never be
 * able to fail a paid request.
 */
export function computeCostUsd(model: string, usage: TokenUsage): number {
  const price = MODEL_PRICING[model]
  if (!price) return 0
  const fullPrice = Math.max(0, usage.promptTokens - usage.cachedTokens)
  const usd =
    (fullPrice / 1_000_000) * price.input +
    (usage.cachedTokens / 1_000_000) * price.cachedInput +
    (usage.completionTokens / 1_000_000) * price.output
  // Six decimals: a single assistant question costs ~$0.0004.
  return Math.round(usd * 1_000_000) / 1_000_000
}
