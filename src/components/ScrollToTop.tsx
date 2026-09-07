import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export default function ScrollToTop() {
  const { pathname, hash, key } = useLocation()

  useEffect(() => {
    // A hash target beats the reset to the top: navigating to /#upload-section
    // (how the post-payment "Start Analyzing" button hands the customer
    // straight to the upload box) must land on that section, not page top.
    // The element may not be mounted on the first frame after a route change,
    // so retry on the next frame before giving up and scrolling to the top.
    if (hash) {
      const id = decodeURIComponent(hash.slice(1))
      const scrollToTarget = () => {
        const el = document.getElementById(id)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          return true
        }
        return false
      }
      if (scrollToTarget()) return
      const raf = requestAnimationFrame(() => {
        if (!scrollToTarget()) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
      })
      return () => cancelAnimationFrame(raf)
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, hash, key])

  return null
}
