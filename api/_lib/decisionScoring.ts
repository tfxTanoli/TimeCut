// ── Deterministic decision scoring ──────────────────────────────────────────
// Why this exists: the report used to let the model pick the ranking, the
// verdict, Decision Readiness and confidence freely, at the default sampling
// temperature. The same documents could come back with a different best option
// or verdict on the next run.
//
// The decision is now made in two parts:
//   1. An assessment step (strict JSON schema, temperature 0) records FACTS only:
//      for each document, the status of each item on a fixed checklist, and
//      the prices it states.
//   2. The code below turns those facts into the ranking, the verdict,
//      readiness, confidence and decision strength, with fixed weights and
//      rules.
// The report writer is then handed these results as final, and only writes
// the explanation around them. Two runs that read the documents the same way
// always produce the same decision.

import type { OverallDecision } from './shared.js'

export const FRAMEWORKS = ['cv', 'supplier_quotation', 'contract', 'business_proposal', 'general'] as const
export type Framework = typeof FRAMEWORKS[number]

export const CRITERION_STATUSES = ['Adequate', 'Partial', 'Missing', 'Unfavorable'] as const
export type CriterionStatus = typeof CRITERION_STATUSES[number]

export const GOAL_PRIORITIES = ['lowest_cost', 'lowest_risk', 'balanced'] as const
export type GoalPriority = typeof GOAL_PRIORITIES[number]

interface Criterion {
  key: string
  label: string
  /** Readiness factor this item feeds. */
  factor: string
  weight: number
  /** A problem here can block a "Proceed". */
  critical: boolean
  /** What the assessor looks for. */
  test: string
}

/** Readiness factor names, in English. The report writer translates them. */
export const FACTOR_LABELS: Record<string, string> = {
  commercial_terms: 'Commercial Terms',
  scope_completeness: 'Scope Completeness',
  evidence_quality: 'Evidence Quality',
  pricing_validation: 'Pricing Validation',
  risk_clarity: 'Risk Clarity',
  key_terms_clarity: 'Key Terms Clarity',
  clause_completeness: 'Clause Completeness',
  liability_risk_clarity: 'Liability & Risk Clarity',
  role_fit_evidence: 'Role Fit Evidence',
  experience_verification: 'Experience Verification',
  skills_evidence: 'Skills Evidence',
  employment_history_clarity: 'Employment History Clarity',
  information_completeness: 'Information Completeness',
  options_comparability: 'Options Comparability',
}

const c = (key: string, label: string, factor: string, weight: number, critical: boolean, test: string): Criterion =>
  ({ key, label, factor, weight, critical, test })

