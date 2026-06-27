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
}

export interface AnalyzeResponse {
  data?: TimeCutReport
  error?: string
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
  what_would_change?: string
  decision_strength?: number
  decision_strength_reason?: string
  compared_categories?: string[]
  confidence_breakdown?: ConfidenceBreakdown
  if_i_were_you?: string
  before_signing_checklist?: string[]
}

export interface ChallengeAIResponse {
  answer?: string
  error?: string
}

export interface DecisionAnalyzeResponse {
  data?: DecisionReport
  error?: string
}
