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

   MAX_TOTAL_CHARS is the load-bearing one. Without it, a 10-document report
   would send ~300k characters (~75k tokens) for ~$0.22, and 3,000 monthly
   credits of those would consume an entire $29 Pro subscription. The budget is
   shared across documents instead: one or two documents get the full
   allowance, ten documents get the 8,000 each they already had.
*/

/** Single-content analyses (pasted text, one PDF). */
export const MAX_CONTENT_CHARS = 30_000
/** The most any single document may contribute to a decision report. */
export const MAX_DOC_CHARS = 30_000
/**
 * Target total across every document in one decision report. MIN_DOC_CHARS
 * wins over it above 7 documents, so a 10-document report sends 80k rather
 * than 60k — that is deliberate. 10 x 8,000 is exactly what shipped before,
 * and its cost was already priced in; cutting it to 6,000 each to satisfy this
 * number would make large reports worse than they are today.
 */
export const MAX_TOTAL_CHARS = 60_000
/** Floor per document, so a 10-document report is never worse than before. */
export const MIN_DOC_CHARS = 8_000
/** Ceiling on the report context sent with each Decision Assistant question. */
export const MAX_ASSISTANT_CONTEXT_CHARS = 6_000

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
