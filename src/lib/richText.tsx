import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

// ── Inline formatting for translated copy ────────────────────────────────────
// Legal and help pages mix prose with bold phrases and links. Keeping those as
// JSX made the text impossible to translate, so the strings live in the i18n
// dictionaries with two tiny markers instead:
//
//   **bold text**          → <strong>
//   [label](/internal)     → router <Link>
//   [label](https://…)     → external link, new tab
//   [label](mailto:…)      → mail link
//
// Nothing else is interpreted, and the text is never injected as HTML.

const TOKEN = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g

export function renderRich(text: string): ReactNode {
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0
    if (start > last) out.push(text.slice(last, start))
    if (m[1] !== undefined) {
      out.push(<strong key={key++}>{m[1]}</strong>)
    } else {
      const label = m[2]
      const href = m[3]
      if (href.startsWith('/')) {
        out.push(<Link key={key++} to={href}>{label}</Link>)
      } else if (href.startsWith('mailto:')) {
        out.push(<a key={key++} href={href}>{label}</a>)
      } else {
        out.push(<a key={key++} href={href} target="_blank" rel="noopener noreferrer">{label}</a>)
      }
    }
    last = start + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <Fragment>{out}</Fragment>
}
