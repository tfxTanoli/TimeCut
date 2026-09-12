// ── Blog index ───────────────────────────────────────────────────────────────
// The listing and the article page read from this one list, so a post can never
// appear on /blog without being reachable at its own address. Previously the
// posts were defined inline in BlogPage with no slug and no route, so the cards
// were decoration: nothing opened.
//
// Slugs are the URL and are part of the site's SEO surface — once a post is
// published, changing one breaks every inbound link to it. Treat them as fixed.

export interface BlogPost {
  slug: string
  /** Category value, matched against the filter buttons. */
  category: string
  categoryKey: string
  titleKey: string
  excerptKey: string
  /** Body copy, as one string: blank lines separate blocks, `## ` marks a
   *  heading and `- ` a list item. See renderBlogBody in BlogPostPage. */
  bodyKey: string
  /** ISO date, formatted for display in the reader's locale. */
  date: string
  readMinutes: number
  emoji: string
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'hidden-contract-clauses-businesses-miss',
    category: 'Contracts',
    categoryKey: 'blog.catContracts',
    titleKey: 'blog.post1Title',
    excerptKey: 'blog.post1Excerpt',
    bodyKey: 'blog.post1Body',
    date: '2026-06-24',
    readMinutes: 6,
    emoji: '📄',
  },
  {
    slug: 'true-cost-of-a-bad-hire',
    category: 'Hiring',
    categoryKey: 'blog.catHiring',
    titleKey: 'blog.post2Title',
    excerptKey: 'blog.post2Excerpt',
    bodyKey: 'blog.post2Body',
    date: '2026-06-18',
    readMinutes: 5,
    emoji: '🧑‍💼',
  },
  {
    slug: 'compare-supplier-quotations-like-an-expert',
    category: 'Procurement',
    categoryKey: 'blog.catProcurement',
    titleKey: 'blog.post3Title',
    excerptKey: 'blog.post3Excerpt',
    bodyKey: 'blog.post3Body',
    date: '2026-06-10',
    readMinutes: 6,
    emoji: '📦',
  },
  {
    slug: 'ten-questions-before-signing-a-contract',
    category: 'Contracts',
    categoryKey: 'blog.catContracts',
    titleKey: 'blog.post4Title',
    excerptKey: 'blog.post4Excerpt',
    bodyKey: 'blog.post4Body',
    date: '2026-06-02',
    readMinutes: 5,
    emoji: '✅',
  },
  {
    slug: 'why-the-cheapest-quote-costs-most',
    category: 'Procurement',
    categoryKey: 'blog.catProcurement',
    titleKey: 'blog.post5Title',
    excerptKey: 'blog.post5Excerpt',
    bodyKey: 'blog.post5Body',
    date: '2026-05-26',
    readMinutes: 4,
    emoji: '💸',
  },
  {
    slug: 'decision-intelligence-vs-ai-summarization',
    category: 'Decision Intelligence',
    categoryKey: 'blog.catDecisionIntelligence',
    titleKey: 'blog.post6Title',
    excerptKey: 'blog.post6Excerpt',
    bodyKey: 'blog.post6Body',
    date: '2026-05-19',
    readMinutes: 7,
    emoji: '🧠',
  },
  {
    slug: 'hidden-risks-ai-finds-before-you-sign',
    category: 'Risk',
    categoryKey: 'blog.catRisk',
    titleKey: 'blog.post7Title',
    excerptKey: 'blog.post7Excerpt',
    bodyKey: 'blog.post7Body',
    date: '2026-05-12',
    readMinutes: 6,
    emoji: '🔍',
  },
  {
    slug: 'how-ceos-reduce-decision-risk',
    category: 'Risk',
    categoryKey: 'blog.catRisk',
    titleKey: 'blog.post8Title',
    excerptKey: 'blog.post8Excerpt',
    bodyKey: 'blog.post8Body',
    date: '2026-05-05',
    readMinutes: 5,
    emoji: '👔',
  },
  {
    slug: 'psychology-behind-bad-business-decisions',
    category: 'Decision-Making',
    categoryKey: 'blog.catDecisionMaking',
    titleKey: 'blog.post9Title',
    excerptKey: 'blog.post9Excerpt',
    bodyKey: 'blog.post9Body',
    date: '2026-04-28',
    readMinutes: 8,
    emoji: '🧩',
  },
  {
    slug: 'why-evidence-matters-more-than-opinions',
    category: 'Evidence',
    categoryKey: 'blog.catEvidence',
    titleKey: 'blog.post10Title',
    excerptKey: 'blog.post10Excerpt',
    bodyKey: 'blog.post10Body',
    date: '2026-04-21',
    readMinutes: 5,
    emoji: '📊',
  },
]

export function findBlogPost(slug: string | undefined): BlogPost | null {
  if (!slug) return null
  return BLOG_POSTS.find(p => p.slug === slug) ?? null
}

/** The next two posts to offer at the end of an article, newest first. */
export function relatedPosts(post: BlogPost, count = 3): BlogPost[] {
  const sameCategory = BLOG_POSTS.filter(p => p.slug !== post.slug && p.category === post.category)
  const rest = BLOG_POSTS.filter(p => p.slug !== post.slug && p.category !== post.category)
  return [...sameCategory, ...rest].slice(0, count)
}

/** Display date in the reader's locale, falling back to the raw ISO string. */
export function formatPostDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}
