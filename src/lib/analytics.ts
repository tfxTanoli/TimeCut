import { track } from '@vercel/analytics'

// ── Conversion events ───────────────────────────────────────────────────────
// Page views alone cannot answer "where do people drop out between landing and
// paying?". These are the funnel steps worth measuring before marketing spend
// starts. They go to Vercel Web Analytics as custom events.
//
// Note: Vercel only records custom events on Pro and Enterprise plans. On a
// Hobby plan `track()` is a silent no-op, so nothing here can break the app —
// but nothing will show up in the dashboard until the plan allows it.

export type ConversionEvent =
  | 'signup'
  | 'checkout_started'
  | 'payment_success'
  | 'analysis_completed'
  | 'upgrade_modal_shown'

type EventProps = Record<string, string | number | boolean | null>

/** Record a funnel event. Never throws — analytics must not affect the product. */
export function trackEvent(name: ConversionEvent, props?: EventProps): void {
  try {
    track(name, props)
  } catch (e) {
    console.warn(`[analytics] could not record ${name}:`, e)
  }
}
