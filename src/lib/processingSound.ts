// Subtle audio feedback while a report is being generated.
//
// An analysis keeps the reader waiting 30-60 seconds, and a silent screen reads
// as a stalled one — especially once they glance at another tab. A soft pulse
// says "still working" and a short chime says "done". Everything is synthesised
// with the Web Audio API, so there is no audio file to download, and the
// reader's on/off choice is remembered.

const PREF_KEY = 'tc-processing-sound'

let ctx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    if (!ctx) ctx = new Ctor()
  } catch {
    return null
  }
  return ctx
}

export function isProcessingSoundEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setProcessingSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
  } catch { /* private mode — the choice just is not remembered */ }
}

/**
 * Unlock audio. Must be called synchronously inside the click that starts the
 * analysis: browsers (Safari in particular) only allow sound to start from a
 * user gesture, and by the time the loader mounts that gesture has passed.
 */
export function primeProcessingSound() {
  if (!isProcessingSoundEnabled()) return
  const c = getContext()
  if (c && c.state === 'suspended') c.resume().catch(() => {})
}

/** One soft sine note with a gentle attack and fade, so it never clicks. */
function tone(c: AudioContext, freq: number, start: number, duration: number, peak: number) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.05)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain).connect(c.destination)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

/** A quiet two-note pulse every few seconds. Returns a function that stops it. */
export function startProcessingSound(): () => void {
  let stopped = false

  const pulse = () => {
    if (stopped || !isProcessingSoundEnabled()) return
    const c = getContext()
    if (!c) return
    if (c.state === 'suspended') { c.resume().catch(() => {}); return }
    const now = c.currentTime
    tone(c, 392, now, 0.5, 0.022)
    tone(c, 523.25, now + 0.18, 0.55, 0.016)
  }

  const first = window.setTimeout(pulse, 500)
  const interval = window.setInterval(pulse, 2800)
  return () => {
    stopped = true
    window.clearTimeout(first)
    window.clearInterval(interval)
  }
}

/** A short rising chime when the report is ready. */
export function playCompletionChime() {
  if (!isProcessingSoundEnabled()) return
  const c = getContext()
  if (!c || c.state !== 'running') return
  const now = c.currentTime
  tone(c, 659.25, now, 0.4, 0.045)
  tone(c, 880, now + 0.15, 0.7, 0.04)
}
