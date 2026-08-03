/**
 * READ-ONLY audit of live Stripe subscriptions vs. the prices configured in the
 * Admin Dashboard (`config/plans` in Firestore).
 *
 * This script NEVER writes to Stripe or Firestore. It only lists and compares,
 * so it is safe to run against production at any time.
 *
 * Usage:
 *   npx tsx scripts/audit-subscription-prices.ts
 *
 * Needs STRIPE_SECRET_KEY in .env. Firestore prices are read via
 * FIREBASE_SERVICE_ACCOUNT_BASE64 if set, otherwise via ./serviceAccountKey.json;
 * if neither is available the script falls back to the built-in defaults and
 * says so.
 */
import 'dotenv/config'
import { existsSync, readFileSync } from 'node:fs'
import Stripe from 'stripe'
import admin from 'firebase-admin'

const PLANS = ['starter', 'pro', 'business'] as const
type Plan = (typeof PLANS)[number]

// Same fallbacks the API uses when a plan has no configured price.
const FALLBACK_CENTS: Record<Plan, number> = { starter: 900, pro: 2900, business: 14900 }

const money = (cents: number | null | undefined) =>
  cents == null ? '—' : `$${(cents / 100).toFixed(2)}`

/** Map a Stripe product name ("TimeCut Pro") to our plan key ("pro"). */
function planFromProductName(name: string | undefined): Plan | null {
  if (!name) return null
  const key = name.toLowerCase().replace(/[^a-z]/g, '')
  for (const p of PLANS) if (key === `timecut${p}` || key.endsWith(p)) return p
  return null
}

/** Read the admin-editable prices. Returns null when Firestore is unreachable. */
async function loadConfiguredPrices(): Promise<Record<Plan, number | null> | null> {
  try {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
    const sa = b64
      ? JSON.parse(Buffer.from(b64, 'base64').toString())
      : existsSync('serviceAccountKey.json')
        ? JSON.parse(readFileSync('serviceAccountKey.json', 'utf8'))
        : null
    if (!sa) return null

    if (admin.apps.length === 0) admin.initializeApp({ credential: admin.credential.cert(sa) })
    const snap = await admin.firestore().collection('config').doc('plans').get()
    if (!snap.exists) return null

    const plans = (snap.data() as any)?.plans ?? {}
    return {
      starter: plans.starter?.priceCents ?? null,
      pro: plans.pro?.priceCents ?? null,
      business: plans.business?.priceCents ?? null,
    }
  } catch (e) {
    console.warn('[audit] could not read config/plans:', e instanceof Error ? e.message : e)
    return null
  }
}

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not set — add it to .env and re-run.')
    process.exit(1)
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' as any })
  const mode = process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'LIVE' : 'TEST'

  const configured = await loadConfiguredPrices()
  const expected: Record<Plan, number> = {
    starter: configured?.starter ?? FALLBACK_CENTS.starter,
    pro: configured?.pro ?? FALLBACK_CENTS.pro,
    business: configured?.business ?? FALLBACK_CENTS.business,
  }

  console.log(`\n── Stripe subscription price audit (${mode} mode, READ-ONLY) ──\n`)
  console.log(configured
    ? 'Expected prices (from config/plans — your Admin Dashboard):'
    : 'Could not read config/plans — comparing against built-in defaults instead:')
  for (const p of PLANS) console.log(`  ${p.padEnd(9)} ${money(expected[p])}/month`)
  console.log()

  type Row = {
    plan: Plan | 'unknown'
    product: string
    email: string
    status: string
    charged: number | null
    should: number | null
    diff: number
    subId: string
  }
  const rows: Row[] = []

  // Product names are looked up separately: Stripe caps `expand` at 4 levels,
  // and data.items.data.price.product is one level too deep.
  const productNames = new Map<string, string>()
  async function productName(id: string | undefined): Promise<string | undefined> {
    if (!id) return undefined
    if (!productNames.has(id)) {
      const p = await stripe.products.retrieve(id)
      productNames.set(id, (p as Stripe.Product).name ?? '')
    }
    return productNames.get(id)
  }

  // Paginate through every subscription Stripe still bills for.
  for await (const sub of stripe.subscriptions.list({
    status: 'all',
    limit: 100,
    expand: ['data.customer'],
  })) {
    if (!['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status)) continue

    const item = sub.items.data[0]
    const productRef = item?.price?.product
    const name = typeof productRef === 'string'
      ? await productName(productRef)
      : (productRef as Stripe.Product)?.name
    const plan = planFromProductName(name)
    const charged = item?.price?.unit_amount ?? null
    const should = plan ? expected[plan] : null
    const customer = sub.customer as Stripe.Customer | Stripe.DeletedCustomer

    rows.push({
      plan: plan ?? 'unknown',
      product: name ?? '(unnamed product)',
      email: (customer as Stripe.Customer)?.email ?? '(no email)',
      status: sub.status,
      charged,
      should,
      diff: should != null && charged != null ? should - charged : 0,
      subId: sub.id,
    })
  }

  if (rows.length === 0) {
    console.log('No billable subscriptions found. Nothing to migrate.\n')
    process.exit(0)
  }

  // Rows whose plan could not be identified are NOT "correct" — they are simply
  // unclassified, and lumping them in with correct ones would understate the problem.
  const unknown = rows.filter(r => r.plan === 'unknown' || r.charged == null || r.should == null)
  const classified = rows.filter(r => !unknown.includes(r))
  const mismatched = classified.filter(r => r.diff !== 0)
  const correct = classified.length - mismatched.length

  console.log(
    `Found ${rows.length} billable subscription(s): ` +
    `${correct} already on the current price, ${mismatched.length} on an outdated price` +
    (unknown.length ? `, ${unknown.length} could not be matched to a plan` : '') + '.\n',
  )

  if (unknown.length > 0) {
    console.log('Not a TimeCut plan — left alone (this Stripe account also bills other products):\n')
    for (const r of unknown) {
      console.log(`  ${r.status.padEnd(10)} ${money(r.charged).padEnd(9)} ${r.product.padEnd(26)} ${r.email}  (${r.subId})`)
    }
    console.log()
  }

  if (mismatched.length > 0) {
    console.log('Subscriptions charging the WRONG amount:\n')
    console.log('  PLAN      STATUS     CHARGING   SHOULD BE   DIFF/MONTH  CUSTOMER')
    for (const r of mismatched.sort((a, b) => b.diff - a.diff)) {
      console.log(
        `  ${r.plan.padEnd(9)} ${r.status.padEnd(10)} ` +
        `${money(r.charged).padEnd(10)} ${money(r.should).padEnd(11)} ` +
        `${(r.diff > 0 ? '+' : '') + money(Math.abs(r.diff))}`.padEnd(12) +
        `${r.email}  (${r.subId})`,
      )
    }

    const monthly = mismatched.reduce((sum, r) => sum + r.diff, 0)
    console.log(`\n  Total monthly shortfall: ${money(monthly)}  (${money(monthly * 12)}/year)`)
  }

  console.log('\nNothing was changed — this audit is read-only.\n')
  process.exit(0)
}

main().catch(err => {
  console.error('[audit] failed:', err)
  process.exit(1)
})
