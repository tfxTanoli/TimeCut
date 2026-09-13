import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const SITE_URL = 'https://www.timecut.online'

// Indexable static routes. Keep in step with STATIC_META in src/lib/seo.ts —
// private and utility routes (login, profile, admin, reports) are left out.
const SITEMAP_ROUTES = [
  '/', '/how-it-works', '/features', '/examples', '/pricing', '/blog',
  '/faq', '/about', '/security', '/contact', '/privacy', '/terms',
]

/**
 * Emits sitemap.xml at build time, reading blog slugs and dates straight from
 * src/lib/blogPosts.ts so a new post can never be missing from the sitemap.
 * Static pages carry no <lastmod>: there is no honest date to give them.
 */
function sitemap(): Plugin {
  return {
    name: 'timecut-sitemap',
    apply: 'build',
    generateBundle() {
      const source = readFileSync(new URL('./src/lib/blogPosts.ts', import.meta.url), 'utf8')
      const posts = [...source.matchAll(/slug:\s*'([^']+)'[\s\S]*?date:\s*'(\d{4}-\d{2}-\d{2})'/g)]
        .map(m => ({ slug: m[1], date: m[2] }))
      if (posts.length === 0) this.error('sitemap: no blog posts parsed from src/lib/blogPosts.ts')

      const entries = [
        ...SITEMAP_ROUTES.map(path => `  <url><loc>${SITE_URL}${path}</loc></url>`),
        ...posts.map(p => `  <url><loc>${SITE_URL}/blog/${p.slug}</loc><lastmod>${p.date}</lastmod></url>`),
      ]
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), sitemap()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
