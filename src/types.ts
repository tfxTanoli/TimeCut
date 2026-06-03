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
