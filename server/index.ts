import 'dotenv/config'
import express, { type NextFunction, type Request, type Response } from 'express'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// ── Local development API ────────────────────────────────────────────────────
// This server runs the *same handler modules* Vercel deploys from api/. It used
// to be a separate, hand-maintained Express copy of every route, and the copy
// had drifted from production: it still served /api/create-checkout-session
// (which does not exist in api/), accepted any file type, skipped the goal and
// plan-gating checks, and sent its own versions of the emails. Anything tested
// locally was therefore not what shipped.
//
// Now the only local-specific code is the adapter below, which reproduces the
// two things Vercel does before calling a handler:
//   1. JSON body parsing, unless the route exports `config.api.bodyParser = false`
//      (uploads and the Stripe webhook read the raw stream themselves).
//   2. The vercel.json rewrites that map the four mail URLs onto
//      /api/send-email?type=… .
// Add a route here whenever a file is added to api/.

import * as activatePlan from '../api/activate-plan.js'
import * as analyze from '../api/analyze.js'
import * as analyzeDecision from '../api/analyze-decision.js'
import * as analyzePdf from '../api/analyze-pdf.js'
import * as billingPortal from '../api/billing-portal.js'
import * as challengeAi from '../api/challenge-ai.js'
import * as createSubscription from '../api/create-subscription.js'
import * as expirePlan from '../api/expire-plan.js'
import * as sendEmail from '../api/send-email.js'
import * as stripeWebhook from '../api/stripe-webhook.js'

type VercelHandler = (req: VercelRequest, res: VercelResponse) => unknown

interface RouteModule {
  default: VercelHandler
  config?: { api?: { bodyParser?: boolean } }
}

const app = express()
app.disable('x-powered-by')

/** Mount one api/ module at `path`, with optional fixed query params (rewrites). */
function mount(path: string, mod: RouteModule, rewriteQuery?: Record<string, string>) {
  const parseBody = mod.config?.api?.bodyParser !== false
  const bodyParsers = parseBody ? [express.json({ limit: '4.5mb' })] : []

  app.all(path, ...bodyParsers, async (req: Request, res: Response, next: NextFunction) => {
    if (rewriteQuery) {
      // Express 5 exposes `query` as a getter; shadow it on this request only.
      Object.defineProperty(req, 'query', {
        value: { ...req.query, ...rewriteQuery },
        writable: true,
        configurable: true,
      })
    }
    try {
      await mod.default(req as unknown as VercelRequest, res as unknown as VercelResponse)
    } catch (err) {
      next(err)
    }
  })
}

mount('/api/activate-plan', activatePlan)
mount('/api/analyze', analyze)
mount('/api/analyze-decision', analyzeDecision)
mount('/api/analyze-pdf', analyzePdf)
mount('/api/billing-portal', billingPortal)
mount('/api/challenge-ai', challengeAi)
mount('/api/create-subscription', createSubscription)
mount('/api/expire-plan', expirePlan)
mount('/api/stripe-webhook', stripeWebhook)
mount('/api/send-email', sendEmail)
// vercel.json rewrites
mount('/api/send-contact-email', sendEmail, { type: 'contact' })
mount('/api/send-verification-email', sendEmail, { type: 'verification' })
mount('/api/send-welcome-email', sendEmail, { type: 'welcome' })
mount('/api/send-password-reset-email', sendEmail, { type: 'reset' })

// Unknown API paths get JSON, as on Vercel, rather than Express's HTML page.
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' })
})

// A handler that throws synchronously or rejects outside its own try/catch.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  void _next
  const status = (err as { type?: string }).type === 'entity.too.large' ? 413 : 500
  console.error('[server] unhandled error:', err)
  if (!res.headersSent) {
    res.status(status).json({ error: status === 413 ? 'Request too large' : 'Internal server error' })
  }
})

const PORT = process.env.PORT ?? 3001
const server = app.listen(PORT, () => console.log(`TimeCut API (api/ handlers) running on http://localhost:${PORT}`))
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] Port ${PORT} is already in use. Kill the old process and retry.`)
    process.exit(1)
  }
  throw err
})
