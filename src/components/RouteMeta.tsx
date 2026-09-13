import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { SITE_NAME, SITE_URL, normalizePath, resolvePageMeta } from '../lib/seo'

/** Find or create a <head> element matching the selector. */
function headElement<K extends 'meta' | 'link' | 'script'>(
  tag: K,
  selector: string,
  attrs: Record<string, string>,
): HTMLElementTagNameMap[K] {
  let el = document.head.querySelector<HTMLElementTagNameMap[K]>(selector)
  if (!el) {
    el = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    document.head.appendChild(el)
  }
  return el
}

function setMeta(attr: 'name' | 'property', key: string, content: string | undefined) {
  const selector = `meta[${attr}="${key}"]`
  if (content === undefined) {
    document.head.querySelector(selector)?.remove()
    return
  }
  headElement('meta', selector, { [attr]: key }).setAttribute('content', content)
}

/**
 * Applies the current route's title, description, canonical and robots
 * directive. Rendered once in App so no page has to remember to do it.
 *
 * Unknown paths get noindex: an SPA answers every URL with HTTP 200, so without
 * this a mistyped link would be indexable as a real page (a "soft 404").
 */
export default function RouteMeta() {
  const { pathname } = useLocation()

  useEffect(() => {
    const meta = resolvePageMeta(pathname)
    const url = `${SITE_URL}${normalizePath(pathname)}`

    document.title = meta.title
    setMeta('name', 'description', meta.description)
    setMeta('property', 'og:title', meta.title)
    setMeta('property', 'og:description', meta.description)

    // A canonical on a noindex page sends mixed signals, so only indexable
    // pages declare one.
    if (meta.noindex) {
      setMeta('name', 'robots', 'noindex')
      document.head.querySelector('link[rel="canonical"]')?.remove()
      setMeta('property', 'og:url', undefined)
    } else {
      setMeta('name', 'robots', undefined)
      headElement('link', 'link[rel="canonical"]', { rel: 'canonical' }).setAttribute('href', url)
      setMeta('property', 'og:url', url)
    }

    const ldSelector = 'script[data-route-jsonld]'
    if (meta.article) {
      const ld = headElement('script', ldSelector, { type: 'application/ld+json', 'data-route-jsonld': '' })
      ld.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: meta.article.headline,
        description: meta.article.description,
        datePublished: meta.article.datePublished,
        mainEntityOfPage: url,
        url,
        author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
        publisher: {
          '@type': 'Organization',
          name: SITE_NAME,
          logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon-512.png` },
        },
      })
    } else {
      document.head.querySelector(ldSelector)?.remove()
    }
  }, [pathname])

  return null
}
