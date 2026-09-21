import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'
import { LanguageProvider } from './contexts/LanguageContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
      <Analytics />
    </LanguageProvider>
  </StrictMode>,
)

// The installed app's launch screen (index.html) shows and hides itself in CSS,
// so it is already invisible by the time this runs; this only takes the element
// out of the page afterwards. Nothing here is load-bearing — if it never runs,
// the screen has still gone.
const splash = document.getElementById('app-splash')
if (splash) {
  splash.addEventListener('animationend', () => splash.remove(), { once: true })
  setTimeout(() => splash.remove(), 4000)
}