export const FRAMEWORK_CRITERIA: Record<Framework, Criterion[]> = {
  supplier_quotation: [
    c('pricing_transparency', 'Pricing transparency', 'pricing_validation', 3, true, 'all costs itemised, no hidden or unspecified charges'),
    c('fixed_price_period', 'Fixed price period', 'pricing_validation', 1, false, 'a stated period during which prices cannot change ("subject to change without notice" is Unfavorable)'),
    c('price_increase_cap', 'Price increase cap', 'pricing_validation', 1, false, 'a maximum or index-linked cap on later price increases'),
    c('payment_terms', 'Payment terms', 'commercial_terms', 2, true, 'payment schedule, method and conditions (a large advance payment is Unfavorable)'),
    c('cancellation_terms', 'Cancellation terms', 'commercial_terms', 1, false, 'notice periods and exit fees (no right to cancel is Unfavorable)'),
    c('scope_of_supply', 'Scope of supply', 'scope_completeness', 2, true, 'what exactly is supplied: items, specifications, quantities or units'),
    c('delivery_commitment', 'Delivery commitment', 'scope_completeness', 2, true, 'a firm delivery time committed in writing ("estimated", "reasonable efforts" is Partial)'),
    c('late_delivery_penalty', 'Late delivery penalty', 'scope_completeness', 1, false, 'a financial remedy for late delivery'),
    c('warranty_terms', 'Warranty terms', 'risk_clarity', 2, false, 'warranty coverage, claim procedure and response times'),
    c('liability_insurance', 'Liability & insurance', 'risk_clarity', 2, true, 'who bears loss, liability caps, insurance cover (liability excluded or capped very low is Unfavorable)'),
    c('service_levels', 'Service levels & support', 'risk_clarity', 1, false, 'SLA, escalation path, account support'),
    c('past_performance', 'Past performance evidence', 'evidence_quality', 2, false, 'references, case studies, track-record figures ("available on request" is Partial)'),
  ],
  business_proposal: [
    c('deliverables_clarity', 'Deliverables clarity', 'scope_completeness', 3, true, 'specific, measurable deliverables'),
    c('timeline_milestones', 'Timeline & milestones', 'scope_completeness', 2, true, 'a dated plan with milestones that fits the scope'),
    c('resource_plan', 'Resources & team', 'scope_completeness', 1, false, 'named team, roles and resources required'),
    c('cost_breakdown', 'Cost breakdown', 'pricing_validation', 3, true, 'total cost broken down into its parts'),
    c('payment_structure', 'Payment structure', 'commercial_terms', 2, false, 'when and how payments fall due (large upfront payment is Unfavorable)'),
    c('commitments_guarantees', 'Commitments & guarantees', 'commercial_terms', 1, false, 'guarantees, acceptance criteria, remedies'),
    c('roi_evidence', 'ROI / benefit evidence', 'evidence_quality', 2, true, 'claimed benefits backed by data or assumptions that are stated'),
    c('supporting_data', 'Supporting data & references', 'evidence_quality', 2, false, 'references, case studies, third-party validation'),
    c('risk_mitigation', 'Risks & mitigation', 'risk_clarity', 2, false, 'identified risks with a mitigation plan'),
    c('exit_terms', 'Exit / termination terms', 'risk_clarity', 1, false, 'what happens if the project is stopped or underperforms'),
  ],
  contract: [
    c('scope_obligations', 'Scope & obligations', 'key_terms_clarity', 3, true, 'what each party must do, clearly defined'),
    c('term_renewal', 'Term & renewal', 'key_terms_clarity', 1, false, 'duration and renewal (silent auto-renewal is Unfavorable)'),
    c('payment_terms', 'Payment & pricing terms', 'commercial_terms', 2, true, 'price, invoicing and payment conditions'),
    c('price_adjustment', 'Price adjustment', 'commercial_terms', 1, false, 'whether and how prices can change (unilateral change is Unfavorable)'),
    c('liability_cap', 'Liability cap', 'liability_risk_clarity', 3, true, 'liability limits (uncapped liability for the user is Unfavorable)'),
    c('indemnity', 'Indemnities', 'liability_risk_clarity', 2, true, 'who indemnifies whom (one-sided indemnity is Unfavorable)'),
    c('insurance_force_majeure', 'Insurance & force majeure', 'liability_risk_clarity', 1, false, 'insurance requirements and force majeure definition'),
    c('termination_rights', 'Termination rights', 'clause_completeness', 2, true, 'grounds and notice for termination (unilateral termination without notice is Unfavorable)'),
    c('confidentiality_ip', 'Confidentiality & IP', 'clause_completeness', 2, false, 'confidentiality and ownership of work product'),
    c('dispute_resolution', 'Dispute resolution & governing law', 'clause_completeness', 1, false, 'dispute mechanism and governing law'),
    c('schedules_definitions', 'Schedules & definitions', 'evidence_quality', 1, false, 'referenced schedules/annexes are present and key terms are defined'),
  ],
  cv: [
    c('role_requirements_match', 'Match to role requirements', 'role_fit_evidence', 3, true, 'experience and skills that match the Decision Goal role'),
    c('relevant_experience', 'Relevant experience depth', 'role_fit_evidence', 2, true, 'years and depth of directly relevant work'),
    c('quantified_achievements', 'Quantified achievements', 'experience_verification', 2, false, 'outcomes with numbers, scope or results'),
    c('leadership_scope', 'Leadership / scope evidence', 'experience_verification', 1, false, 'team size, budget or scope actually owned'),
    c('skills_demonstrated', 'Skills demonstrated in work', 'skills_evidence', 2, true, 'skills shown in real roles, not only listed'),
    c('qualifications', 'Qualifications & certifications', 'skills_evidence', 1, false, 'degrees, certifications relevant to the role'),
    c('employment_timeline', 'Employment timeline', 'employment_history_clarity', 2, true, 'dated roles with no unexplained gaps (unexplained gaps or inconsistent dates are Unfavorable)'),
    c('tenure_stability', 'Tenure stability', 'employment_history_clarity', 1, false, 'reasonable time in each role (a pattern of very short stints is Unfavorable)'),
    c('verifiability', 'References & verifiable details', 'risk_clarity', 1, false, 'employers, references or details that can be checked'),
  ],
  general: [
    c('key_facts', 'Key facts & scope', 'information_completeness', 3, true, 'what is being offered or decided, clearly stated'),
    c('costs_resources', 'Costs & resources', 'information_completeness', 2, false, 'costs, effort or resources involved'),
    c('commitments', 'Commitments & obligations', 'information_completeness', 2, true, 'what each party commits to'),
    c('supporting_evidence', 'Supporting evidence', 'evidence_quality', 2, false, 'data, references or proof for the main claims'),
    c('comparability', 'Comparable terms across options', 'options_comparability', 1, false, 'terms stated in a way that can be compared with the other documents'),
    c('risks_disclosed', 'Risks disclosed', 'risk_clarity', 2, false, 'risks, limitations or conditions disclosed'),
    c('exit_terms', 'Exit / reversal terms', 'risk_clarity', 1, false, 'how to exit, cancel or reverse the decision'),
  ],
}

