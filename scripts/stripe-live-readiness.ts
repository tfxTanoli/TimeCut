/**
 * READ-ONLY Stripe live-payment readiness check.
 *
 * Answers, with evidence rather than assertion:
 *   1. Is Stripe running in Live mode or Test/Sandbox mode?
 *   2. Do the secret key and the publishable key agree about which mode it is?
 *   3. Can the Stripe account actually accept charges and receive payouts?
 *   4. Do the Starter and Pro products/prices exist in this mode, and do their
 *      amounts match what the pricing page and Admin config say?
 *   5. Is a webhook endpoint registered in this mode, pointed at
 *      /api/stripe-webhook, and subscribed to the events activation depends on?
 *   6. Is the webhook signing secret configured?
 *
 * It NEVER writes to Stripe or Firestore, and NEVER prints a key — only whether
 * a key is present and which mode it belongs to.
 *
 * IMPORTANT: this reads the environment it runs in. Run locally it reports on
 * .env; the deployed site uses the environment variables set in Vercel, so a
 * clean result here does not prove the deployment is configured. Run it with
 * the same variables the deployment uses to check the deployment.
 *
 * Usage:
 *   npx tsx scripts/stripe-live-readiness.ts
 */
import 'dotenv/config'
import Stripe from 'stripe'
import { getPlanConfig } from '../api/_lib/planConfig.js'
import { STRIPE_PLANS } from '../api/_lib/stripe-admin.js'

type Status = 'pass' | 'warn' | 'fail'
const results: { status: Status; title: string; detail: string }[] = []
const add = (status: Status, title: string, detail: string) => results.push({ status, title, detail })

/** 'live' | 'test' | 'missing' | 'unrecognised' — never the key itself. */
function keyMode(key: string | undefined): string {
  if (!key) return 'missing'
  if (/^(sk|pk|rk)_live_/.test(key)) return 'live'
  if (/^(sk|pk|rk)_test_/.test(key)) return 'test'
  return 'unrecognised'
}

const money = (cents: number | null | undefined) =>
  cents == null ? '—' : `$${(cents / 100).toFixed(2)}`

/** Events the activation, renewal, failure and cancellation paths depend on. */
const REQUIRED_EVENTS = [
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]

