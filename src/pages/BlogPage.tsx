import { Link } from 'react-router-dom'
import Footer from '../components/Footer'

const POSTS = [
  {
    category: 'Attention',
    title: 'Why Most Content Is a Waste of Your Time',
    excerpt: 'Studies show the average knowledge worker reads 10+ pieces of content daily. Less than 20% of it changes how they think or act. Here\'s the hidden cost.',
    date: 'May 14, 2025',
    readTime: '6 min read',
    emoji: '🧠',
  },
  {
    category: 'Time Intelligence',
    title: 'How the Time Intelligence Engine Helps You Reclaim Your Focus',
    excerpt: 'The information age promised us access to everything. It delivered overwhelm instead. Time Intelligence filters are becoming the new inbox zero.',
    date: 'May 8, 2025',
    readTime: '5 min read',
    emoji: '🤖',
  },
  {
    category: 'Strategy',
    title: 'SKIM vs. SKIP: How to Decide When to Abandon Content',
    excerpt: 'Not every piece of content deserves full attention, but some deserve at least a skim. Learn the framework for making that call in under 30 seconds.',
    date: 'April 29, 2025',
    readTime: '4 min read',
    emoji: '📖',
  },
  {
    category: 'Deep Work',
    title: 'The Hidden Cost of Information Overload',
    excerpt: 'Beyond time lost, consuming low-quality content degrades your ability to think clearly. The cognitive tax of bad content is rarely discussed.',
    date: 'April 20, 2025',
    readTime: '7 min read',
    emoji: '💸',
  },
  {
    category: 'Attention',
    title: 'The Attention Economy and How to Win',
    excerpt: 'Every app, article, and email is competing for your attention. Most of them deserve none of it. A guide to reclaiming your mental bandwidth.',
    date: 'April 11, 2025',
    readTime: '8 min read',
    emoji: '⚔️',
  },
  {
    category: 'Strategy',
    title: 'Building a Time-Aware Content Strategy',
    excerpt: 'If you create content, the question isn\'t just "is this good?" It\'s "is this worth someone\'s time?" A new lens for content creators.',
    date: 'April 3, 2025',
    readTime: '5 min read',
    emoji: '📝',
  },
]

const CATEGORIES = ['All', 'Attention', 'Time Intelligence', 'Strategy', 'Deep Work']

export default function BlogPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">Time Intelligence Blog</span>
          <h1 className="page-hero-title">Think Smarter About<br />What You Read</h1>
          <p className="page-hero-sub">
            Insights on attention, time, and how to protect what matters most: your focus.
          </p>
        </div>
      </section>

      <section className="blog-section">
        <div className="container">
          <div className="blog-categories">
            {CATEGORIES.map(c => (
              <button key={c} className={`category-pill ${c === 'All' ? 'category-pill--active' : ''}`}>
                {c}
              </button>
            ))}
          </div>

          <div className="blog-featured">
            <div className="blog-featured-emoji">{POSTS[0].emoji}</div>
            <div className="blog-featured-body">
              <div className="blog-meta">
                <span className="blog-category">{POSTS[0].category}</span>
                <span className="blog-date">{POSTS[0].date}</span>
                <span className="blog-read">{POSTS[0].readTime}</span>
              </div>
              <h2 className="blog-featured-title">{POSTS[0].title}</h2>
              <p className="blog-featured-excerpt">{POSTS[0].excerpt}</p>
              <button className="btn-outline">Read Article</button>
            </div>
          </div>

          <div className="blog-grid">
            {POSTS.slice(1).map((post, i) => (
              <div key={i} className="blog-card">
                <div className="blog-card-emoji">{post.emoji}</div>
                <div className="blog-meta">
                  <span className="blog-category">{post.category}</span>
                  <span className="blog-date">{post.date}</span>
                </div>
                <h3 className="blog-card-title">{post.title}</h3>
                <p className="blog-card-excerpt">{post.excerpt}</p>
                <div className="blog-card-footer">
                  <span className="blog-read">{post.readTime}</span>
                  <button className="blog-read-link">Read</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="newsletter-section">
        <div className="container newsletter-inner">
          <div>
            <h2 className="newsletter-title">Time Intelligence Weekly</h2>
            <p className="newsletter-sub">One email per week. Only the content that's worth your time, pre-screened by TimeCut.</p>
          </div>
          <form className="newsletter-form" onSubmit={e => e.preventDefault()}>
            <input type="email" className="newsletter-input" placeholder="Enter your email..." />
            <button type="submit" className="btn-primary btn-cta">Subscribe</button>
          </form>
        </div>
      </section>

      <section className="page-cta-section">
        <div className="container page-cta-inner">
          <h2>Try TimeCut on Any Article</h2>
          <p>Paste any content and get your intelligence report in seconds.</p>
          <Link to="/" className="btn-primary btn-cta">Start Analyzing</Link>
        </div>
      </section>

      <Footer />
    </>
  )
}