/** Frameworks where prices are compared between options. */
const PRICED: ReadonlySet<Framework> = new Set(['supplier_quotation', 'business_proposal', 'general'])

/** How complete and clear the information is — feeds readiness and confidence. */
const INFO_POINTS: Record<CriterionStatus, number> = { Adequate: 100, Unfavorable: 100, Partial: 50, Missing: 0 }
/** How good the term is for the user — feeds the ranking and the verdict. */
const DEAL_POINTS: Record<CriterionStatus, number> = { Adequate: 100, Partial: 50, Missing: 20, Unfavorable: 0 }
/** Share of an option's score that comes from price, by what the goal prioritises. */
const PRICE_WEIGHT: Record<GoalPriority, number> = { lowest_cost: 0.45, balanced: 0.25, lowest_risk: 0.1 }

/** Readiness at or above this, with no critical gap, allows "Proceed". */
export const PROCEED_MIN_READINESS = 70
/** Best option's terms score below this is "Do Not Proceed". */
export const REJECT_MAX_TERMS_SCORE = 35
/** This many Unfavorable critical items on the best option is "Do Not Proceed". */
export const REJECT_CRITICAL_UNFAVORABLE = 2

export interface ChecklistResult {
  key: string
  label: string
  critical: boolean
  status: CriterionStatus
}

export interface OptionAssessment {
  rank: number
  name: string
  /** 0-100, what the ranking is ordered by. */
  score: number
  /** 0-100, quality of the terms alone. */
  terms_score: number
  /** Sum of the prices every option quotes, or null when prices are not comparable. */
  price_total: number | null
  /** 0-100, lowest price = 100. Null when prices are not compared. */
  price_score: number | null
  currency: string
  critical_unfavorable: number
  critical_missing: number
  checklist: ChecklistResult[]
}

export interface DecisionBasis {
  version: 1
  document_type: Framework
  goal_priority: GoalPriority
  price_compared: boolean
  price_items_compared: string[]
  options: OptionAssessment[]
  readiness_factors: { key: string; label: string; score: number }[]
  decision_readiness: number
  overall_decision: OverallDecision
  confidence_score: number
  confidence_breakdown: {
    document_completeness: number
    evidence_consistency: number
    risk_severity: number
    missing_information: number
  }
  decision_strength: number
}

