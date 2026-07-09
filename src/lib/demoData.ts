// Shared "sample report" demo data — used by the homepage Live Example section
// and the Examples page (which shows the full report wording for every type).

export const DEMO_TABS = ['supplier', 'hiring', 'contract', 'proposal', 'research'] as const
export type DemoTab = typeof DEMO_TABS[number]

export interface DemoRisk {
  title: string
  level: 'High' | 'Medium' | 'Low'
  whyItMatters: string
  action: string
  evidence: string
}
export interface DemoMissing {
  title: string
  whyItMatters: string
  action: string
  evidence: string
}
export interface DemoData {
  tabLabel: string
  goal: string
  recommendation: string
  confidence: number
  evidenceSummary: string
  risks: DemoRisk[]
  missing: DemoMissing[]
  recReasons: string[]
  decisionReadiness?: number
  decisionDefense?: string
}

export const DEMO_TAB_ICON: Record<DemoTab, string> = {
  supplier: '📦',
  hiring: '👤',
  contract: '📄',
  proposal: '📊',
  research: '🔬',
}

export function buildDemoData(t: (k: string) => string): Record<DemoTab, DemoData> {
  return {
    supplier: {
      tabLabel: t('home.demoSupTab'),
      goal: t('home.demoSupGoal'),
      recommendation: t('home.demoSupRec'),
      confidence: 92,
      evidenceSummary: t('home.demoSupEvidence'),
      risks: [
        { title: t('home.demoSupR1T'), level: 'High', whyItMatters: t('home.demoSupR1W'), action: t('home.demoSupR1A'), evidence: t('home.demoSupR1E') },
        { title: t('home.demoSupR2T'), level: 'High', whyItMatters: t('home.demoSupR2W'), action: t('home.demoSupR2A'), evidence: t('home.demoSupR2E') },
        { title: t('home.demoSupR3T'), level: 'Medium', whyItMatters: t('home.demoSupR3W'), action: t('home.demoSupR3A'), evidence: t('home.demoSupR3E') },
      ],
      missing: [
        { title: t('home.demoSupM1T'), whyItMatters: t('home.demoSupM1W'), action: t('home.demoSupM1A'), evidence: t('home.demoSupM1E') },
        { title: t('home.demoSupM2T'), whyItMatters: t('home.demoSupM2W'), action: t('home.demoSupM2A'), evidence: t('home.demoSupM2E') },
      ],
      recReasons: [t('home.demoSupRea1'), t('home.demoSupRea2'), t('home.demoSupRea3'), t('home.demoSupRea4')],
      decisionDefense: t('home.demoSupDefense'),
    },
    hiring: {
      tabLabel: t('home.demoCvTab'),
      goal: t('home.demoCvGoal'),
      recommendation: t('home.demoCvRec'),
      confidence: 94,
      evidenceSummary: t('home.demoCvEvidence'),
      risks: [
        { title: t('home.demoCvR1T'), level: 'Medium', whyItMatters: t('home.demoCvR1W'), action: t('home.demoCvR1A'), evidence: t('home.demoCvR1E') },
        { title: t('home.demoCvR2T'), level: 'Medium', whyItMatters: t('home.demoCvR2W'), action: t('home.demoCvR2A'), evidence: t('home.demoCvR2E') },
      ],
      missing: [
        { title: t('home.demoCvM1T'), whyItMatters: t('home.demoCvM1W'), action: t('home.demoCvM1A'), evidence: t('home.demoCvM1E') },
      ],
      recReasons: [t('home.demoCvRea1'), t('home.demoCvRea2'), t('home.demoCvRea3'), t('home.demoCvRea4')],
      decisionReadiness: 88,
    },
    contract: {
      tabLabel: t('home.demoContractTab'),
      goal: t('home.demoContractGoal'),
      recommendation: t('home.demoContractRec'),
      confidence: 89,
      evidenceSummary: t('home.demoContractEvidence'),
      risks: [
        { title: t('home.demoContractR1T'), level: 'High', whyItMatters: t('home.demoContractR1W'), action: t('home.demoContractR1A'), evidence: t('home.demoContractR1E') },
        { title: t('home.demoContractR2T'), level: 'High', whyItMatters: t('home.demoContractR2W'), action: t('home.demoContractR2A'), evidence: t('home.demoContractR2E') },
        { title: t('home.demoContractR3T'), level: 'Medium', whyItMatters: t('home.demoContractR3W'), action: t('home.demoContractR3A'), evidence: t('home.demoContractR3E') },
      ],
      missing: [
        { title: t('home.demoContractM1T'), whyItMatters: t('home.demoContractM1W'), action: t('home.demoContractM1A'), evidence: t('home.demoContractM1E') },
      ],
      recReasons: [t('home.demoContractRea1'), t('home.demoContractRea2'), t('home.demoContractRea3'), t('home.demoContractRea4')],
      decisionReadiness: 75,
    },
    proposal: {
      tabLabel: t('home.demoProTab'),
      goal: t('home.demoProGoal'),
      recommendation: t('home.demoProRec'),
      confidence: 81,
      evidenceSummary: t('home.demoProEvidence'),
      risks: [
        { title: t('home.demoProR1T'), level: 'High', whyItMatters: t('home.demoProR1W'), action: t('home.demoProR1A'), evidence: t('home.demoProR1E') },
        { title: t('home.demoProR2T'), level: 'Medium', whyItMatters: t('home.demoProR2W'), action: t('home.demoProR2A'), evidence: t('home.demoProR2E') },
        { title: t('home.demoProR3T'), level: 'Medium', whyItMatters: t('home.demoProR3W'), action: t('home.demoProR3A'), evidence: t('home.demoProR3E') },
      ],
      missing: [
        { title: t('home.demoProM1T'), whyItMatters: t('home.demoProM1W'), action: t('home.demoProM1A'), evidence: t('home.demoProM1E') },
      ],
      recReasons: [t('home.demoProRea1'), t('home.demoProRea2'), t('home.demoProRea3'), t('home.demoProRea4')],
    },
    research: {
      tabLabel: t('home.demoResearchTab'),
      goal: t('home.demoResearchGoal'),
      recommendation: t('home.demoResearchRec'),
      confidence: 93,
      evidenceSummary: t('home.demoResearchEvidence'),
      risks: [
        { title: t('home.demoResearchR1T'), level: 'Medium', whyItMatters: t('home.demoResearchR1W'), action: t('home.demoResearchR1A'), evidence: t('home.demoResearchR1E') },
        { title: t('home.demoResearchR2T'), level: 'Medium', whyItMatters: t('home.demoResearchR2W'), action: t('home.demoResearchR2A'), evidence: t('home.demoResearchR2E') },
      ],
      missing: [],
      recReasons: [t('home.demoResearchRea1'), t('home.demoResearchRea2'), t('home.demoResearchRea3'), t('home.demoResearchRea4')],
    },
  }
}

export const LEVEL_LABEL_KEY: Record<string, string> = { High: 'home.lpLevelHigh', Medium: 'home.lpLevelMedium', Low: 'home.lpLevelLow' }

export const LEVEL_COLOR: Record<string, string> = { High: '#EF4444', Medium: '#FB923C', Low: '#22C55E' }
export const LEVEL_BG: Record<string, string> = {
  High: 'rgba(239,68,68,0.12)',
  Medium: 'rgba(251,146,60,0.12)',
  Low: 'rgba(34,197,94,0.12)',
}
