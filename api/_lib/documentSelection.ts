// ── Choosing what to send from a document that does not fit ─────────────────
// A long document has to be cut down before it is sent to the model, because
// the account's tokens-per-minute ceiling is a hard limit on how much one
// report may read (see aiConfig).
//
// It used to be cut at a fixed number of characters, keeping the beginning and
// dropping the rest. On a 30-page sale and purchase agreement that threw away
// everything past roughly page 21, and the report then said the agreement had
// no liability clause, no dispute resolution and no price breakdown — all of
// which were in the document, a few pages past the cut. A customer reading
// that has been told something untrue about their own contract.
//
// So the cut is no longer positional. The document is split into its
// paragraphs, the ones that speak to the checklist the report is about to be
// scored against are kept wherever they appear, and what is left out is left
// out visibly. The selection is pure text processing: no model call, no
// randomness, the same document always yields the same extract.

/** Text with a leading `[PAGE n]` line, as toPageMarkedText produces. */
const PAGE_MARKER = /^\[PAGE (\d+)\]$/

/** Stands in for what was left out, so the model never reads across a gap. */
const GAP = '[... routine text omitted ...]'

export interface DocumentExtract {
  text: string
  /** True when the document did not fit and had to be condensed. */
  condensed: boolean
}

interface Block {
  /** Paragraph text, without its page marker. */
  text: string
  /** Page it sits on, or 0 when the document carries no page markers. */
  page: number
  /** Position in the document, for putting the selection back in order. */
  index: number
  /** Weight of the checklist terms it mentions; see scoreBlocks. */
  score: number
}

/**
 * Share of the budget kept from the opening of the document, whatever it says.
 * The first pages carry the parties, the price, the dates and the document's
 * own description of itself — the things every report needs and the things the
 * type detection reads.
 */
const HEAD_SHARE = 0.45

/**
 * And a share kept from the end, whatever it says. Schedules, annexes, the
 * signature block and the special conditions live there, and a contract's
 * particulars are often in a schedule rather than in the clauses.
 */
const TAIL_SHARE = 0.12

function splitIntoBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let page = 0
  let index = 0
  for (const raw of text.split(/\n\s*\n/)) {
    const block = raw.trim()
    if (!block) continue
    const marker = block.match(PAGE_MARKER)
    if (marker) { page = Number(marker[1]); continue }
    // A page marker glued to the first paragraph of its page.
    const lines = block.split('\n')
    const firstLine = lines[0].trim().match(PAGE_MARKER)
    if (firstLine) {
      page = Number(firstLine[1])
      const rest = lines.slice(1).join('\n').trim()
      if (!rest) continue
      blocks.push({ text: rest, page, index: index++, score: 0 })
      continue
    }
    blocks.push({ text: block, page, index: index++, score: 0 })
  }
  return blocks
}

/**
 * Score every paragraph by the checklist terms it mentions, weighting each
 * term by how rare it is in this document.
 *
 * Counting plain hits does not work on a contract: its boilerplate mentions
 * notices, costs and compliance on every page, so the routine clauses score as
 * highly as the one clause that caps the vendor's liability. A term that turns
 * up in most paragraphs says nothing about which paragraph matters; one that
 * turns up in two says a great deal. Weighting by that — rarer term, higher
 * weight — is what keeps the distinctive clauses and drops the filler.
 *
 * Matching is on stems, so "indemnify" also catches indemnities and
 * indemnification.
 */
function scoreBlocks(blocks: Block[], terms: string[]): void {
  const lowered = blocks.map(b => b.text.toLowerCase())
  const weight = new Map<string, number>()
  for (const term of terms) {
    let seenIn = 0
    for (const text of lowered) if (text.includes(term)) seenIn++
    if (seenIn > 0) weight.set(term, Math.log(1 + blocks.length / seenIn))
  }
  blocks.forEach((block, i) => {
    let score = 0
    for (const [term, w] of weight) if (lowered[i].includes(term)) score += w
    block.score = score
  })
}

function withPage(block: Block, lastPage: number): string {
  return block.page && block.page !== lastPage ? `[PAGE ${block.page}]\n${block.text}` : block.text
}

/**
 * Fit a document into `budget` characters, keeping its opening and then the
 * paragraphs that speak to `terms`, in document order.
 *
 * Returns the document unchanged when it already fits, which is the usual case
 * — nothing about short documents changes.
 */
export function selectWithinBudget(text: string, budget: number, terms: string[]): DocumentExtract {
  if (text.length <= budget) return { text, condensed: false }

  const blocks = splitIntoBlocks(text)
  if (blocks.length === 0) return { text: text.slice(0, budget), condensed: true }

  scoreBlocks(blocks, terms)

  const kept = new Set<number>()
  let used = 0
  const cost = (block: Block) => block.text.length + 12

  // 1. The opening, in order, up to its share of the budget.
  const headBudget = Math.floor(budget * HEAD_SHARE)
  for (const block of blocks) {
    if (used + cost(block) > headBudget) break
    kept.add(block.index)
    used += cost(block)
  }

  // 2. The end of the document, backwards, up to its share.
  const tailBudget = Math.floor(budget * TAIL_SHARE)
  let tailUsed = 0
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]
    if (kept.has(block.index)) break
    if (tailUsed + cost(block) > tailBudget) break
    kept.add(block.index)
    tailUsed += cost(block)
    used += cost(block)
  }

  // 3. What is left goes to whatever speaks to the checklist, best first. Ties
  //    go to the earlier paragraph, so the result never depends on sort order.
  const rest = blocks
    .filter(b => !kept.has(b.index))
    .sort((a, b) => b.score - a.score || a.index - b.index)

  for (const block of rest) {
    if (block.score === 0) break
    if (used + cost(block) > budget) continue      // a shorter one may still fit
    kept.add(block.index)
    used += cost(block)
  }

  // 4. Anything still spare goes to the paragraphs in between, so the extract
  //    reads continuously wherever it can.
  for (const block of blocks) {
    if (kept.has(block.index)) continue
    if (used + cost(block) > budget) continue
    kept.add(block.index)
    used += cost(block)
  }

  const out: string[] = []
  let lastPage = -1
  let gapOpen = false
  for (const block of blocks) {
    if (!kept.has(block.index)) { gapOpen = true; continue }
    if (gapOpen && out.length > 0) { out.push(GAP); gapOpen = false }
    out.push(withPage(block, lastPage))
    lastPage = block.page
  }
  if (gapOpen) out.push(GAP)

  return { text: out.join('\n\n'), condensed: true }
}
