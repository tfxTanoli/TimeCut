import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { getCachedPlanConfig, getPlanConfig, formatPrice, type PlanConfig } from '../lib/planConfig'
import { authHeaders } from '../lib/firebase'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string)

const UNLIMITED = 9999

/**
 * Plan copy only. Every number (price, credits, document limits) is read from
 * the shared plan config (config/plans in Firestore, editable from the Admin
 * Dashboard) so this modal can never disagree with the pricing page.
 */
// Self-serve plans only, and every line here must match the pricing page. The
// previous version listed Priority Processing and a PDF export that the product
// did not implement, and a Business tier that this modal could charge for.
const PLAN_META: Record<string, { label: string; tagline: string; features: string[] }> = {
  starter: {
    label: 'STARTER',
    tagline: 'Full analysis depth for individuals',
    features: [
      '{credits} AI Credits/month',
      'Up to {docs} documents per analysis',
      'Full AI Decision Report',
      'Hidden Risks & Missing Information',
      'Evidence Found & Document Ranking',
      'Decision Playbook',
      'Smart Skeptic Questions',
      'Print / Save as PDF',
    ],
  },
  pro: {
    label: 'PRO',
    tagline: 'Deeper intelligence and stronger decisions',
    features: [
      '{credits} AI Credits/month',
      'Up to {docs} documents per analysis',
      'Everything in Starter',
      'Unlimited Decision Assistant (within credits)',
      '"If I Were You" personal advisor',
      'Decision Defense',
    ],
  },
}

/** Resolve a plan's display copy against the live config. */
function planDetails(plan: string, cfg: PlanConfig, amountCents?: number | null) {
  const meta = PLAN_META[plan]
  const limits = cfg.plans[plan as keyof PlanConfig['plans']]
  // Prefer the amount the server is actually charging; fall back to the config.
  const cents = typeof amountCents === 'number' ? amountCents : limits?.priceCents ?? null
  const credits = limits?.credits
  const docs = limits?.maxDocs

  return {
    label: meta.label,
    tagline: meta.tagline,
    price: cents == null ? 'Custom' : `${formatPrice(cents)}/month`,
    features: meta.features.map(f => f
      .replace('{credits}', credits == null ? 'Custom' : credits.toLocaleString())
      .replace('{docs}', docs == null || docs >= UNLIMITED ? 'unlimited' : String(docs))),
  }
}

/* ─── Inner checkout form (must be inside <Elements>) ─── */
interface FormProps {
  plan: 'starter' | 'pro'
  subscriptionId: string
  cfg: PlanConfig
  amountCents: number | null
  onSuccess: () => void
  /** Paid, but activation has not been confirmed yet — the webhook will finish it. */
  onPending: (pending: boolean) => void
}

function CheckoutForm({ plan, subscriptionId, cfg, amountCents, onSuccess, onPending }: FormProps) {
  const stripe   = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const setPending = onPending

  const details = planDetails(plan, cfg, amountCents)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setLoading(true)
    setError(null)

    // Confirm the payment:get paymentIntent back (redirect:'if_required' keeps us in-app)
    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed. Please try again.')
      setLoading(false)
      return
    }

    // The payment succeeded. Ask the server to activate now for an instant
    // upgrade — it reads the account from the ID token and the plan from the
    // Stripe subscription, so neither is taken from this request.
    //
    // If this call fails, Stripe's `invoice.payment_succeeded` webhook still
    // activates the subscription server-side. We say that plainly instead of
    // showing a success screen for an upgrade that may not have happened.
    try {
      const res = await fetch('/api/activate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          subscriptionId,
          paymentIntentId: paymentIntent?.id ?? null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        onSuccess()
      } else {
        console.warn('[activate-plan] not yet active:', data)
        setPending(true)
      }
    } catch (e) {
      console.warn('[activate-plan] request failed:', e)
      setPending(true)
    }
    setLoading(false)
  }

  return (
    <form className="pm-form" onSubmit={handleSubmit}>
      {/* Plan summary */}
      <div className="pm-plan-summary">
        <div className="pm-plan-header">
          <span className="pm-plan-label">{details.label}</span>
          <span className="pm-plan-price">{details.price}</span>
        </div>
        <p className="pm-plan-tagline">{details.tagline}</p>
        <ul className="pm-plan-features">
          {details.features.map(f => (
            <li key={f}><span className="pm-feat-check">✓</span>{f}</li>
          ))}
        </ul>
      </div>

      <div className="pm-divider" />

      {/* Stripe PaymentElement */}
      <div className="pm-card-section">
        <p className="pm-card-label">Payment details</p>
        <div className="pm-card-element-wrap">
          <PaymentElement options={{ layout: 'tabs' }} />
        </div>
      </div>

      {error && <p className="pm-error">{error}</p>}

      <button
        type="submit"
        className="btn-primary pm-pay-btn"
        disabled={!stripe || !elements || loading}
      >
        {loading
          ? <><span className="btn-spinner" /> Processing…</>
          : `Subscribe ${details.price}`}
      </button>

      <p className="pm-secure-note">
        <IconLock /> Secured by Stripe · Cancel anytime
      </p>
    </form>
  )
}

