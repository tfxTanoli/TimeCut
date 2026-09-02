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

export interface DecisionReport {
  recommendation: string
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
