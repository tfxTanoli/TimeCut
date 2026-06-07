import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string)

const PLAN_DETAILS: Record<string, { label: string; price: string; tagline: string; features: string[] }> = {
  starter: {
    label: 'STARTER',
    price: '$9/month',
    tagline: 'Build better information habits',
    features: ['60 analyses/month', 'Everything in Free', 'PDF Upload & Analysis', 'Analysis History', 'Multi-language Support', 'Advanced Insights', 'Download Reports'],
  },
  pro: {
    label: 'PRO',
    price: '$29/month',
    tagline: 'Make faster decisions at scale',
    features: ['500 analyses/month', 'Everything in Starter', 'Advanced Analysis Reports', 'Priority Processing', 'Detailed Breakdown Analysis', 'Export Reports (PDF)', 'Premium Support'],
  },
  business: {
    label: 'BUSINESS',
    price: '$149/month',
    tagline: 'Scale your content intelligence',
    features: ['2,000 analyses/month', 'Everything in Pro', 'Team Workspace (up to 10 users)', 'Priority Dedicated Support', 'Custom Report Branding'],
  },
}

/* ─── Inner checkout form (must be inside <Elements>) ─── */
interface FormProps {
  plan: 'starter' | 'pro' | 'business'
  uid: string
  subscriptionId: string
  email?: string
  name?: string
  onSuccess: () => void
  onClose: () => void
}

function CheckoutForm({ plan, uid, subscriptionId, email, name, onSuccess }: FormProps) {
  const stripe   = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const details = PLAN_DETAILS[plan]

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

    // paymentIntent.status is already 'succeeded' at this point:pass its ID to the
    // server so activation doesn't depend on Stripe's async subscription status update
    try {
      const res = await fetch('/api/activate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId,
          uid,
          plan,
          paymentIntentId: paymentIntent?.id ?? null,
          email,
          name,
        }),
      })
      const data = await res.json()
      if (data.success) {
        onSuccess()
      } else {
        // Extremely unlikely now:show success anyway since Stripe confirmed the payment
        console.warn('[activate-plan] server returned not-ready:', data)
        onSuccess()
      }
    } catch {
      // Network error:webhook will catch it, treat as success
      onSuccess()
    }
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
function SuccessScreen({ plan, onClose }: { plan: string; onClose: () => void }) {
  const details = PLAN_DETAILS[plan]
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

/* ─── Outer modal (fetches client_secret, renders Elements) ─── */
interface PaymentModalProps {
  plan: 'starter' | 'pro' | 'business'
  uid: string
  email?: string
  name?: string
  onClose: () => void
}

export default function PaymentModal({ plan, uid, email, name, onClose }: PaymentModalProps) {
  const [clientSecret,    setClientSecret]    = useState<string | null>(null)
  const [subscriptionId,  setSubscriptionId]  = useState<string>('')
  const [fetchError,      setFetchError]      = useState<string | null>(null)
  const [fetchLoading,    setFetchLoading]    = useState(true)
  const [paid,            setPaid]            = useState(false)

  useEffect(() => {
    fetch('/api/create-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, uid, email, name }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.clientSecret) {
          setClientSecret(data.clientSecret)
          setSubscriptionId(data.subscriptionId)
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

        {paid && <SuccessScreen plan={plan} onClose={onClose} />}

        {clientSecret && !paid && (
          <Elements
            key={clientSecret}
            stripe={stripePromise}
            options={{ clientSecret, appearance: stripeAppearance }}
          >
            <CheckoutForm
              plan={plan}
              uid={uid}
              subscriptionId={subscriptionId}
              email={email}
              name={name}
              onSuccess={() => setPaid(true)}
              onClose={onClose}
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
