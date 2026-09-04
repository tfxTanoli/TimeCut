# TimeCut — Launch Readiness

**Date:** 4 September 2026 · **Branch:** `main`

This answers all five things you asked about: the document limits, the automatic
credit refund, the Assistant before/after comparison, the homepage upload
layout, and whether it is safe to make a real payment.

---

## Short version

| Your question | Answer |
| --- | --- |
| 50,000-character single-document limit | ✅ Done and tested |
| 80,000-character total across multiple documents | ✅ Done and tested |
| Automatic credit refund when an analysis fails or times out | ✅ Done and tested (12/12 checks) |
| Assistant before/after quality comparison | ✅ Done — see `Assistant-Model-Comparison.md`. No quality loss. |
| Upload box moved into the hero, on mobile and desktop | ✅ Done — see the two before/after images |
| **Is it safe to make a real $9 payment yet?** | ❌ **Not yet.** Four things must be done first, three of them by you in Stripe. |

**Please also read section 5 — the site is currently priced at $19 / $69 / $199,
not the $9 / $29 you mentioned.**

---

## 1. Document limits — done and tested

| Limit | Value |
| --- | --- |
| One document, on its own | **50,000 characters** (~18 pages of dense text) |
| Total across all documents in one report | **80,000 characters** |
| Pasted text or a single PDF | **50,000 characters** |
| Floor per document, however many are uploaded | 8,000 characters |

Because the 80,000 is shared, more documents means a smaller share each — but a
single upload always gets the whole 50,000. Measured from the running code:

```
 1 document(s): 50,000 chars each  =  50,000 total
 2 document(s): 40,000 chars each  =  80,000 total
 3 document(s): 26,666 chars each  =  79,998 total
 5 document(s): 16,000 chars each  =  80,000 total
10 document(s):  8,000 chars each  =  80,000 total
```

And the truncation behaviour itself, not just the numbers:

```
Single 70,000-char document -> 50,000 kept, reported as truncated: ["contract.pdf"]
Two 70,000-char documents   -> 80,000 kept, reported as truncated: ["a.pdf","b.pdf"]
One 1,000-char document     -> nothing cut
```

When a document is cut short, **the report says so on screen**. It does not
silently drop the rest — for a contract-review tool, a customer has to know when
only part of a document was read.

Cost impact: roughly $0.058 → $0.070 per single-document report.

---

## 2. Automatic credit refund on failure or timeout — done and tested

Credits are taken **before** the AI call and given back if the analysis does not
produce a report. This now holds on all four paid routes: decision reports,
PDF analysis, text analysis, and Decision Assistant questions.

The important part was not the refund itself but making sure it can run at all.
Previously the AI request had no deadline, so when the hosting platform killed
the function at 60 seconds our refund code never executed: **the customer was
charged, we paid OpenAI, and no report arrived.** Each call now stops itself
before the platform can, leaving headroom for the refund.

I ran this against real Firestore with a disposable test account, which was
deleted afterwards. Full output:

```
[PASS] Test account resolves as Pro
       plan=pro, allowance=3000 credits.
[PASS] Credits are taken before the analysis runs
       used went 0 -> 20 (charged 20).
[PASS] A failed report refunds the credits in full
       used returned to 0, matching the 0 before the charge.
[PASS] A failed free-plan report restores the free report
       freeReportsUsed went 0 -> 1 -> 0.
[PASS] A failed Assistant question refunds its credit
       used went 0 -> 1 -> 0.
[PASS] A real OpenAI deadline is classified as a timeout
       Route returns 504 with: "The analysis took too long and was stopped.
       Your AI Credits have been refunded — please try again, or split very
       large documents into smaller files."
[PASS] Timeouts are not retried
       maxRetries=0; a retry would push past the route's own limit and skip the refund.
[PASS] Decision reports: our deadline is inside the platform limit
       we stop at 50s, the platform kills the function at 60s — 10s of headroom.
[PASS] Content analyses: we stop at 25s, platform limit 30s — 5s of headroom.
[PASS] Content analyses (PDF): we stop at 25s, platform limit 30s — 5s of headroom.
[PASS] Assistant questions: we stop at 20s, platform limit 30s — 10s of headroom.
[PASS] Test account removed

All 12 checks passed.
```

Two details worth knowing:

