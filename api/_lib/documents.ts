import { inflateRawSync } from 'node:zlib'
import PDFParser from 'pdf2json'
import { toPageMarkedText } from './aiConfig.js'

// ── Uploaded document intake ────────────────────────────────────────────────
// Every uploaded file passes through here before any of it reaches the model
// or the credit ledger. The type is decided from the file's own bytes, never
// from the browser-supplied MIME type or extension alone: a drag-and-drop used
// to skip the picker's filter entirely, and the server then ran
// `buffer.toString('utf-8')` over whatever arrived. A .docx read that way is
// zip binary that easily clears the "not empty" check, so the customer was
// charged for a confident report written about noise.
//
// src/lib/uploads.ts mirrors the limits and accepted extensions for the
// browser. Keep the two in step.

/** Hard ceiling on files per analysis, independent of plan. */
export const MAX_FILES_ABSOLUTE = 10

/**
 * Total upload size per analysis.
 *
 * Vercel rejects a Function request body above 4.5 MB before our code runs,
 * and the browser then sees a bare 413 with no JSON — which the UI could only
 * report as a network error. The multipart envelope adds a little on top of
 * the files themselves, so the budget sits safely under the platform ceiling.
 */
export const MAX_UPLOAD_TOTAL_BYTES = 4 * 1024 * 1024

/** Largest decompressed Word document body we will read (zip-bomb guard). */
const MAX_DOCX_XML_BYTES = 25 * 1024 * 1024

/** Plain-text and Word uploads have no real pages; bill them as the model reads them. */
const CHARS_PER_ESTIMATED_PAGE = 3000

export type DocumentKind = 'pdf' | 'docx' | 'text'

/**
 * A problem with one file that the customer should be told about. `code` lets
 * the UI show the reason in the reader's own language; `message` is the
 * English fallback.
 */
export class DocumentReadError extends Error {
  code: string
  constructor(message: string, code = 'unreadable') {
    super(message)
    this.code = code
  }
}

export interface ExtractedDocument {
  kind: DocumentKind
  text: string
  /** Page count for billing and plan limits (estimated for non-PDF files). */
  pages: number
  /** Characters of real content, excluding any page markers. */
  contentChars: number
}

const UNSUPPORTED = (name: string) =>
  `"${name}" is not a supported file type. Upload PDF, Word (.docx) or plain-text (.txt) files.`

const WORD_OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

/** Identify a file from its content, or say why it cannot be analysed. */
export function classifyUpload(
  name: string,
  buffer: Buffer,
): { kind: DocumentKind } | { rejectReason: string; rejectCode: string } {
  const ext = extensionOf(name)

  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return { kind: 'pdf' }

  // Word 2007+ is a zip container. Only accept it under a .docx name: plenty of
  // other formats (xlsx, pptx, jar, plain zip) share the same signature.
  if (buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50) {
    return ext === '.docx'
      ? { kind: 'docx' }
      : { rejectReason: UNSUPPORTED(name), rejectCode: 'unsupported_type' }
  }

  if (ext === '.doc' || buffer.subarray(0, 8).equals(WORD_OLE_MAGIC)) {
    return {
      rejectReason: `"${name}" is an older Word (.doc) file. Save it as .docx or PDF and upload it again.`,
      rejectCode: 'legacy_doc',
    }
  }

  if (ext === '.txt') {
    // Plain text only if it genuinely decodes as text. NUL bytes or invalid
    // UTF-8 mean a binary file that has been renamed.
    if (buffer.subarray(0, 8192).includes(0)) {
      return { rejectReason: `"${name}" does not contain readable text.`, rejectCode: 'not_text' }
    }
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    } catch {
      return {
        rejectReason: `"${name}" is not valid UTF-8 text. Save it as UTF-8, or upload it as PDF or .docx.`,
        rejectCode: 'not_utf8',
      }
    }
    return { kind: 'text' }
  }

  return { rejectReason: UNSUPPORTED(name), rejectCode: 'unsupported_type' }
}

/** pdf2json's raw text dump for a PDF buffer. */
export function extractRawPdfText(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, true)
    parser.on('pdfParser_dataReady', () => resolve(parser.getRawTextContent()))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parser.on('pdfParser_dataError', (errData: any) => {
      // pdf2json emits { parserError: string } — not an Error instance
      const raw = errData?.parserError ?? errData
      reject(new Error(typeof raw === 'string' ? raw : String(raw)))
    })
    parser.parseBuffer(buffer)
  })
}

/* ── .docx ──────────────────────────────────────────────────────────────────
   A .docx is a zip archive whose body text lives in word/document.xml. Reading
   that one entry needs the zip central directory and an inflate, both of which
   Node already ships — so no parsing dependency is added to the serverless
   bundle for it. Zip64 is not handled: it only appears above 4 GB, far beyond
   MAX_UPLOAD_TOTAL_BYTES.
*/