/* ── Assessment request ─────────────────────────────────────────────────── */

function criteriaFor(type: Framework, documentCount: number): Criterion[] {
  // "Comparable across options" cannot be assessed with one document, and
  // would otherwise mark every single-document report as missing information.
  return FRAMEWORK_CRITERIA[type].filter(k => !(k.key === 'comparability' && documentCount < 2))
}

function frameworkOrNull(value: unknown): Framework | null {
  return FRAMEWORKS.includes(value as Framework) ? value as Framework : null
}

/** JSON schema for the assessment step (OpenAI strict structured output). */
export function assessmentSchema(documentNames: string[], requestedType: string) {
  const fixed = frameworkOrNull(requestedType)
  const types = fixed ? [fixed] : [...FRAMEWORKS]
  const keys = [...new Set(types.flatMap(t => FRAMEWORK_CRITERIA[t].map(k => k.key)))]
  const names = [...new Set(documentNames)]
  return {
    name: 'decision_assessment',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['document_type', 'goal_priority', 'options'],
      properties: {
        document_type: { type: 'string', enum: types },
        goal_priority: { type: 'string', enum: [...GOAL_PRIORITIES] },
        options: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'currency', 'price_items', 'checklist'],
            properties: {
              name: { type: 'string', enum: names },
              currency: { type: 'string' },
              price_items: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['item', 'amount'],
                  properties: { item: { type: 'string' }, amount: { type: 'number' } },
                },
              },
              checklist: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['key', 'status'],
                  properties: {
                    key: { type: 'string', enum: keys },
                    status: { type: 'string', enum: [...CRITERION_STATUSES] },
                  },
                },
              },
            },
          },
        },
      },
    },
  }
}

/** System prompt for the assessment step. */
export function assessmentPrompt(requestedType: string, documentCount: number): string {
  const fixed = frameworkOrNull(requestedType)
  const types = fixed ? [fixed] : [...FRAMEWORKS]
  const checklists = types.map(t => {
    const items = criteriaFor(t, documentCount).map(k => `  - ${k.key}: ${k.test}`).join('\n')
    return `${t}:\n${items}`
  }).join('\n\n')

  return `You are the assessment step of a decision-analysis engine. You do NOT write a report and you do NOT recommend anything. You record facts from the documents so a scoring system can compare them. Be literal and consistent: identical wording must always receive the identical status.

STEP 1 — document_type:
${fixed
  ? `The document type is fixed: "${fixed}".`
  : `- "cv": resume, CV or candidate profile
- "supplier_quotation": supplier quotation, vendor offer, price list or procurement document
- "contract": legal contract, agreement or terms and conditions
- "business_proposal": business proposal, investment pitch, project plan or strategic plan
- "general": anything else`}

STEP 2 — goal_priority, from the Decision Goal only:
- "lowest_cost" only when the goal explicitly makes price, cost, budget or savings the main priority.
- "lowest_risk" only when the goal explicitly makes reliability, safety, compliance or risk the main priority.
- otherwise "balanced".

STEP 3 — options: exactly one entry per document, in the order the documents are given, "name" exactly as in its "--- Document N: <name> ---" header.

checklist: every item listed for the document_type below, each exactly once, in the listed order. Status of each item:
- "Adequate": the document states it specifically — a figure, a date, a period, a named procedure or a firm commitment — and what it states is acceptable for the user.
- "Partial": the document addresses it but leaves it open. Choose this ONLY when the document itself hedges: "estimated", "approximately", "target", "typically", "subject to", "to be agreed", "where reasonable", "available on request", a range with no commitment, or only some of what the item asks for.
- "Missing": not addressed anywhere in that document. A document that says nothing about the item is "Missing", never "Partial".
- "Unfavorable": clearly stated, but one-sided or harmful for the user (see the notes in the item). For a CV: the document itself shows a red flag.

Decide each status from the words on the page, never from how good or bad the offer feels overall:
- Wanting more detail than the document gives is not a reason to choose "Partial". If the commitment is specific, it is "Adequate".
- A specific but unwelcome term is "Unfavorable", not "Partial".
- Where two statuses still seem to fit after these tests, choose the earlier one in this order: Unfavorable, Missing, Partial, Adequate.
Judge every item from that document alone — never compare with the other documents. File names, upload order and labels such as "final" or "preferred" are not evidence.

price_items: ${'the prices the document states, one entry per priced item, "amount" as a plain number in the stated currency. Copy amounts; never add, multiply or estimate. Use the SAME short item label for the same product or service in every document (e.g. "A4 paper ream", "Black toner cartridge") so the items can be matched. If a document quotes only one total for the whole scope, use a single item "Total". Leave out optional extras, taxes and delivery charges. Use [] for cv and contract documents, and when no price is stated.'}
currency: ISO code such as "USD", or "" when no price is stated.

CHECKLISTS:
${checklists}`
}

