// ── Upload limits (browser side) ─────────────────────────────────────────────
// Mirrors api/_lib/documents.ts, which is the real enforcement point: the
// server identifies every file from its bytes and refuses anything else. These
// checks exist so a customer finds out immediately, in their own language,
// instead of after an upload the server — or Vercel itself — would refuse.

/** What the file picker offers. Legacy .doc is deliberately absent. */
export const UPLOAD_ACCEPT = [
  '.pdf', 'application/pdf',
  '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt', 'text/plain',
].join(',')

/**
 * Total bytes per analysis. Vercel refuses a Function request body above
 * 4.5 MB before our code runs; this leaves room for the multipart envelope.
 * Keep equal to MAX_UPLOAD_TOTAL_BYTES in api/_lib/documents.ts.
 */
export const MAX_UPLOAD_TOTAL_BYTES = 4 * 1024 * 1024

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt']

export type UploadRejection = 'type' | 'legacyDoc'

/** Why a file cannot be uploaded, or null when it is acceptable. */
export function uploadRejection(file: File): UploadRejection | null {
  const name = file.name.toLowerCase()
  if (name.endsWith('.doc')) return 'legacyDoc'
  return ACCEPTED_EXTENSIONS.some(ext => name.endsWith(ext)) ? null : 'type'
}

/** Human-readable megabytes, e.g. 4 MB. */
export function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`
}
