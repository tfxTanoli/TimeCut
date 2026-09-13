import { renderRich } from '../lib/richText'

/** One block of a legal or policy page, already translated. */
export type LegalBlock = { h: string } | { p: string } | { ul: string[] }

/**
 * Renders translated policy copy. Paragraphs and list items may use the
 * `**bold**` and `[label](href)` markers understood by renderRich.
 */
export default function LegalDoc({ blocks }: { blocks: LegalBlock[] }) {
  return (
    <div className="legal-doc">
      {blocks.map((b, i) => {
        if ('h' in b) return <h2 key={i}>{b.h}</h2>
        if ('p' in b) return <p key={i}>{renderRich(b.p)}</p>
        return (
          <ul key={i}>
            {b.ul.map((item, j) => <li key={j}>{renderRich(item)}</li>)}
          </ul>
        )
      })}
    </div>
  )
}
