import { Link, useParams } from 'react-router-dom'
import Footer from '../components/Footer'
import { useTranslation } from '../hooks/useTranslation'
import { BLOG_POSTS, findBlogPost, formatPostDate, relatedPosts } from '../lib/blogPosts'

/**
 * A single blog article.
 *
 * The listing used to render ten cards that opened nothing: there was no route
 * and no click handler, so every post was decoration. Each post now has a
 * stable slug and its own address, which is also what makes the blog usable as
 * an SEO surface at all.
 */

/**
 * Render the article body.
 *
 * Bodies are stored as one translated string per post. Blank lines separate
 * blocks; `## ` opens a heading; a run of lines starting `- ` or `1. ` becomes a
 * list. Deliberately not Markdown-via-a-library: this is the whole syntax the
 * content uses, and `**bold**` is the only inline mark, so a 40-line renderer
 * avoids shipping a parser (and an HTML sink) to every reader.
 */
function renderBody(body: string): React.ReactNode[] {
  const blocks = body.split(/\n{2,}/)

  return blocks.map((block, i) => {
    const trimmed = block.trim()
    if (!trimmed) return null

    // A heading and the prose under it sit on consecutive lines in the source,
    // so the heading owns only its own line — the rest of the block is the
    // paragraph that follows it. Rendering the whole block as an <h2> turned
    // every section into one giant heading.
    if (trimmed.startsWith('## ')) {
      const [headingLine, ...rest] = trimmed.split('\n')
      const body = rest.join('\n').trim()
      return (
        <div key={i}>
          <h2 className="blog-article-h2">{inline(headingLine.slice(3))}</h2>
          {body && renderBody(body)}
        </div>
      )
    }

    const lines = trimmed.split('\n')

    if (lines.every(l => l.trim().startsWith('- '))) {
      return (
        <ul key={i} className="blog-article-list">
          {lines.map((l, j) => <li key={j}>{inline(l.trim().slice(2))}</li>)}
        </ul>
      )
    }

    if (lines.every(l => /^\d+\.\s/.test(l.trim()))) {
      return (
        <ol key={i} className="blog-article-list">
          {lines.map((l, j) => <li key={j}>{inline(l.trim().replace(/^\d+\.\s/, ''))}</li>)}
        </ol>
      )
    }

    return <p key={i} className="blog-article-p">{inline(trimmed)}</p>
  }).filter(Boolean)
}

/** Split on `**bold**` and return the pieces. No HTML is ever constructed. */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>,
  )
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>()
  const { t } = useTranslation()
  const post = findBlogPost(slug)

  if (!post) {
    return (
      <>
        <section className="page-hero">
          <div className="container page-hero-inner">
            <span className="hero-badge">{t('blog.badge')}</span>
            <h1 className="page-hero-title">{t('blog.postNotFoundTitle')}</h1>
            <p className="page-hero-sub">{t('blog.postNotFoundSub')}</p>
            <div style={{ marginTop: 28 }}>
              <Link to="/blog" className="btn-primary btn-cta">{t('blog.backToBlog')}</Link>
            </div>
          </div>
        </section>
        <Footer />
      </>
    )
  }

  const related = relatedPosts(post)

  return (
    <>
      <article className="blog-article">
        <div className="container blog-article-inner">
          <Link to="/blog" className="blog-article-back">{t('blog.backToBlog')}</Link>

          <header className="blog-article-header">
            <span className="blog-category">{t(post.categoryKey)}</span>
            <h1 className="blog-article-title">{t(post.titleKey)}</h1>
            <p className="blog-article-meta">
              <time dateTime={post.date}>{formatPostDate(post.date)}</time>
              {' · '}
              {t('blog.readTime').replace('{n}', String(post.readMinutes))}
            </p>
            <p className="blog-article-lede">{t(post.excerptKey)}</p>
          </header>

          <div className="blog-article-body">
            {renderBody(t(post.bodyKey))}
          </div>

          <aside className="blog-article-cta">
            <h2 className="blog-article-cta-title">{t('blog.articleCtaTitle')}</h2>
            <p className="blog-article-cta-sub">{t('blog.articleCtaSub')}</p>
            <Link to="/#upload-section" className="btn-primary btn-cta">{t('blog.ctaBtn')}</Link>
          </aside>

          {related.length > 0 && (
            <section className="blog-article-related">
              <h2 className="blog-article-h2">{t('blog.relatedTitle')}</h2>
              <div className="blog-related-grid">
                {related.map(r => (
                  <Link key={r.slug} to={`/blog/${r.slug}`} className="blog-related-card">
                    <span className="blog-related-emoji" aria-hidden="true">{r.emoji}</span>
                    <span className="blog-related-text">
                      <span className="blog-category">{t(r.categoryKey)}</span>
                      <span className="blog-related-title">{t(r.titleKey)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </article>
      <Footer />
    </>
  )
}

/** Exported so the listing and the sitemap generator agree on the post set. */
export { BLOG_POSTS }