async function main() {
  const secretMode = keyMode(process.env.STRIPE_SECRET_KEY)
  const publishableMode = keyMode(process.env.VITE_STRIPE_PUBLISHABLE_KEY)
  const hasWebhookSecret = Boolean(process.env.STRIPE_WEBHOOK_SECRET)

  console.log('TimeCut — Stripe live-payment readiness')
  console.log('='.repeat(64))
  console.log(`Secret key (STRIPE_SECRET_KEY):            ${secretMode}`)
  console.log(`Publishable key (VITE_STRIPE_...):         ${publishableMode}`)
  console.log(`Webhook signing secret:                    ${hasWebhookSecret ? 'set' : 'NOT set'}`)
  console.log('')

  // ── 1. Mode ────────────────────────────────────────────────────────────────
  if (secretMode === 'missing') {
    add('fail', 'Stripe secret key', 'STRIPE_SECRET_KEY is not set. No payment can be taken at all.')
  } else if (secretMode === 'live') {
    add('pass', 'Stripe mode', 'Secret key is a LIVE key — real cards will be charged.')
  } else if (secretMode === 'test') {
    add('fail', 'Stripe mode', 'Secret key is a TEST/Sandbox key. Real payments cannot be taken until this is a live key.')
  } else {
    add('fail', 'Stripe mode', 'STRIPE_SECRET_KEY is set but is neither sk_test_ nor sk_live_.')
  }

  // ── 2. Key agreement ───────────────────────────────────────────────────────
  if (secretMode !== publishableMode) {
    add('fail', 'Key mode mismatch',
      `Secret key is "${secretMode}" but the publishable key the browser uses is "${publishableMode}". `
      + 'The card form and the server would be talking to different Stripe environments; payments will fail.')
  } else {
    add('pass', 'Key modes agree', `Both keys are ${secretMode} keys.`)
  }

  // ── 3. Webhook signing secret ──────────────────────────────────────────────
  if (hasWebhookSecret) {
    add('pass', 'Webhook signing secret', 'STRIPE_WEBHOOK_SECRET is set, so webhook signatures are verified.')
  } else if (secretMode === 'live') {
    add('fail', 'Webhook signing secret',
      'STRIPE_WEBHOOK_SECRET is NOT set while using live keys. The webhook route refuses unsigned events, '
      + 'so no subscription would activate from Stripe — and without that refusal anyone could grant themselves a plan.')
  } else {
    add('warn', 'Webhook signing secret', 'Not set. Required before going live.')
  }

  if (secretMode === 'missing' || secretMode === 'unrecognised') return report()

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apiVersion: '2023-10-16' as any,
  })

  // ── 4. Can the account actually charge? ────────────────────────────────────
  try {
    const account = await stripe.accounts.retrieve()
    const chargesEnabled = account.charges_enabled
    const payoutsEnabled = account.payouts_enabled
    const due = account.requirements?.currently_due ?? []
    add(chargesEnabled ? 'pass' : 'fail', 'Account can accept charges',
      `charges_enabled=${chargesEnabled}, payouts_enabled=${payoutsEnabled}`
      + (due.length ? `. Stripe still requires: ${due.join(', ')}` : '.'))
    if (!payoutsEnabled) {
      add('warn', 'Payouts', 'Payouts are not enabled yet — you can be paid by customers but Stripe cannot pay out to your bank.')
    }
  } catch (e) {
    add('fail', 'Account lookup failed', e instanceof Error ? e.message : String(e))
  }

  // ── 5. What each plan would actually charge ────────────────────────────────
  // api/create-subscription.ts builds each subscription with an inline
  // `price_data` block rather than a stored Price object, so a product with no
  // Price attached is normal and not a fault. What matters is the amount in
  // config/plans, because that is both what the pricing page renders and what
  // Stripe is told to charge.
  const cfg = await getPlanConfig()
  for (const plan of Object.keys(STRIPE_PLANS)) {
    const cents = cfg.plans[plan as keyof typeof cfg.plans]?.priceCents ?? null
    if (cents == null || cents <= 0) {
      add('fail', `${STRIPE_PLANS[plan].name} price`,
        'No price configured in config/plans, so checkout would be refused with PRICE_UNAVAILABLE.')
      continue
    }
    add('pass', `${STRIPE_PLANS[plan].name} price`,
      `Configured at ${money(cents)}/month in the Admin Dashboard (config/plans). `
      + 'This is both the price shown on /pricing and the amount Stripe charges.')

    try {
      const product = await stripe.products.search({
        query: `name:"${STRIPE_PLANS[plan].name}" AND active:"true"`,
        limit: 1,
      })
      if (product.data.length === 0) {
        add('warn', `${STRIPE_PLANS[plan].name} product`,
          `Not present in ${secretMode} mode yet. It is created automatically on the first purchase, `
          + `so this is expected before the first ${secretMode} sale.`)
      }
    } catch (e) {
      add('warn', `${STRIPE_PLANS[plan].name} product lookup`, e instanceof Error ? e.message : String(e))
    }
  }

  // Any live subscription still billing an old amount would keep charging it:
  // changing config/plans does not re-price subscriptions already created.
  try {
    const subs = await stripe.subscriptions.list({ status: 'active', limit: 100 })
    const mismatched = subs.data.filter(sub => {
      const planKey = sub.metadata?.plan
      const configured = planKey ? cfg.plans[planKey as keyof typeof cfg.plans]?.priceCents : null
      const charged = sub.items.data[0]?.price?.unit_amount
      return configured != null && charged != null && configured !== charged
    })
    if (subs.data.length === 0) {
      add('pass', 'Existing subscriptions', `No active subscriptions in ${secretMode} mode.`)
    } else if (mismatched.length === 0) {
      add('pass', 'Existing subscriptions',
        `${subs.data.length} active subscription(s), all billing the configured amount.`)
    } else {
      add('warn', 'Existing subscriptions',
        `${mismatched.length} of ${subs.data.length} active subscription(s) bill an amount that no longer matches `
        + 'config/plans. Changing a price does not re-price subscriptions already created: '
        + mismatched.map(s2 => `${s2.id} charges ${money(s2.items.data[0]?.price?.unit_amount)}`).join('; ') + '.')
    }
  } catch (e) {
    add('warn', 'Subscription audit failed', e instanceof Error ? e.message : String(e))
  }

  // ── 6. Webhook endpoints registered in THIS mode ───────────────────────────
  try {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })
    const enabled = endpoints.data.filter(e => e.status === 'enabled')
    if (enabled.length === 0) {
      add('fail', 'Webhook endpoint',
        `No enabled webhook endpoint exists in ${secretMode} mode. Payments would succeed and no plan would activate.`)
    }
    for (const e of enabled) {
      const events: string[] = e.enabled_events ?? []
      const all = events.includes('*')
      const missing = all ? [] : REQUIRED_EVENTS.filter(r => !events.includes(r))
      const pointsAtUs = /\/api\/stripe-webhook/.test(e.url)
      add(missing.length === 0 && pointsAtUs ? 'pass' : 'fail', `Webhook ${e.url}`,
        (pointsAtUs ? '' : 'URL does not end in /api/stripe-webhook. ')
        + (missing.length === 0
          ? `Subscribed to all required events${all ? ' (all events)' : ''}.`
          : `Missing required events: ${missing.join(', ')}.`))
    }
  } catch (e) {
    add('fail', 'Webhook endpoint lookup failed', e instanceof Error ? e.message : String(e))
  }

  // ── 7. Billing Portal configuration ────────────────────────────────────────
  // "Manage or Cancel Subscription" on /profile creates a Billing Portal
  // session. The portal has its own configuration, set up separately per mode —
  // without one in live mode, cancellation fails for every paying customer even
  // though the code is correct.
  try {
    const configs = await stripe.billingPortal.configurations.list({ active: true, limit: 10 })
    if (configs.data.length === 0) {
      add('fail', 'Billing Portal configuration',
        `No active Customer Portal configuration in ${secretMode} mode. "Manage or Cancel Subscription" `
        + 'would fail, leaving customers unable to cancel — set it up in Stripe under '
        + 'Settings -> Billing -> Customer portal.')
    } else {
      const def = configs.data.find(c => c.is_default) ?? configs.data[0]
      const canCancel = def.features?.subscription_cancel?.enabled
      add(canCancel ? 'pass' : 'fail', 'Billing Portal configuration',
        `Active configuration ${def.id}; subscription cancellation is `
        + `${canCancel ? 'enabled' : 'DISABLED — customers could not cancel from the portal'}.`)
    }
  } catch (e) {
    add('warn', 'Billing Portal lookup failed', e instanceof Error ? e.message : String(e))
  }

  report()
}

function report() {
  const icon = { pass: '[PASS]', warn: '[WARN]', fail: '[FAIL]' }
  for (const r of results) console.log(`${icon[r.status]} ${r.title}\n        ${r.detail}\n`)

  const fails = results.filter(r => r.status === 'fail').length
  const warns = results.filter(r => r.status === 'warn').length
  console.log('='.repeat(64))
  console.log(fails === 0
    ? `Ready for a live test payment. ${warns} warning(s) to read first.`
    : `NOT ready: ${fails} blocking issue(s), ${warns} warning(s).`)
  process.exitCode = fails === 0 ? 0 : 1
}

main().catch(e => { console.error(e); process.exit(1) })