class EncryptedDocxError extends Error {}

function readZipEntry(zip: Buffer, entryName: string): Buffer | null {
  const EOCD_SIGNATURE = 0x06054b50
  const searchFloor = Math.max(0, zip.length - 0xffff - 22)
  let eocd = -1
  for (let i = zip.length - 22; i >= searchFloor; i--) {
    if (zip.readUInt32LE(i) === EOCD_SIGNATURE) { eocd = i; break }
  }
  if (eocd === -1) return null

  const entryCount = zip.readUInt16LE(eocd + 10)
  let p = zip.readUInt32LE(eocd + 16)

  for (let n = 0; n < entryCount; n++) {
    if (p + 46 > zip.length || zip.readUInt32LE(p) !== 0x02014b50) return null
    const flags = zip.readUInt16LE(p + 8)
    const method = zip.readUInt16LE(p + 10)
    const compressedSize = zip.readUInt32LE(p + 20)
    const nameLen = zip.readUInt16LE(p + 28)
    const extraLen = zip.readUInt16LE(p + 30)
    const commentLen = zip.readUInt16LE(p + 32)
    const localOffset = zip.readUInt32LE(p + 42)
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString('utf8')

    if (name === entryName) {
      if (flags & 0x1) throw new EncryptedDocxError()
      if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== 0x04034b50) return null
      const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28)
      const data = zip.subarray(dataStart, dataStart + compressedSize)
      if (method === 0) return data
      if (method === 8) return inflateRawSync(data, { maxOutputLength: MAX_DOCX_XML_BYTES })
      return null
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  return null
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeXmlText(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const hex = code[1] === 'x' || code[1] === 'X'
      const cp = hex ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : match
    }
    return XML_ENTITIES[code.toLowerCase()] ?? match
  })
}

/** Plain text of a .docx body: one line per paragraph, tabs and breaks kept. */
export function extractDocxText(buffer: Buffer): string {
  const xml = readZipEntry(buffer, 'word/document.xml')
  if (!xml) throw new Error('word/document.xml not found')

  const withBreaks = xml.toString('utf8')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:(?:br|cr)\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')

  return decodeXmlText(withBreaks)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function estimatePages(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_ESTIMATED_PAGE))
}

/**
 * Turn one upload into analysable text. Throws DocumentReadError with a
 * customer-facing message when the file is the wrong type, unreadable, or
 * has no usable text.
 */
export async function extractDocument(name: string, buffer: Buffer): Promise<ExtractedDocument> {
  const classified = classifyUpload(name, buffer)
  if ('rejectReason' in classified) throw new DocumentReadError(classified.rejectReason, classified.rejectCode)

  switch (classified.kind) {
    case 'pdf': {
      let raw: string
      try {
        raw = await extractRawPdfText(buffer)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(`[documents] PDF parse failed for "${name}":`, msg)
        throw new DocumentReadError(`"${name}" could not be read as a PDF. It may be damaged or password-protected.`, 'unreadable_pdf')
      }
      const marked = toPageMarkedText(raw)
      // Measured without the [PAGE n] markers, so a scanned PDF whose only
      // output is page headers is still recognised as empty.
      if (marked.contentChars < 50) {
        throw new DocumentReadError(`"${name}" has no extractable text — it looks like a scanned or image-only PDF. Upload a PDF with selectable text.`, 'scanned_pdf')
      }
      return { kind: 'pdf', text: marked.text, pages: marked.pages, contentChars: marked.contentChars }
    }

    case 'docx': {
      let text: string
      try {
        text = extractDocxText(buffer)
      } catch (e) {
        if (e instanceof EncryptedDocxError) {
          throw new DocumentReadError(`"${name}" is password-protected. Remove the password and upload it again.`, 'encrypted')
        }
        console.warn(`[documents] DOCX parse failed for "${name}":`, e instanceof Error ? e.message : e)
        throw new DocumentReadError(`"${name}" could not be read as a Word document. Try saving it again as .docx or PDF.`, 'unreadable_docx')
      }
      if (text.length < 20) throw new DocumentReadError(`"${name}" appears to be empty.`, 'empty')
      return { kind: 'docx', text, pages: estimatePages(text), contentChars: text.length }
    }

    case 'text': {
      // Strip a UTF-8 byte-order mark, which some editors put at the start.
      const decoded = buffer.toString('utf-8')
      const text = (decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded).trim()
      if (text.length < 20) throw new DocumentReadError(`"${name}" appears to be empty.`, 'empty')
      return { kind: 'text', text, pages: estimatePages(text), contentChars: text.length }
    }
  }
}
