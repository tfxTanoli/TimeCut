import { getAdminDb } from './stripe-admin.js'
import { MAX_ASSISTANT_CONTEXT_CHARS } from './aiConfig.js'

// ── Decision Assistant input handling ───────────────────────────────────────
// The Assistant answers questions about one finished report. Two inputs used
// to be unbounded or free-form:
//
//  • `question` had no length limit at all, so a multi-megabyte question cost
//    full OpenAI price for a single credit.
//  • `reportContext` was whatever string the browser sent, which made the
//    route usable as a general-purpose GPT-4o-mini endpoint.
//
// Now the question is capped, and the context is rebuilt on the server from a
// fixed set of report fields — loaded from the caller's own saved report when
// a report id is supplied, or else parsed out of the client's JSON with every
// unknown key discarded and every field clipped.
//
// src/components/DecisionResultPage.tsx mirrors these limits for the browser.

/** Longest question accepted. Real questions are a sentence or two. */
export const MAX_ASSISTANT_QUESTION_CHARS = 1000
/** Mirrors the decision-goal textarea's maxLength. */
export const MAX_DECISION_GOAL_CHARS = 500

/** Upper bound on the raw context string the browser may send. */
const MAX_CLIENT_CONTEXT_BYTES = 50_000

const MAX_ITEMS = 5
const MAX_FIELD = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any

function clip(value: unknown, max = MAX_FIELD): string {
  if (typeof value !== 'string') return ''
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function list(value: unknown): Raw[] {
  return Array.isArray(value) ? value.slice(0, MAX_ITEMS) : []
}

/**
 * Serialise the parts of a report the Assistant reasons over, from whitelisted
 * fields only. Same shape the browser has always sent, so answers do not change.
 */
export function buildAssistantContext(report: Raw): string {
  const context = {
    recommendation: clip(report?.recommendation, 600),
    confidence_score: num(report?.confidence_score),
    confidence_rationale: clip(report?.confidence_rationale),
    ranking: list(report?.ranking).map((r: Raw) => ({
      rank: num(r?.rank),
      name: clip(r?.name, 120),
      summary: clip(r?.summary),
    })),
    hidden_risks: list(report?.hidden_risks).map((r: Raw) => ({
      description: clip(r?.description),
      severity: clip(r?.severity, 10),
    })),
    missing_information: list(report?.missing_information).map((m: Raw) => ({
      title: clip(m?.title, 120),
      whyItMatters: clip(m?.whyItMatters),
    })),
    evidence_found: list(report?.evidence_found).map((e: Raw) => ({
      section: clip(e?.section, 120),
      page: clip(e?.page, 10) || undefined,
      clause: clip(e?.clause, 60) || undefined,
      context: clip(e?.context),
    })),
    decision_defense: clip(report?.decision_defense, 600),
    what_would_change: clip(report?.what_would_change, 600),
    decision_strength: num(report?.decision_strength),
    compared_categories: list(report?.compared_categories).map((c: unknown) => clip(c, 80)),
  }
  return JSON.stringify(context).slice(0, MAX_ASSISTANT_CONTEXT_CHARS)
}

/**
 * Rebuild a context string the browser sent. Anything that is not the JSON
 * shape buildAssistantContext produces is refused rather than forwarded.
 */
export function sanitizeClientContext(raw: unknown): string | null {
  // A genuine context is a few kilobytes of already-clipped fields. Anything
  // far larger is not one, and is refused before it is parsed.
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_CLIENT_CONTEXT_BYTES) return null
  let parsed: Raw
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  if (typeof parsed.recommendation !== 'string' && !Array.isArray(parsed.hidden_risks)) return null
  return buildAssistantContext(parsed)
}

/** The caller's own saved report, or null when the id is absent or not theirs. */
export async function loadOwnReport(uid: string, reportId: unknown): Promise<Raw | null> {
  if (typeof reportId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(reportId)) return null
  const adb = getAdminDb()
  if (!adb) return null
  try {
    const snap = await adb.doc(`users/${uid}/analyses/${reportId}`).get()
    const report = snap.exists ? snap.data()?.report : null
    return report && typeof report === 'object' ? report : null
  } catch (e) {
    console.warn('[assistant] saved report lookup failed:', e)
    return null
  }
}
