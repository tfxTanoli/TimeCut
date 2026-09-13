// ── Per-route search metadata ────────────────────────────────────────────────
// The app is a client-rendered SPA: every URL is served the same index.html, so
// titles, descriptions, canonicals and robots directives are applied here after
// the route resolves. Google renders JavaScript and reads the result.
//
// Copy is English because URLs are not localized — the UI language lives in
// localStorage, so crawlers only ever see the English site.

import { findBlogPost } from './blogPosts'
import { t } from '../i18n'

/** The live host. The apex domain 308-redirects here. */
export const SITE_URL = 'https://www.timecut.online'
export const SITE_NAME = 'TimeCut'

export interface PageMeta {
  title: string
  description?: string
  /** Pages that should not appear in search: private, transactional, or missing. */
  noindex?: boolean
  /** Article structured data, for blog posts. */
  article?: { headline: string; description: string; datePublished: string }
}

const STATIC_META: Record<string, PageMeta> = {
  '/': {
    title: 'TimeCut: AI Risk Discovery for Contracts, Quotes & CVs',
    description: "Upload contracts, supplier quotations, CVs and proposals. TimeCut's AI finds hidden risks, missing information and weak evidence before you decide.",
  },
  '/how-it-works': {
    title: 'How TimeCut Works: Upload to Decision Report in 5 Steps',
    description: 'Upload your documents and set a decision goal. TimeCut investigates them for hidden risks and missing information, then delivers an Executive Decision Package.',
  },
  '/features': {
    title: 'TimeCut Features: Hidden Risks, Evidence & Decision Reports',
    description: 'One report with every insight you need before you sign, hire, approve, invest, or decide: hidden risks, missing information, evidence and questions to ask.',
  },
  '/examples': {
    title: 'TimeCut Examples: Sample AI Risk Reports',
    description: 'See sample TimeCut reports for supplier quotes, hiring, contracts, proposals and research, with the hidden risks and missing information each one found.',
  },
  '/pricing': {
    title: 'TimeCut Pricing: Start Free, Upgrade When You Need',
    description: 'Start free with no credit card required. Compare TimeCut plans for AI document risk analysis and upgrade when you need more documents and credits.',
  },
  '/blog': {
    title: 'TimeCut Blog: Contracts, Hiring & Business Decision Risk',
    description: 'Insights on hidden risks, evidence, and how to decide with confidence before you sign, hire, or invest.',
  },
  '/faq': {
    title: 'TimeCut FAQ: How It Works, Pricing & Your Data',
    description: 'Everything about how TimeCut analyzes your documents, what it costs, and how your data is handled.',
  },
  '/about': {
    title: 'About TimeCut | AI Decision Intelligence Platform',
    description: 'Why TimeCut exists: an AI platform that finds hidden risks, missing information and weak evidence in your documents before you sign, hire, invest or approve.',
  },
  '/security': {
    title: 'Security at TimeCut',
    description: 'How TimeCut handles and protects the documents you upload for analysis.',
  },
  '/contact': {
    title: 'Contact TimeCut: Questions, Feedback & Feature Requests',
    description: "Have a question, idea, or feedback about TimeCut? Send us a message and we'll get back to you.",
  },
  '/privacy': {
    title: 'Privacy Policy | TimeCut',
    description: 'How TimeCut collects, uses and protects your personal data and uploaded documents.',
  },
  '/terms': {
    title: 'Terms of Service | TimeCut',
    description: 'The terms that govern your use of TimeCut and its AI document analysis services.',
  },
  // Utility and private routes: reachable, but nothing a searcher should land on.
  '/login':       { title: 'Log in | TimeCut', noindex: true },
  '/get-started': { title: 'Get Started | TimeCut', noindex: true },
  '/profile':     { title: 'Your Account | TimeCut', noindex: true },
  '/admin':       { title: 'Admin | TimeCut', noindex: true },
}

const NOT_FOUND: PageMeta = { title: 'Page Not Found | TimeCut', noindex: true }

/** Strip a trailing slash so /pricing/ and /pricing share one canonical. */
export function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
}

export function resolvePageMeta(pathname: string): PageMeta {
  const path = normalizePath(pathname)

  if (STATIC_META[path]) return STATIC_META[path]

  if (path.startsWith('/report/')) {
    return { title: 'Decision Report | TimeCut', noindex: true }
  }

  const blogMatch = path.match(/^\/blog\/([^/]+)$/)
  if (blogMatch) {
    const post = findBlogPost(blogMatch[1])
    if (!post) return NOT_FOUND
    const headline = t('English', post.titleKey)
    const description = t('English', post.excerptKey)
    const suffixed = `${headline} | ${SITE_NAME}`
    return {
      // Front-load the article title; drop the brand if it would push past ~60.
      title: suffixed.length <= 60 ? suffixed : headline,
      description,
      article: { headline, description, datePublished: post.date },
    }
  }

  return NOT_FOUND
}
