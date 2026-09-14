import type { DecisionReport } from '../types'

// Hand-off from the analysis that just finished to its /report/:id page.
//
// A new report is opened at its own address so a refresh reloads it from the
// account instead of dropping the reader back on the upload form. The saved
// copy has everything except the uploaded files themselves, which are what the
// "view original page" links open, so the files for the report that was just
// generated are kept here in memory for the rest of the session. After a
// reload the report loads from Firestore and those links are simply absent.

export interface FreshReport {
  report: DecisionReport
  language: string
  decisionGoal: string
  uploadedFiles: File[]
}

const fresh = new Map<string, FreshReport>()

export function rememberFreshReport(id: string, entry: FreshReport) {
  // Only the latest one: there is no reason to hold earlier uploads in memory.
  fresh.clear()
  fresh.set(id, entry)
}

export function getFreshReport(id: string): FreshReport | null {
  return fresh.get(id) ?? null
}
