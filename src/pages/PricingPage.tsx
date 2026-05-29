import { Link } from 'react-router-dom'
import Footer from '../components/Footer'

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    desc: 'Perfect for trying out TimeCut with no commitment.',
    cta: 'Start for Free',
    ctaTo: '/',
    highlight: false,
    features: [
      '3 analyses per day',
      'Paste Text input',
      'Full Time Intelligence Report',
      '12 language support',
      'All 8 report fields',
      'Standard processing speed',
    ],
    missing: ['PDF upload', 'Priority processing', 'Report history', 'API access'],
  },
  {
    name: 'Pro',
    price: '$7',
    period: 'per month',
    desc: 'For power users who need unlimited, fast analysis every day.',
    cta: 'Get Pro',
    ctaTo: '/get-started',
    highlight: true,
    features: [
      'Unlimited analyses',
      'Paste Text + PDF upload',
      'Full Time Intelligence Report',
      '12 language support',
      'All 8 report fields',
      'Priority processing speed',
      'Report history (last 100)',
      'Download reports as PDF',
    ],
    missing: ['API access', 'Team accounts'],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: 'billed annually',
    desc: 'For teams and organizations that need TimeCut at scale.',
    cta: 'Contact Sales',
    ctaTo: '/get-started',
    highlight: false,
    features: [
      'Everything in Pro',
      'REST API access',
      'Team accounts & management',
      'Custom integrations',
      'Dedicated support',
      'SLA guarantee',
      'Custom language packs',
      'Analytics dashboard',
    ],
    missing: [],
  },
]

const FAQS = [
  { q: 'Is the Free plan really free?', a: 'Yes. No credit card required. You get 3 analyses per day with full reports.' },
  { q: 'Can I cancel my Pro plan anytime?', a: 'Absolutely. Cancel anytime from your account settings with no questions asked.' },
  { q: 'What payment methods do you accept?', a: 'Visa, Mastercard, Amex, and PayPal via Stripe. All payments are secure.' },
  { q: 'Do you offer a free trial for Pro?', a: 'Yes, a 7-day free trial is available on Pro. No charge until the trial ends.' },
  { q: 'What counts as one analysis?', a: 'Each time you submit content (text or PDF) and receive a report counts as one analysis.' },
]

export default function PricingPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">Transparent Pricing</span>
          <h1 className="page-hero-title">Simple, Honest Pricing</h1>
          <p className="page-hero-sub">Start free. Upgrade when you need more. No hidden fees.</p>
        </div>
      </section>

      <section className="pricing-section">
        <div className="container">
          <div className="pricing-grid">
            {PLANS.map((plan, i) => (
              <div key={i} className={`pricing-card ${plan.highlight ? 'pricing-card--highlight' : ''}`}>
                {plan.highlight && <span className="pricing-badge">Most Popular</span>}
                <p className="pricing-name">{plan.name}</p>
                <div className="pricing-price-row">
                  <span className="pricing-price">{plan.price}</span>
                  {plan.price !== 'Custom' && plan.period && <span className="pricing-period">/{plan.period}</span>}
                </div>
                <p className="pricing-desc">{plan.desc}</p>
                <Link
                  to={plan.ctaTo}
                  className={`pricing-cta ${plan.highlight ? 'btn-primary' : 'btn-outline'}`}
                >
                  {plan.cta}
                </Link>
                <div className="pricing-divider" />
                <ul className="pricing-features">
                  {plan.features.map((f, j) => (
                    <li key={j} className="pricing-feat pricing-feat--yes">
                      <span className="feat-icon feat-icon--yes">✓</span> {f}
                    </li>
                  ))}
                  {plan.missing.map((f, j) => (
                    <li key={j} className="pricing-feat pricing-feat--no">
                      <span className="feat-icon feat-icon--no">×</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="faq-section">
        <div className="container faq-inner">
          <h2 className="section-title">Pricing FAQs</h2>
          <div className="faq-list">
            {FAQS.map((faq, i) => (
              <div key={i} className="faq-item">
                <p className="faq-q">{faq.q}</p>
                <p className="faq-a">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="page-cta-section">
        <div className="container page-cta-inner">
          <h2>Start Protecting Your Time Today</h2>
          <p>Free. Upgrade when you're ready.</p>
          <Link to="/" className="btn-primary btn-cta">Get Started Free</Link>
        </div>
      </section>

      <Footer />
    </>
  )
}
