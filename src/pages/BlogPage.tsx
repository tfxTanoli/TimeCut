import { useState } from 'react'
import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import { useTranslation } from '../hooks/useTranslation'

const CATEGORIES_KEYS = [
  { key: 'blog.catAll', val: 'All' },
  { key: 'blog.catAttention', val: 'Attention' },
  { key: 'blog.catTimeIntelligence', val: 'Time Intelligence' },
  { key: 'blog.catStrategy', val: 'Strategy' },
  { key: 'blog.catFocus', val: 'Focus' },
  { key: 'blog.catDeepWork', val: 'Deep Work' },
  { key: 'blog.catContentCreation', val: 'Content Creation' },
]

export default function BlogPage() {
  const { t } = useTranslation()
  const [activeCategory, setActiveCategory] = useState('All')

  const POSTS = [
    {
      category: 'Attention',
      categoryKey: 'blog.catAttention',
      title: t('blog.post1Title'),
      excerpt: t('blog.post1Excerpt'),
      date: 'May 14, 2025',
      readTime: '6 ' + t('blog.readTime').replace('{n} ', ''),
      emoji: '🧠',
    },
    {
      category: 'Time Intelligence',
      categoryKey: 'blog.catTimeIntelligence',
      title: t('blog.post2Title'),
      excerpt: t('blog.post2Excerpt'),
      date: 'May 8, 2025',
      readTime: '5 ' + t('blog.readTime').replace('{n} ', ''),
      emoji: '🤖',
    },
    {
      category: 'Strategy',
      categoryKey: 'blog.catStrategy',
      title: t('blog.post3Title'),
      excerpt: t('blog.post3Excerpt'),
      date: 'April 29, 2025',
      readTime: '4 ' + t('blog.readTime').replace('{n} ', ''),
      emoji: '📖',
    },
    {
      category: 'Deep Work',
      categoryKey: 'blog.catDeepWork',
      title: t('blog.post4Title'),
      excerpt: t('blog.post4Excerpt'),
      date: 'April 20, 2025',
      readTime: '7 ' + t('blog.readTime').replace('{n} ', ''),
      emoji: '💸',
    },
    {
      category: 'Focus',
      categoryKey: 'blog.catFocus',
      title: t('blog.post5Title'),
      excerpt: t('blog.post5Excerpt'),
      date: 'April 11, 2025',
      readTime: '8 ' + t('blog.readTime').replace('{n} ', ''),
      emoji: '⚔️',
    },
    {
      category: 'Content Creation',
      categoryKey: 'blog.catContentCreation',
      title: t('blog.post6Title'),
      excerpt: t('blog.post6Excerpt'),
      date: 'April 3, 2025',
      readTime: '5 ' + t('blog.readTime').replace('{n} ', ''),
      emoji: '📝',
    },
  ]

  const filteredPosts = activeCategory === 'All'
    ? POSTS
    : POSTS.filter(p => p.category === activeCategory)

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
            <div className="blog-featured">
              <div className="blog-featured-emoji">{featuredPost.emoji}</div>
              <div className="blog-featured-body">
                <div className="blog-meta">
                  <span className="blog-category">{t(featuredPost.categoryKey)}</span>
                  <span className="blog-date">{featuredPost.date}</span>
                  <span className="blog-read">{featuredPost.readTime}</span>
                </div>
                <h2 className="blog-featured-title">{featuredPost.title}</h2>
                <p className="blog-featured-excerpt">{featuredPost.excerpt}</p>
                <span className="coming-soon-badge">{t('blog.comingSoon')}</span>
              </div>
            </div>
          )}

          {gridPosts.length > 0 && (
            <div className="blog-grid">
              {gridPosts.map((post, i) => (
                <div key={i} className="blog-card">
                  <div className="blog-card-emoji">{post.emoji}</div>
                  <div className="blog-meta">
                    <span className="blog-category">{t(post.categoryKey)}</span>
                    <span className="blog-date">{post.date}</span>
                  </div>
                  <h3 className="blog-card-title">{post.title}</h3>
                  <p className="blog-card-excerpt">{post.excerpt}</p>
                  <div className="blog-card-footer">
                    <span className="blog-read">{post.readTime}</span>
                    <span className="coming-soon-badge">{t('blog.comingSoon')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {filteredPosts.length === 0 && (
            <div className="blog-empty">
              <p>No posts in this category yet. Check back soon!</p>
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
          <form className="newsletter-form" onSubmit={e => e.preventDefault()}>
            <input type="email" className="newsletter-input" placeholder={t('blog.emailPlaceholder')} />
            <button type="submit" className="btn-primary btn-cta">{t('blog.subscribe')}</button>
          </form>
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
