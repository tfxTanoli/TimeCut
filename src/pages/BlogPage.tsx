import { useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import Footer from '../components/Footer'
import { useTranslation } from '../hooks/useTranslation'
import { BLOG_POSTS, formatPostDate } from '../lib/blogPosts'

const CATEGORIES_KEYS = [
  { key: 'blog.catAll', val: 'All' },
  { key: 'blog.catContracts', val: 'Contracts' },
  { key: 'blog.catHiring', val: 'Hiring' },
  { key: 'blog.catProcurement', val: 'Procurement' },
  { key: 'blog.catDecisionIntelligence', val: 'Decision Intelligence' },
  { key: 'blog.catRisk', val: 'Risk' },
  { key: 'blog.catDecisionMaking', val: 'Decision-Making' },
  { key: 'blog.catEvidence', val: 'Evidence' },
]

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default function BlogPage() {
  const { t } = useTranslation()
  const [activeCategory, setActiveCategory] = useState('All')

  // Newsletter. The form used to be `onSubmit={e => e.preventDefault()}` — it
  // took an address, discarded it, and gave no feedback, so every subscriber
  // was silently lost. Signups are stored keyed by address (so a repeat signup
  // overwrites rather than duplicating) and are readable only by an admin.
  const [email, setEmail] = useState('')
  const [subscribeState, setSubscribeState] =
    useState<'idle' | 'saving' | 'done' | 'invalid' | 'error'>('idle')

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault()
    const clean = email.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(clean) || clean.length > 200) {
      setSubscribeState('invalid')
      return
    }
    setSubscribeState('saving')
    try {
      // The address is the document id, so the collection cannot fill up with
      // duplicates of the same subscriber. Firestore ids may not contain "/".
      await setDoc(doc(db, 'newsletter', encodeURIComponent(clean)), {
        email: clean,
        source: 'blog',
        createdAt: serverTimestamp(),
      }, { merge: true })
      setSubscribeState('done')
      setEmail('')
    } catch (err) {
      console.warn('[newsletter] signup failed:', err)
      setSubscribeState('error')
    }
  }

  const filteredPosts = activeCategory === 'All'
    ? BLOG_POSTS
    : BLOG_POSTS.filter(p => p.category === activeCategory)

  const featuredPost = filteredPosts[0]
  const gridPosts = filteredPosts.slice(1)

  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">{t('blog.badge')}</span>
          <h1 className="page-hero-title">{t('blog.title')}</h1>
          <p className="page-hero-sub">{t('blog.subtitle')}</p>
        </div>
      </section>

      <section className="blog-section">
        <div className="container">
          <div className="blog-categories">
            {CATEGORIES_KEYS.map(c => (
              <button
                key={c.val}
                className={`category-pill ${activeCategory === c.val ? 'category-pill--active' : ''}`}
                onClick={() => setActiveCategory(c.val)}
              >
                {t(c.key)}
              </button>
            ))}
          </div>

          {featuredPost && (
            <Link to={`/blog/${featuredPost.slug}`} className="blog-featured blog-featured--link">
              <div className="blog-featured-emoji" aria-hidden="true">{featuredPost.emoji}</div>
              <div className="blog-featured-body">
                <div className="blog-meta">
                  <span className="blog-category">{t(featuredPost.categoryKey)}</span>
                  <span className="blog-date">{formatPostDate(featuredPost.date)}</span>
                  <span className="blog-read">
                    {t('blog.readTime').replace('{n}', String(featuredPost.readMinutes))}
                  </span>
                </div>
                <h2 className="blog-featured-title">{t(featuredPost.titleKey)}</h2>
                <p className="blog-featured-excerpt">{t(featuredPost.excerptKey)}</p>
                <span className="blog-read-link">{t('blog.readArticle')} →</span>
              </div>
            </Link>
          )}

          {gridPosts.length > 0 && (
            <div className="blog-grid">
              {gridPosts.map(post => (
                <Link key={post.slug} to={`/blog/${post.slug}`} className="blog-card blog-card--link">
                  <div className="blog-card-emoji" aria-hidden="true">{post.emoji}</div>
                  <div className="blog-meta">
                    <span className="blog-category">{t(post.categoryKey)}</span>
                    <span className="blog-date">{formatPostDate(post.date)}</span>
                  </div>
                  <h3 className="blog-card-title">{t(post.titleKey)}</h3>
                  <p className="blog-card-excerpt">{t(post.excerptKey)}</p>
                  <div className="blog-card-footer">
                    <span className="blog-read">
                      {t('blog.readTime').replace('{n}', String(post.readMinutes))}
                    </span>
                    <span className="blog-read-link">{t('blog.readArticle')} →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {filteredPosts.length === 0 && (
            <div className="blog-empty">
              <p>{t('blog.emptyCategory')}</p>
            </div>
          )}
        </div>
      </section>

      <section className="newsletter-section">
        <div className="container newsletter-inner">
          <div>
            <h2 className="newsletter-title">{t('blog.newsletterTitle')}</h2>
            <p className="newsletter-sub">{t('blog.newsletterSub')}</p>
          </div>
          {subscribeState === 'done' ? (
            <p className="newsletter-done">✓ {t('blog.newsletterDone')}</p>
          ) : (
            <form className="newsletter-form" onSubmit={handleSubscribe}>
              <input
                type="email"
                className="newsletter-input"
                placeholder={t('blog.emailPlaceholder')}
                value={email}
                onChange={e => { setEmail(e.target.value); setSubscribeState('idle') }}
                maxLength={200}
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-label={t('blog.emailPlaceholder')}
                required
              />
              <button
                type="submit"
                className="btn-primary btn-cta"
                disabled={subscribeState === 'saving'}
              >
                {subscribeState === 'saving'
                  ? <><span className="btn-spinner" />{t('blog.subscribing')}</>
                  : t('blog.subscribe')}
              </button>
            </form>
          )}
          {subscribeState === 'invalid' && (
            <p className="newsletter-error">{t('blog.newsletterInvalid')}</p>
          )}
          {subscribeState === 'error' && (
            <p className="newsletter-error">{t('blog.newsletterError')}</p>
          )}
        </div>
      </section>

      <section className="page-cta-section">
        <div className="container page-cta-inner">
          <h2>{t('blog.ctaTitle')}</h2>
          <p>{t('blog.ctaSub')}</p>
          <Link to="/" className="btn-primary btn-cta">{t('blog.ctaBtn')}</Link>
        </div>
      </section>

      <Footer />
    </>
  )
}