/* ─── Success screen ─── */
function SuccessScreen({ plan, cfg, onClose }: { plan: string; cfg: PlanConfig; onClose: () => void }) {
  const details = planDetails(plan, cfg)
  return (
    <div className="pm-success">
      <div className="pm-success-icon">✓</div>
      <h2 className="pm-success-title">You're on {details?.label}!</h2>
      <p className="pm-success-sub">
        Your subscription is active. Enjoy {details?.features[0]} and all {details?.label} features.
      </p>
      <button className="btn-primary btn-cta pm-pay-btn" onClick={onClose}>
        Start Analyzing →
      </button>
    </div>
  )
}

/* ─── Payment received, activation still settling ─── */
function PendingScreen({ onClose }: { onClose: () => void }) {
  return (
    <div className="pm-success">
      <div className="pm-success-icon">⏳</div>
      <h2 className="pm-success-title">Payment received</h2>
      <p className="pm-success-sub">
        Your payment went through. We're activating your plan now — this usually takes a few
        seconds. Refresh your account page if it hasn't appeared in a minute, and contact support
        if it still hasn't.
      </p>
      <button className="btn-primary btn-cta pm-pay-btn" onClick={onClose}>
        Close
      </button>
    </div>
  )
}

/* ─── Outer modal (fetches client_secret, renders Elements) ─── */
interface PaymentModalProps {
  plan: 'starter' | 'pro'
  email?: string
  name?: string
  onClose: () => void
}

export default function PaymentModal({ plan, email, name, onClose }: PaymentModalProps) {
  const [clientSecret,    setClientSecret]    = useState<string | null>(null)
  const [subscriptionId,  setSubscriptionId]  = useState<string>('')
  const [fetchError,      setFetchError]      = useState<string | null>(null)
  const [fetchLoading,    setFetchLoading]    = useState(true)
  const [paid,            setPaid]            = useState(false)
  const [pending,         setPending]         = useState(false)
  const [cfg,             setCfg]             = useState<PlanConfig>(getCachedPlanConfig())
  const [amountCents,     setAmountCents]     = useState<number | null>(null)

  // Same admin-editable config the pricing page renders from.
  useEffect(() => { getPlanConfig().then(setCfg).catch(() => {}) }, [])

  useEffect(() => {
    // uid is not sent: the endpoint derives the account from the ID token.
    authHeaders()
      .then(headers => fetch('/api/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ plan, email, name }),
      }))
      .then(r => r.json())
      .then(data => {
        if (data.clientSecret) {
          setClientSecret(data.clientSecret)
          setSubscriptionId(data.subscriptionId)
          if (typeof data.amountCents === 'number') setAmountCents(data.amountCents)
        } else {
          setFetchError(data.error ?? 'Could not initialize payment')
        }
        setFetchLoading(false)
      })
      .catch(() => {
        setFetchError('Network error. Please try again.')
        setFetchLoading(false)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stripeAppearance = {
    theme: 'stripe' as const,
    variables: {
      colorPrimary: '#6366f1',
      colorBackground: '#ffffff',
      colorText: '#0f172a',
      colorDanger: '#ef4444',
      fontFamily: 'Inter, system-ui, sans-serif',
      borderRadius: '8px',
      spacingUnit: '4px',
    },
  }

  return (
    <div className="pm-backdrop" onClick={onClose}>
      <div className="pm-card" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="pm-header">
          <span className="pm-header-title">⏱ TIMECUT</span>
          <button className="pm-close-btn" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>

        {/* Body */}
        {fetchLoading && (
          <div className="pm-loading">
            <span className="btn-spinner pm-loading-spinner" />
            <p>Preparing secure checkout…</p>
          </div>
        )}

        {fetchError && (
          <div className="pm-fetch-error">
            <p>{fetchError}</p>
            <button className="btn-outline" onClick={onClose}>Close</button>
          </div>
        )}

        {paid && <SuccessScreen plan={plan} cfg={cfg} onClose={onClose} />}
        {pending && !paid && <PendingScreen onClose={onClose} />}

        {clientSecret && !paid && !pending && (
          <Elements
            key={clientSecret}
            stripe={stripePromise}
            options={{ clientSecret, appearance: stripeAppearance }}
          >
            <CheckoutForm
              plan={plan}
              subscriptionId={subscriptionId}
              cfg={cfg}
              amountCents={amountCents}
              onSuccess={() => setPaid(true)}
              onPending={setPending}
            />
          </Elements>
        )}
      </div>
    </div>
  )
}

function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
function IconLock() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}>
      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}
