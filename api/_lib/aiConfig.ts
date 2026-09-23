// ── Central AI configuration ────────────────────────────────────────────────
// Single source of truth for which model runs what, how much input we are
// willing to send it, and what a call costs. Both the Vercel routes in `api/`
// and the local dev server in `server/index.ts` import from here, so the two
// code paths can never drift apart — previously each held its own copy of the
// model name and the truncation limits.

import { selectWithinBudget } from './documentSelection.js'

/**
 * Model used for document analysis and report generation.
 *
 * Pinned to a dated snapshot. The bare 'gpt-4o' alias is moved to newer
 * snapshots by OpenAI without notice, which changes how the same documents are
 * judged from one week to the next. This is the snapshot the alias pointed to
 * when it was pinned (2026-09-15), so report quality is unchanged.
 */
export const REPORT_MODEL = 'gpt-4o-2024-08-06'

/**
 * Sampling settings for every report call. The default temperature (1.0)
 * samples a different verdict, ranking and scores from identical documents on
 * each run. Temperature 0 with a fixed seed makes the output as repeatable as
 * the API allows; the scoring in decisionScoring.ts removes what remains.
 */
export const REPORT_SAMPLING = { temperature: 0, seed: 20260915 } as const

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
  'gpt-4o-2024-08-06': { input: 2.50, cachedInput: 1.25, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, cachedInput: 0.075, output: 0.60  },
}

/* ── Input ceilings ──────────────────────────────────────────────────────────
   What one report may read is set by the account's tokens-per-minute ceiling,
   not by the model's context window. The key runs at 30,000 TPM, and a report
   is two calls inside the same minute, so everything both of them send and
   receive has to fit in that one figure:

     assessment prompt      ~14,000   the documents, at MAX_TOTAL_CHARS
     writer prompt           ~4,000   its extract, at WRITER_TOTAL_CHARS
     the two system prompts  ~4,500
     the report itself       ~3,000
                            ───────
                            ~25,500   of 30,000

   Measured at 28,753 before this budget was set — 96% of the ceiling, with the
   documents sent twice at full length. A slightly longer upload would have
   been refused outright by the rate limiter, costing the customer a report.
   Raising these numbers means raising the key's tier first.

   The budget is shared across documents rather than given to each: one upload
   gets the full allowance, several get a share with a floor under it. A
   document longer than its share is condensed by selectWithinBudget rather
   than cut off at the character count, so a clause late in a contract still
   reaches the model. Either way the reader is told which documents did not
   fit whole — analysing part of a contract silently is not an option.
*/

/** Single-content analyses (pasted text, one PDF). ~18 pages of dense text. */
export const MAX_CONTENT_CHARS = 50_000
/** The most any single document may contribute to a decision report. */
export const MAX_DOC_CHARS = 56_000
/**
 * Total across every document in one decision report. A single upload gets the
 * full MAX_DOC_CHARS; beyond that the budget is divided, so two documents get
 * 32,000 each and five get 12,800 each. MIN_DOC_CHARS wins over this above
 * eight documents, which is deliberate — 8,000 each is what shipped
 * originally, and lowering it to satisfy this number would make large reports
 * worse than they already are.
 */
export const MAX_TOTAL_CHARS = 64_000
/** Floor per document, so a many-document report is never worse than before. */
export const MIN_DOC_CHARS = 8_000
/**
 * What the report writer is given. It does not judge the documents — the
 * checklist has already been scored by the time it runs, and it is handed
 * those results as final — so it needs enough of the text to quote evidence
 * and write accurately, not the whole thing. Sending the documents twice at
 * full length was most of the token bill.
 */
export const WRITER_TOTAL_CHARS = 16_000
/** Floor per document inside the writer's allowance, for many-document reports. */
export const WRITER_MIN_DOC_CHARS = 2_000
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

/** Decision reports — route allows 60s. Shared by the assessment and the
 *  report-writing call, so the two together still finish inside the route. */
export const REPORT_TIMEOUT_MS = 50_000
/** The assessment step's own ceiling. When it is exceeded the report is still
 *  written, from the model's own figures, in the time that is left. */
export const ASSESSMENT_TIMEOUT_MS = 18_000
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

/**
 * The model's reply could not be used as a report — cut off at the token
 * ceiling, refused, empty, or not valid JSON. The message is safe to show the
 * customer; callers refund before returning it.
 */
export class ModelOutputError extends Error {}

