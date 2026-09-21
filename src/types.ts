export type Verdict =
  | 'MUST READ'
  | 'SKIM ONLY'
  | 'SKIP IT'
  | 'WORTH A GLANCE'
  | 'LIGHT READ'
  | 'GOOD READ'
  | 'HIGHLY RECOMMENDED'
  | 'DEEP DIVE'
  | 'MASTERPIECE'
  | 'OVERRATED'
  | 'TIME WASTER'
  | 'HIDDEN GEM'
export type AttentionQuality = 'High' | 'Medium' | 'Low'
export type InputTab = 'text' | 'pdf'

export interface TimeCutBreakdown {
  contentQuality: number
  originality: number
  actionability: number
  informationDensity: number
  timeWorthiness: number
}

export interface TimeCutReport {
  verdict: Verdict
  verdict_description: string
  overall_value_score: number
  time_saved_minutes: number
  value_score: number
  attention_quality: AttentionQuality
  attention_quality_description: string
  what_this_is_about: string
  key_insights: string[]
  what_to_skip: string[]
  best_for: string[]
  final_decision: string
  originality_score: number
  evidence_density: number
  repetition_score: number
  insight_uniqueness: number
  breakdown?: TimeCutBreakdown
  /** True when the content was longer than the analysis limit and was cut. */
  content_truncated?: boolean
}

export interface AnalyzeResponse {
  data?: TimeCutReport
  error?: string
  /** Machine-readable failure reason, e.g. INSUFFICIENT_CREDITS. */
  code?: string
}

/* ─────────────────────────────────────────────────────
   Decision Intelligence Types  (Phase 2)
   ───────────────────────────────────────────────────── */

export type RiskSeverity = 'High' | 'Medium' | 'Low'

/**
 * The report's verdict on the deal itself.
 *
 * Distinct from `confidence_score`, which says how sure the analysis is. The
 * Executive Summary used to derive its verdict from that score, which showed a
 * green "Proceed" for any offer whose terms were merely well documented — a
 * thoroughly evidenced bad deal read as a good one.
 */
export type OverallDecision = 'Proceed' | 'Proceed with Caution' | 'Do Not Proceed'

export interface RiskItem {
  description: string
  severity: RiskSeverity
  reasoning?: string[]
}

export interface RankedDocument {
  rank: number
  name: string
  summary: string
}

export interface EvidenceItem {
  section: string
  page?: string
  clause?: string
  confidence?: number
  context?: string
  document?: string
}

export interface MissingInfoItem {
  title: string
  whyItMatters: string
  action: string
  evidence: string
}

export interface ConfidenceBreakdown {
  document_completeness: number
  evidence_consistency: number
  risk_severity: number
  missing_information: number
}

/** One area of decision readiness, e.g. "Pricing Validation: 20". */
export interface ReadinessFactor {
  label: string
  score: number
  /** Stable identifier of the factor, on reports scored by the checklist. */
  key?: string
}

/** One checklist item as assessed for one option. */
export interface ChecklistResult {
  key: string
  label: string
  critical: boolean
  status: 'Adequate' | 'Partial' | 'Missing' | 'Unfavorable'
  /** Readiness factor this item feeds. Absent on reports saved before it was carried. */
  factor?: string
}

/** How one option was scored. */
export interface OptionAssessment {
  rank: number
  name: string
  score: number
  terms_score: number
  price_total: number | null
  price_score: number | null
  currency: string
  critical_unfavorable: number
  critical_missing: number
  checklist: ChecklistResult[]
}

/**
 * What the decision was computed from: the checklist status of every option
 * and the fixed rules applied to it. Absent on reports saved before scoring
 * moved into code, and when the assessment step could not run.
 */
export interface DecisionBasis {
  version: number
  document_type: string
  goal_priority: 'lowest_cost' | 'lowest_risk' | 'balanced'
  price_compared: boolean
  price_items_compared: string[]
  options: OptionAssessment[]
  readiness_factors: ReadinessFactor[]
  decision_readiness: number
  overall_decision: OverallDecision
  confidence_score: number
  confidence_breakdown: ConfidenceBreakdown
  decision_strength: number
}

/** How one option compares with the others. */
export interface OptionTradeoff {
  name: string
  advantage: string
  drawback: string
}

