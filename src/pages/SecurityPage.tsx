import { Link } from 'react-router-dom'
import Footer from '../components/Footer'

/**
 * Public /security page. The footer has always linked here, but the route did
 * not exist, so the link rendered a blank page.
 *
 * Everything stated below describes what the product actually does today —
 * Firebase Auth with verified email, per-account Firestore rules, server-side
 * ID-token verification on every paid route, Stripe-hosted payment data, and
 * uploads that are parsed in memory and never persisted. Keep it in sync with
 * the code if any of that changes.
 */
export default function SecurityPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">Trust &amp; Safety</span>
          <h1 className="page-hero-title">Security at TimeCut</h1>
          <p className="page-hero-sub">
            How your documents, your account and your payment details are protected. Last updated: September 2025.
          </p>
        </div>
      </section>

      <section style={{ padding: '56px 0 80px' }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <div className="legal-doc">

            <h2>1. The Short Version</h2>
            <ul>
              <li>Documents you upload are analyzed in memory and are <strong>not stored</strong> on TimeCut servers after your report is generated.</li>
              <li>Everything travels over HTTPS/TLS — in transit to us, and on to our processors.</li>
              <li>Your saved reports are readable only by your own account, enforced by database rules rather than by the interface alone.</li>
              <li>TimeCut never sees or stores your card number. Payments are handled entirely by Stripe.</li>
              <li>We do not sell your data, and your documents are not used to train AI models.</li>
            </ul>

            <h2>2. How Your Documents Are Handled</h2>
            <p>When you start an analysis, your files are uploaded over an encrypted connection to our analysis endpoint. Text is extracted from the file in memory, sent to OpenAI's API to produce your report, and the uploaded file is discarded once the request finishes. TimeCut does not keep a copy of the original document and does not write it to any file storage bucket.</p>
            <p>What we do keep is the <em>report</em>: when you are signed in, the structured result (verdict, scores, key insights, recommended next steps) is saved to your own account so you can find it again from your profile. You can ask us to delete it at any time.</p>
            <p>OpenAI processes your text on TimeCut's behalf. Under OpenAI's API terms, content submitted through the API is <strong>not used to train their models by default</strong>. See the <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer">OpenAI Privacy Policy</a> for their retention practices.</p>

            <h2>3. Encryption</h2>
            <p>The TimeCut website and API are served exclusively over HTTPS (TLS). Traffic between our servers and our processors — Firebase, OpenAI, Stripe and Resend — is likewise encrypted in transit. Data stored in Google Firestore is encrypted at rest by Google Cloud.</p>

            <h2>4. Accounts and Authentication</h2>
            <p>Accounts are managed by Firebase Authentication. You can sign in with an email and password, or with Google.</p>
            <ul>
              <li>TimeCut never stores your password. Firebase stores a salted hash of it — we cannot read it, and neither can our support team.</li>
              <li>Email-and-password accounts must confirm their address before they can sign in; an unverified account is signed straight back out.</li>
              <li>Sessions use short-lived Firebase ID tokens that refresh automatically and can be revoked.</li>
            </ul>

            <h2>5. Access Control</h2>
            <p>Your data is isolated per account by Firestore security rules that run on Google's servers, so the protection holds even for a request that never touches our interface:</p>
            <ul>
              <li>Your user profile, saved reports, activity history and credit ledger are readable only by you — and by an administrator for support purposes.</li>
              <li>Billing-critical fields — plan, subscription status, Stripe identifiers, credit balance and usage counters — are <strong>read-only to the browser</strong>. Only our server writes them, and only after verifying a Stripe event, so an account cannot grant itself a plan or reset its own usage.</li>
              <li>Every API route that spends money or changes a plan verifies your Firebase ID token server-side and acts on the identity inside that verified token, never on a user ID supplied in the request body.</li>
              <li>Administrator access is limited to an explicit allowlist of email addresses.</li>
            </ul>

            <h2>6. Payments</h2>
            <p>All payments and subscriptions run through <a href="https://stripe.com/docs/security" target="_blank" rel="noopener noreferrer">Stripe</a>, a PCI-DSS Level 1 certified provider. Card details are entered into Stripe's own hosted payment elements and go directly to Stripe; they never pass through TimeCut servers. We store only the Stripe customer and subscription identifiers needed to manage your plan, and cancellations run through Stripe's own billing portal.</p>
            <p>Incoming Stripe webhooks are verified against their signature using the raw request body, so a forged request cannot activate or extend a subscription.</p>

            <h2>7. Subprocessors</h2>
            <p>TimeCut relies on the following providers, each with its own security program:</p>
            <ul>
              <li><strong>Google Firebase</strong>: authentication and the Firestore database — encrypted at rest, with per-account rules.</li>
              <li><strong>OpenAI</strong>: the AI analysis that produces your report. API content is not used for model training by default.</li>
              <li><strong>Stripe</strong>: payments, subscriptions and the billing portal (PCI-DSS Level 1).</li>
              <li><strong>Vercel</strong>: hosting for the website and the serverless API, with TLS termination and anonymous analytics.</li>
              <li><strong>Resend</strong>: transactional email — verification and subscription messages sent from support@timecut.online.</li>
            </ul>

            <h2>8. Data Retention and Deletion</h2>
            <p>Account data is retained while your account is active. Uploaded documents are not retained at all. To delete your account together with its saved reports and usage history, email <a href="mailto:support@timecut.online">support@timecut.online</a> from the address on the account. The <Link to="/privacy">Privacy Policy</Link> covers in full what we collect and why.</p>

            <h2>9. Responsible Disclosure</h2>
            <p>If you believe you have found a vulnerability in TimeCut, please email <a href="mailto:support@timecut.online">support@timecut.online</a> with enough detail to reproduce it. Please give us a reasonable window to fix the issue before disclosing it publicly, and while testing please avoid accessing other people's data, degrading the service, or running automated scans against production. We will acknowledge your report and keep you updated on the fix.</p>

            <h2>10. What We Do Not Claim</h2>
            <p>TimeCut is an independent product, not an enterprise compliance platform. We do not currently hold a SOC 2 or ISO 27001 certification, and we do not offer HIPAA coverage or sign Business Associate Agreements — please do not upload protected health information. No system can be guaranteed completely secure, and you remain responsible for deciding what is appropriate to upload. If your organization needs a security review, a data processing agreement, or a custom retention arrangement, get in touch through the <Link to="/contact">contact page</Link> and we will tell you plainly what we can and cannot support.</p>

            <h2>11. Contact</h2>
            <p>Security questions of any kind: <a href="mailto:support@timecut.online">support@timecut.online</a>.</p>

          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}