/**
 * Parse a JSON-mode chat completion, checking why generation stopped first.
 *
 * `JSON.parse` used to run on the raw content unguarded. When a report hit the
 * max_tokens ceiling the JSON was simply truncated, the parse threw, and the
 * customer was shown a raw "Unexpected end of JSON input" parser error.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseModelJson(completion: any): Record<string, unknown> {
  const choice = completion?.choices?.[0]
  if (choice?.finish_reason === 'length') {
    throw new ModelOutputError(
      'The analysis was too long for the AI to finish in one pass. Your AI Credits have been refunded — '
      + 'please try again with fewer or shorter documents.',
    )
  }
  if (choice?.finish_reason === 'content_filter' || choice?.message?.refusal) {
    throw new ModelOutputError('The AI could not analyse this content. Your AI Credits have been refunded.')
  }
  const raw = choice?.message?.content
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ModelOutputError('The AI returned an empty response. Your AI Credits have been refunded — please try again.')
  }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  } catch {
    // fall through to the shared message below
  }
  throw new ModelOutputError('The AI returned an incomplete report. Your AI Credits have been refunded — please try again.')
}

/** How many characters each document may use, given how many were uploaded. */
export function perDocumentBudget(
  documentCount: number,
  totalChars: number = MAX_TOTAL_CHARS,
  minChars: number = MIN_DOC_CHARS,
): number {
  const cap = Math.min(MAX_DOC_CHARS, totalChars)
  if (documentCount <= 0) return cap
  const share = Math.floor(totalChars / documentCount)
  // The floor stops a handful of documents being read too thinly, but it is
  // dropped once it would burst the shared budget: ten documents at 8,000 each
  // is 80,000 characters, and a report that asks for more than the minute's
  // token allowance is refused outright rather than answered thinly.
  const floorFits = documentCount * minChars <= totalChars
  return Math.min(cap, floorFits ? Math.max(minChars, share) : share)
}

/* ── PDF page markers ────────────────────────────────────────────────────────
   pdf2json emits a trailing "----------------Page (N) Break----------------"
   AFTER each page's text, and N is 0-indexed — so everything before
   "Page (0) Break" is page 1.

   Neither raw shape is something a model can cite. The Vercel route used to
   strip the markers out entirely before building the prompt, which left the
   model inventing the "page" field the report schema asks it for; the dev
   server passed the raw 0-indexed trailing markers straight through, which is
   off by one and reads like a header for the page that follows. Both paths now
   convert to a leading, 1-indexed "[PAGE n]" header through this function,
   which is the form PAGE_CITATION_RULES tells the model to cite.

   Page citations are load-bearing: the report UI deep-links the reader's own
   PDF to them, so they have to come from the document rather than from the
   model's imagination.
*/
const PAGE_BREAK_PATTERN = String.raw`-+Page \(\d+\) Break-+`

/** Marker the model is told to read page numbers from. */
export const pageMarker = (n: number) => `[PAGE ${n}]`

export interface PageMarkedText {
  /** Document text with a leading, 1-indexed `[PAGE n]` header per page. */
  text: string
  /** Page count, taken from the number of breaks pdf2json emitted. */
  pages: number
  /** Text length excluding the markers, for "did anything extract?" checks. */
  contentChars: number
}

/**
 * Convert pdf2json's raw text dump into page-marked text the model can cite.
 * Page numbering follows the break positions, so a blank page still advances
 * the count and every later citation stays aligned with the real document.
 */
export function toPageMarkedText(rawPdfText: string): PageMarkedText {
  const breaks = rawPdfText.match(new RegExp(PAGE_BREAK_PATTERN, 'g')) ?? []
  const pages = Math.max(breaks.length, 1)

  let contentChars = 0
  const marked: string[] = []
  rawPdfText.split(new RegExp(PAGE_BREAK_PATTERN, 'g')).forEach((chunk, i) => {
    const body = chunk.trim()
    if (!body) return
    contentChars += body.length
    marked.push(`${pageMarker(i + 1)}\n${body}`)
  })

  return { text: marked.join('\n\n'), pages, contentChars }
}

export interface DocsBlockResult {
  /** The prompt block to send to the model. */
  block: string
  /** Names of documents that did not fit whole and were reduced. */
  condensed: string[]
}

/**
 * Build the document block for a decision report, sharing a character budget
 * across the uploaded documents and reporting which ones did not fit whole.
 * The caller is expected to surface `condensed` to the user — sending the
 * model part of a contract without saying so is the problem this replaces.
 *
 * A document that fits is sent exactly as it is, which is the usual case. One
 * that does not is reduced by selectWithinBudget, which keeps its opening and
 * the passages that bear on the checklist instead of stopping at a character
 * count and discarding the rest of the contract.
 */
export function buildDocsBlock(
  documents: { name: string; content: string }[],
  options: { totalChars?: number; minChars?: number; terms?: string[] } = {},
): DocsBlockResult {
  const total = options.totalChars ?? MAX_TOTAL_CHARS
  const budget = perDocumentBudget(documents.length, total, options.minChars)
  const terms = options.terms ?? []
  const condensed: string[] = []

  const block = documents
    .map((d, i) => {
      const extract = selectWithinBudget(d.content, budget, terms)
      if (extract.condensed) condensed.push(d.name)
      return `--- Document ${i + 1}: ${d.name} ---\n${extract.text}`
    })
    .join('\n\n')

  return { block, condensed }
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

/** Token counts of several calls that together produced one result. */
export function addUsage(...parts: TokenUsage[]): TokenUsage {
  return parts.reduce((sum, u) => ({
    promptTokens: sum.promptTokens + u.promptTokens,
    completionTokens: sum.completionTokens + u.completionTokens,
    cachedTokens: sum.cachedTokens + u.cachedTokens,
    totalTokens: sum.totalTokens + u.totalTokens,
  }), { promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalTokens: 0 })
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