/* ── Scoring ────────────────────────────────────────────────────────────── */

/** File name without extension, lower-cased, for loose name matching. */
function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '')
}

function itemKey(label: string): string {
  return label.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

const round = (n: number) => Math.round(n)
const round1 = (n: number) => Math.round(n * 10) / 10

function weightedAverage(items: { weight: number; points: number }[]): number {
  const total = items.reduce((s, i) => s + i.weight, 0)
  return total === 0 ? 0 : items.reduce((s, i) => s + i.weight * i.points, 0) / total
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Turn the assessment into the decision. Returns null when the assessment is
 * unusable (wrong type, most documents or checklist items absent), in which
 * case the caller falls back to the model's own figures.
 */
export function computeDecisionBasis(
  assessment: any,
  documentNames: string[],
  requestedType: string,
  options: { truncated?: boolean } = {},
): DecisionBasis | null {
  if (!assessment || typeof assessment !== 'object' || documentNames.length === 0) return null

  const type = frameworkOrNull(requestedType) ?? frameworkOrNull(assessment.document_type)
  if (!type) return null
  const criteria = criteriaFor(type, documentNames.length)
  const goalPriority: GoalPriority = GOAL_PRIORITIES.includes(assessment.goal_priority) ? assessment.goal_priority : 'balanced'

  const rawOptions: any[] = Array.isArray(assessment.options) ? assessment.options : []
  const byExact = new Map<string, any>()
  const byKey = new Map<string, any>()
  for (const o of rawOptions) {
    const n = typeof o?.name === 'string' ? o.name : ''
    if (!n) continue
    if (!byExact.has(n)) byExact.set(n, o)
    if (!byKey.has(nameKey(n))) byKey.set(nameKey(n), o)
  }

  const names = [...new Set(documentNames)]
  let unmatched = 0
  const assessed = names.map(name => {
    const raw = byExact.get(name) ?? byKey.get(nameKey(name))
    if (!raw) unmatched++
    const statuses = new Map<string, CriterionStatus>()
    for (const item of Array.isArray(raw?.checklist) ? raw.checklist : []) {
      if (!statuses.has(item?.key) && CRITERION_STATUSES.includes(item?.status)) statuses.set(item.key, item.status)
    }
    const covered = criteria.filter(k => statuses.has(k.key)).length
    const prices = new Map<string, number>()
    for (const p of Array.isArray(raw?.price_items) ? raw.price_items : []) {
      const key = typeof p?.item === 'string' ? itemKey(p.item) : ''
      const amount = Number(p?.amount)
      if (key && Number.isFinite(amount) && amount > 0 && !prices.has(key)) prices.set(key, amount)
    }
    return {
      name,
      found: !!raw,
      covered,
      currency: typeof raw?.currency === 'string' ? raw.currency.trim().toUpperCase() : '',
      prices,
      checklist: criteria.map(k => ({
        key: k.key, label: k.label, critical: k.critical, weight: k.weight, factor: k.factor,
        status: statuses.get(k.key) ?? 'Missing' as CriterionStatus,
      })),
    }
  })

  // An assessment that skipped most documents, or answered for a different
  // checklist, is not a basis for a decision.
  if (unmatched * 2 > names.length) return null
  if (assessed.some(a => a.found && a.covered * 2 < criteria.length)) return null

  // ── Price comparison: only items every option prices, in one currency ──
  let priceCompared = false
  let commonItems: string[] = []
  if (PRICED.has(type) && assessed.length >= 2 && assessed.every(a => a.prices.size > 0)) {
    const currencies = new Set(assessed.map(a => a.currency).filter(Boolean))
    commonItems = [...assessed[0].prices.keys()].filter(k => assessed.every(a => a.prices.has(k))).sort()
    priceCompared = currencies.size <= 1 && commonItems.length > 0
  }
  const totals = assessed.map(a => priceCompared ? commonItems.reduce((s, k) => s + (a.prices.get(k) ?? 0), 0) : null)
  const minTotal = priceCompared ? Math.min(...(totals as number[])) : 0
  const priceWeight = priceCompared ? PRICE_WEIGHT[goalPriority] : 0

  const scored = assessed.map((a, i) => {
    const termsScore = weightedAverage(a.checklist.map(k => ({ weight: k.weight, points: DEAL_POINTS[k.status] })))
    const total = totals[i]
    const priceScore = total !== null && total > 0 ? (100 * minTotal) / total : null
    const score = priceScore === null ? termsScore : termsScore * (1 - priceWeight) + priceScore * priceWeight
    return {
      a,
      score,
      termsScore,
      total,
      priceScore,
      criticalUnfavorable: a.checklist.filter(k => k.critical && k.status === 'Unfavorable').length,
      criticalMissing: a.checklist.filter(k => k.critical && k.status === 'Missing').length,
    }
  })

  // Fully ordered, so equal scores can never swap places between runs.
  scored.sort((x, y) =>
    round1(y.score) - round1(x.score)
    || x.criticalUnfavorable - y.criticalUnfavorable
    || (x.total ?? Infinity) - (y.total ?? Infinity)
    || x.a.name.localeCompare(y.a.name, 'en'))

  const best = scored[0]

  // ── Readiness: how complete the information on the best option is ──
  const factorKeys = [...new Set(best.a.checklist.map(k => k.factor))]
  const readinessFactors = factorKeys.map(factor => ({
    key: factor,
    label: FACTOR_LABELS[factor] ?? factor,
    score: round(weightedAverage(best.a.checklist
      .filter(k => k.factor === factor)
      .map(k => ({ weight: k.weight, points: INFO_POINTS[k.status] })))),
  }))
  // Readiness weighs every checklist item by its own importance, rather than
  // averaging the factor scores.
  //
  // Averaging the factors gave each factor an equal fifth of the number
  // however many items it covers, so "Evidence Quality" — a single item on a
  // supplier quotation — carried as much weight as the three pricing items
  // together. One borderline reading of that one item ("references available
  // on request": Adequate or Partial?) moved Decision Readiness by 10 points
  // between two runs of the same documents, which is what a customer sees as
  // an unstable score. Weighting by the item weights halves that movement and
  // puts it where it belongs: a critical term is worth more than a minor one.
  // The factors are still shown beside the score as the breakdown of where
  // information is thin.
  const decisionReadiness = round(weightedAverage(
    best.a.checklist.map(k => ({ weight: k.weight, points: INFO_POINTS[k.status] })),
  ))

  // ── Verdict ──
  let overallDecision: OverallDecision
  if (best.criticalUnfavorable >= REJECT_CRITICAL_UNFAVORABLE || best.termsScore < REJECT_MAX_TERMS_SCORE) {
    overallDecision = 'Do Not Proceed'
  } else if (best.criticalUnfavorable === 0 && best.criticalMissing === 0 && decisionReadiness >= PROCEED_MIN_READINESS) {
    overallDecision = 'Proceed'
  } else {
    overallDecision = 'Proceed with Caution'
  }

  // ── Confidence in the analysis: how much of the checklist the documents answer ──
  const all = assessed.flatMap(a => a.checklist)
  const present = all.filter(k => k.status !== 'Missing')
  const coverage = all.length ? present.length / all.length : 0
  const clarity = present.length ? present.filter(k => k.status !== 'Partial').length / present.length : 0
  const confidence = Math.max(0, Math.min(100, round(50 + 30 * coverage + 20 * clarity) - (options.truncated ? 10 : 0)))

  const bestCritical = best.a.checklist.filter(k => k.critical)
  const bestMissing = best.a.checklist.filter(k => k.status === 'Missing').length

  // ── Strength of the case for the verdict ──
  const margin = scored.length > 1 ? best.score - scored[1].score : 100
  let decisionStrength: number
  if (overallDecision === 'Proceed') decisionStrength = margin >= 10 ? 5 : 4
  else if (overallDecision === 'Do Not Proceed') decisionStrength = best.criticalUnfavorable >= REJECT_CRITICAL_UNFAVORABLE ? 4 : 3
  else decisionStrength = decisionReadiness >= 60 ? 3 : 2

  return {
    version: 1,
    document_type: type,
    goal_priority: goalPriority,
    price_compared: priceCompared,
    price_items_compared: commonItems,
    options: scored.map((s, i) => ({
      rank: i + 1,
      name: s.a.name,
      score: round(s.score),
      terms_score: round(s.termsScore),
      price_total: s.total === null ? null : round1(s.total),
      price_score: s.priceScore === null ? null : round(s.priceScore),
      currency: s.a.currency,
      critical_unfavorable: s.criticalUnfavorable,
      critical_missing: s.criticalMissing,
      checklist: s.a.checklist.map(k => ({ key: k.key, label: k.label, critical: k.critical, status: k.status })),
    })),
    readiness_factors: readinessFactors,
    decision_readiness: decisionReadiness,
    overall_decision: overallDecision,
    confidence_score: confidence,
    confidence_breakdown: {
      document_completeness: round(coverage * 100),
      evidence_consistency: round(clarity * 100),
      risk_severity: bestCritical.length
        ? round(100 * bestCritical.filter(k => k.status !== 'Unfavorable').length / bestCritical.length)
        : 100,
      missing_information: round(100 * (1 - bestMissing / best.a.checklist.length)),
    },
    decision_strength: decisionStrength,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The computed results, as handed to the report writer. */
export function formatBasisForPrompt(basis: DecisionBasis): string {
  const lines: string[] = [
    'SYSTEM-COMPUTED ASSESSMENT — these values are final. Copy them exactly; write the report to explain them.',
    `document_type: ${basis.document_type}`,
    `overall_decision: ${basis.overall_decision}`,
    `confidence_score: ${basis.confidence_score}`,
    `decision_strength: ${basis.decision_strength}`,
    `decision_readiness: ${basis.decision_readiness}`,
    `readiness_factors: ${basis.readiness_factors.map(f => `{"key":"${f.key}","label":"${f.label}","score":${f.score}}`).join(', ')}`,
    '',
    'ranking (best first — "ranking" must list these names in exactly this order):',
    ...basis.options.map(o => {
      const price = o.price_total !== null ? `, compared price ${o.price_total}${o.currency ? ' ' + o.currency : ''}` : ''
      return `  ${o.rank}. ${o.name} — score ${o.score}/100 (terms ${o.terms_score}${price})`
    }),
  ]
  if (basis.price_compared) {
    lines.push(`Prices compared on the items every option quotes: ${basis.price_items_compared.join(', ')}.`)
  }
  lines.push('', 'Checklist status per option (* = critical item):')
  for (const o of basis.options) {
    lines.push(`  ${o.name}: ${o.checklist.map(k => `${k.label}${k.critical ? '*' : ''}=${k.status}`).join('; ')}`)
  }
  return lines.join('\n')
}
