/**
 * The installed app's launch screen (see index.html).
 *
 * The screen itself is pure CSS, so it is on the page before this bundle has
 * even been fetched. This is only the other half: when to take it away.
 *
 * Two rules decide that, and they exist because the customer saw each of them
 * break: it stays until the app has actually rendered, so the fade never
 * uncovers an empty page; and it stays for a minimum time from the start of
 * the navigation, so a fast start still shows the logo instead of flashing it.
 */

/** From the start of the navigation, not from when this module runs. */
const MIN_VISIBLE_MS = 1400
/** Long enough for the fade in index.html, then the element goes. */
const FADE_MS = 320

let dismissed = false

export function dismissLaunchScreen(): void {
  if (dismissed) return
  dismissed = true

  const splash = document.getElementById('app-splash')
  if (!splash) return

  const shown = typeof performance !== 'undefined' ? performance.now() : MIN_VISIBLE_MS
  window.setTimeout(() => {
    document.documentElement.classList.add('app-loaded')
    // On the website the screen is display:none, so no animation runs and no
    // animationend arrives; the timeout is what clears it there.
    splash.addEventListener('animationend', () => splash.remove(), { once: true })
    window.setTimeout(() => splash.remove(), FADE_MS + 200)
  }, Math.max(0, MIN_VISIBLE_MS - shown))
}