/** Which option wins for a given priority ("Lowest cost → Proposal A"). */
export interface ChooseIfItem {
  priority: string
  option: string
  reason?: string
}

/** "ValueSpark — lower-cost alternative if delivery terms improve." */
export interface AlternativeOption {
  name: string
  condition: string
}

export interface DecisionReport {
  recommendation: string
  /** Verdict on the deal. Server-normalized, so always present on a fresh
   *  report; optional because the UI also derives it defensively. */
  overall_decision?: OverallDecision
  /** One sentence giving the main reason for the verdict. */
  headline_reason?: string
  /** Up to three short reasons behind the verdict. */
  why_points?: string[]
  /** The single most important next step, for the current best option. */
  next_action?: string
  /** A lower-ranked option and what would make it the better choice. Absent
   *  when there is none, and on reports saved before it existed. */
  alternative_option?: AlternativeOption
  option_tradeoffs?: OptionTradeoff[]
  choose_if?: ChooseIfItem[]
  /** What the readiness score is made of. Absent on reports saved before it existed. */
  readiness_factors?: ReadinessFactor[]
  /** Average of `readiness_factors`: whether the reader has enough reliable
   *  information to decide. Distinct from `confidence_score`. */
  decision_readiness?: number
  /** Stated once when the documents look like samples or test material. */
  data_quality_note?: string
  ranking: RankedDocument[]
  confidence_score: number
  confidence_rationale: string
  hidden_risks: RiskItem[]
  missing_information: MissingInfoItem[]
  smart_skeptic_questions: string[]
  decision_defense: string
  evidence_found: EvidenceItem[]
  documents_analyzed: number
  pages_analyzed?: number
  /** Documents too long to analyse in full. Surfaced to the reader — a report
   *  that only saw part of a contract must say so. */
  truncated_documents?: string[]
  /** Uploaded files that were not analysed at all (wrong type, unreadable,
   *  scanned without text), with the reason. Shown before the findings. */
  skipped_documents?: SkippedDocument[]
  what_would_change?: string
  decision_strength?: number
  decision_strength_reason?: string
  compared_categories?: string[]
  confidence_breakdown?: ConfidenceBreakdown
  if_i_were_you?: string
  before_signing_checklist?: string[]
  document_type?: string
  verification_questions?: VerificationQuestion[]
  interview_red_flags?: string[]
  recommended_actions?: RecommendedAction[]
  negotiation_suggestions?: NegotiationSuggestion[]
  weak_evidence?: WeakEvidenceItem[]
  decision_playbook?: DecisionPlaybook
  decision_basis?: DecisionBasis
}

export interface SkippedDocument {
  name: string
  /** English explanation from the server; the fallback when `code` has no translation. */
  reason: string
  /** Machine-readable reason, e.g. `scanned_pdf`. Absent on older saved reports. */
  code?: string
}

export type DocumentType = 'auto' | 'cv' | 'supplier_quotation' | 'contract' | 'business_proposal' | 'general'

export interface VerificationQuestion {
  question: string
  strong_answer_should_include: string[]
  red_flags: string[]
  why_it_matters: string
}

export interface RecommendedAction {
  action: string
  reason: string
  priority: 'High' | 'Medium' | 'Low'
}

export interface NegotiationSuggestion {
  clause: string
  issue: string
  suggested_improvement: string
  leverage?: string
}

export interface WeakEvidenceItem {
  claim: string
  issue: string
  recommendation: string
}

export interface DecisionPlaybook {
  final_recommendation: string
  key_reasons: string[]
  remaining_risks: string[]
  action_checklist: string[]
}

export interface ChallengeAIResponse {
  answer?: string
  error?: string
  code?: string
}

/** Which report sections the caller's plan includes. Returned by the server so
 *  the UI shows an upgrade prompt where a section was withheld, rather than
 *  silently hiding content the plan actually paid for. */
export interface PlanFeatureFlags {
  playbook: boolean
  skepticQuestions: boolean
  export: boolean
  advisor: boolean
}

export interface DecisionAnalyzeResponse {
  data?: DecisionReport
  error?: string
  code?: string
  entitlements?: {
    plan: string
    features: PlanFeatureFlags
    creditsCharged: number
  }
}