- **Free-plan users get their free report back too**, not just paid credits.
- A timed-out analysis returns a message that *tells the customer the credits
  came back*, rather than a raw technical error. That prevents a support email.

Re-runnable at any time: `npx tsx scripts/verify-refund-on-failure.ts`

---

## 3. Decision Assistant — before/after quality comparison

Full document: **`Assistant-Model-Comparison.md`** (every answer in it is real
output from a live run, nothing written by hand).

**Background.** The Decision Assistant charges 1 AI Credit per question. It used
to run on the same expensive model that writes the whole report, which cost
2–7x more per credit than a full report — a Pro subscriber spending their 3,000
credits on questions could have cost more in API fees than their subscription
brought in. It was moved to a smaller model, because the Assistant never
analyses a document: the report is already written, and the Assistant only
answers from text it has been handed.

**The test.** One real report was generated from two supplier quotations. Both
the old and the new model then answered the **same 8 questions from the exact
same report context**. Answers were graded blind by a third model that saw no
model names and got the two answers in a randomised order. Two of the questions
deliberately ask for facts that are *not* in the documents (an ISO certificate
number, three years of delivery statistics), to see whether either model would
invent them.

**Result:**

| Criterion (1–5) | Before | After | Difference |
| --- | --- | --- | --- |
| Grounded (no invented facts) | 5.00 | 5.00 | 0.00 |
| Complete | 4.88 | 5.00 | +0.13 |
| Direct | 5.00 | 4.88 | −0.13 |
| Useful | 4.88 | 5.00 | +0.13 |
| **Overall** | **4.94** | **4.97** | **+0.03** |

The blind grader preferred the old model on 1 of 8 questions, the new model on
1, and called the other 6 a tie. **Both models refused both fabrication traps.**

| | Before | After |
| --- | --- | --- |
| Cost per question | $0.00235 | $0.00014 |
| Average response time | 2.5s | 1.6s |
| Cost of 3,000 questions (a Pro month) | $7.05 | $0.42 |

Honest reading: **no quality difference was detected.** A 0.03 gap on a 5-point
scale is noise, not an improvement. The answers are as good, they arrive faster,
and they cost about 1/17th as much. Full reports were **not** changed — they
still run on the larger model.

---

## 4. Homepage — upload box moved into the hero

Done on both mobile and desktop, as you asked: a first-time visitor now sees the
actual upload area without scrolling.

**Before / after images:**
- `hero-before-after-mobile.png` (390×844, iPhone-class viewport)
- `hero-before-after-desktop.png` (1440×900)

Measured at the top of the page, no scrolling:

| Viewport | Before | After |
| --- | --- | --- |
| Mobile 390×844 | Upload area starts at 958px — **below the fold** | 492px — **visible** |
| Small phone 360×740 | 996px — **below the fold** | 529px — **visible** |
| Desktop 1440×900 | 1042px — **below the fold** | 523px — **visible** |
| Tablet 820×1024 | 979px — only its top edge on screen | 484px — **fully visible** |

(Distances are from the top of the page; the "fold" is the viewport height. The
tablet was the one size where a sliver of the upload area was already reachable
without scrolling — it now sits ~500px higher, fully in view like the rest.)

**What moved where.** The headline and the bold subheadline stay at the top. The
upload box now sits directly under them, framed as a card. The explanatory
paragraph, the "View Sample Report" link, the three green ticks and the "No
credit card required" line all moved **below** the box, exactly as marked on
your screenshot.

**One judgement call, so you are not surprised by it.** The blue "Try TimeCut
Free" button in the hero did nothing except scroll down to the upload box. With
the box now directly above it, that button would have scrolled *upwards* to
content already on screen, sitting a few centimetres under the form's own blue
"Analyze" button — two large blue buttons doing different things. It is removed
**from the hero only**. The same "Try TimeCut Free" button further down the page
is untouched and still works (it now scrolls back to the box and highlights it
briefly, so the click visibly does something). If you would rather keep it in
the hero, say so and I will put it back.

No other section of the page was changed.

---

## 5. Before anything else: the price on the site is not $9 / $29

You asked about "the live Starter ($9) and Pro ($29) subscriptions". **The site
does not currently sell those prices.** The Admin Dashboard configuration —
which is the single source of truth for both what `/pricing` displays and what
Stripe charges — currently holds:

| Plan | Price now live on the site | Price you mentioned |
| --- | --- | --- |
| Starter | **$19/month** | $9 |
| Pro | **$69/month** | $29 |
| Business | **$199/month** | (not mentioned) |

The pricing page screenshot in the project (`pricing-verify-desktop.png`)
confirms it: the cards read $19, $69 and $199.

So if you make a "small real $9 payment" today, **you would be charged $19.**

I have not changed these. Changing a live price is your decision, not mine, and
either answer is easy:

- If **$19 / $69 / $199 is correct**, nothing needs doing — I only need you to
  confirm it so the launch checklist is accurate.
- If you want **$9 / $29**, you can change it yourself in the Admin Dashboard
  (it takes effect immediately on both the pricing page and Stripe), or tell me
  and I will change it.

One caveat either way: changing the price does **not** re-price subscriptions
that already exist. Three active test subscriptions currently bill the
configured amount; anyone who subscribes before a change keeps their old price
until you migrate them in Stripe.

---

## 6. Stripe live-payment readiness

You asked five specific questions. Here is each one, answered from a live
read-only inspection of the Stripe account (`scripts/stripe-live-readiness.ts`,
re-runnable at any time).

### ❌ "Is Stripe fully configured for Live payments, not only Sandbox?"

**No — it is in Test/Sandbox mode, and the Stripe account itself is not
activated for live payments.**

Two separate things are missing:

1. **The keys are test keys.** `STRIPE_SECRET_KEY` and the browser's
   publishable key are both `..._test_...`. (At least in the project
   configuration I can see. If you have already set live keys in the Vercel
   dashboard, they are not in the project config, and the check should be
   re-run there.)
2. **More fundamentally, the Stripe account has not completed activation.**
   Reading account `acct_1SjnXNFt6HKOmjAP` directly:

   ```
   details_submitted: false
   charges_enabled:   false
   payouts_enabled:   false
   ```

   `details_submitted: false` means the Stripe onboarding form — business
   details, identity, bank account — was never finished. **Until you complete
   that in the Stripe dashboard, Stripe will not let you charge a real card at
   all, no matter what the code does.** This is the single biggest blocker and
   only you can clear it.

### ❌ "Are the live Starter and Pro subscriptions correctly connected?"

The mechanism is correct, but there is nothing live to connect to yet, and the
amounts are not what you think — see section 5.

How it works: there are no pre-made Stripe price objects to wire up. Each
subscription is created with the amount read from your Admin Dashboard at the
moment of purchase, and the Stripe products are created automatically on the
first sale. So **displayed price and charged price cannot drift apart** — but it
also means the live-mode products will not exist until your first live payment,
which is normal and expected.

### ❌ "Will live webhooks activate the correct plan and credits after payment?"

**The code is right. The Stripe configuration is wrong, and would not work
today even in test mode.**

The code side is solid:
- Activation happens twice over — instantly in the browser, *and* independently
  from Stripe's own `invoice.payment_succeeded` event. A closed tab or dropped
  connection can no longer leave a paying customer on the free plan.
- The plan granted is read from **what Stripe says was purchased**, never from
  the browser. A $19 payment cannot be redeemed for Pro.
- Credits follow the plan automatically — activating Pro grants its 3,000
  credits immediately, with no separate step to go wrong.

The Stripe side is not:

| Registered endpoint | Problem |
| --- | --- |
| `https://www.timecut.online/` | Points at the site **root**, not `/api/stripe-webhook`, so nothing receives it. Subscribed to only 2 events, and **neither is the one that activates a subscription**. |
| `https://gig-space-lbk7.vercel.app/api/webhook` | Belongs to a different project entirely. |
| `https://virtualobits.online/` | A different project. Already disabled. |

**You need one new endpoint, created in Live mode:**

- **URL:** `https://www.timecut.online/api/stripe-webhook`
- **Events:** `invoice.payment_succeeded`, `invoice.payment_failed`,
  `customer.subscription.updated`, `customer.subscription.deleted`
- Then copy its **signing secret** (`whsec_...`) into the Vercel environment
  variable `STRIPE_WEBHOOK_SECRET` and redeploy.

The old `https://www.timecut.online/` endpoint should be deleted.

### ⚠️ "Are cancellation, failed payment and downgrade handling working in Live mode?"

The code handles all three, and correctly:

- **Cancellation** — "Manage or Cancel Subscription" on the profile page opens
  the Stripe Billing Portal. Cancelling there keeps access until the end of the
  paid period, which is what the pricing FAQ promises.
- **Failed payment** — the account is marked past due while Stripe retries, and
  is downgraded automatically when Stripe gives up. It does not keep paid access
  indefinitely.
- **Downgrade / expiry** — a lapsed plan drops to Free the moment it is next
  used, even if no webhook arrived.

But **all of it depends on the webhook endpoint above**, which does not exist
yet. Until that is created in Live mode, none of these will fire in Live.

One extra live-mode item: the Billing Portal has its own configuration, set up
separately per mode. It is configured correctly in test mode with cancellation
enabled; **verify the same in Live** (Stripe → Settings → Billing → Customer
portal), or the cancel button will fail for real customers.

### ⚠️ "Are there remaining technical issues preventing a real customer from paying and using their paid plan?"

The nine payment-lifecycle defects from the earlier audit are all fixed. I found
and fixed two more while checking this:

1. **The webhook accepted unsigned events.** If the signing secret were missing,
   the endpoint would trust any request sent to it — meaning anyone who found
   the URL could grant themselves a paid plan for free. It now refuses to
   process unsigned events whenever live keys are in use or the code is
   deployed. Unsigned events are still allowed on a local machine running test
   keys, which is how local development works.

2. **A Custom-plan customer would have been locked out of the product.** A
   `null` credit value stored in the Admin config overwrote the built-in
   default and resolved to *zero* credits, so a Custom account would be told it
   was out of credits from the moment it was created. Stored `null` values now
   fall back to the default instead of wiping it. (Business was already fine at
   9,999 credits; only Custom was affected.)

⚠️ Also note: **`stripe-live-readiness-audit.html` in the project folder is out
of date.** It was written before the fixes and still says "Do not switch Stripe
to Live yet" for reasons that no longer apply. Please do not send it to anyone —
this document supersedes it.

---

## 7. What has to happen before you make the first real payment

In order. Items 1–3 are yours to do in the Stripe dashboard; item 4 is mine.

1. **Complete Stripe account activation** so `charges_enabled` becomes true.
   Nothing else matters until this is done — Stripe will not accept a real card.
2. **Decide the prices** (section 5). $19/$69/$199 as currently live, or
   $9/$29 as you mentioned.
3. **In Live mode**, create the webhook endpoint
   `https://www.timecut.online/api/stripe-webhook` with the four events listed
   above, delete the stale `https://www.timecut.online/` endpoint, and confirm
   the Customer Portal is configured with cancellation enabled.
4. **Set the live environment variables in Vercel** and redeploy:
   `STRIPE_SECRET_KEY` (`sk_live_...`), `VITE_STRIPE_PUBLISHABLE_KEY`
   (`pk_live_...`), and `STRIPE_WEBHOOK_SECRET` (the new `whsec_...`).
   Both keys must be live keys — a live secret key with a test publishable key
   will fail every payment.

Then run `npx tsx scripts/stripe-live-readiness.ts` with the live values. When
it reports **no blocking issues**, the real payment is safe to make.

**Your first real payment should then confirm, end to end:** the card is
charged → the plan activates within seconds → the credits appear → an analysis
runs → "Manage or Cancel Subscription" opens the portal → cancelling keeps
access until the period ends. I would rather you test with the cheapest plan and
cancel immediately afterwards.

---

## Appendix — what changed in the code today

| File | Change |
| --- | --- |
| `src/components/LandingPage.tsx`, `src/App.css` | Upload box moved into the hero; supporting copy moved below it |
| `api/_lib/stripe-admin.ts`, `api/stripe-webhook.ts`, `server/index.ts` | Webhook refuses unsigned events in live/deployed environments |
| `api/_lib/planConfig.ts`, `src/lib/planConfig.ts` | Stored `null` values no longer wipe plan defaults (the Custom-plan lockout) |
| `scripts/assistant-model-comparison.ts` | New — generates the Assistant before/after comparison |
| `scripts/stripe-live-readiness.ts` | New — read-only live-payment readiness check |
| `scripts/verify-refund-on-failure.ts` | New — end-to-end refund verification |

Verified after every change: ESLint clean, both TypeScript projects typecheck,
production build succeeds, and the homepage was re-checked in a real browser at
four viewport sizes.
