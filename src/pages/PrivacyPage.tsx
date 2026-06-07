import Footer from '../components/Footer'

export default function PrivacyPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">Legal</span>
          <h1 className="page-hero-title">Privacy Policy</h1>
          <p className="page-hero-sub">Last updated: June 2025</p>
        </div>
      </section>

      <section style={{ padding: '56px 0 80px' }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <div className="legal-doc">

            <h2>1. Information We Collect</h2>
            <p>When you create an account, we collect your name, email address, and usage data. When you use TimeCut to analyze content, that content is processed by our AI engine but is not stored permanently.</p>

            <h2>2. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul>
              <li>Provide and improve the TimeCut service</li>
              <li>Send transactional emails (account verification, subscription confirmations)</li>
              <li>Track your monthly analysis usage against your plan limits</li>
              <li>Process payments securely through Stripe</li>
            </ul>

            <h2>3. Data Storage & AI Processing</h2>
            <p>Your account data (name, email, usage statistics, subscription status) is stored in Google Firebase Firestore, secured by Firebase security rules. Payment information is handled entirely by Stripe — TimeCut never stores your card details.</p>
            <p>When you submit content for analysis, that text is transmitted to OpenAI's API. OpenAI processes it to generate your Time Intelligence Report. <strong>TimeCut does not permanently store the content you submit for analysis.</strong> OpenAI's data handling is governed by their <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>. By default, OpenAI does not use API data to train its models. Content you submit is processed in transit and is not retained on TimeCut servers after the report is generated.</p>

            <h2>4. Cookies & Analytics</h2>
            <p>We use Vercel Analytics to understand how users interact with TimeCut. This data is anonymized and does not personally identify you. We do not use advertising cookies or sell your data to third parties.</p>

            <h2>5. Email Communications</h2>
            <p>We send emails through Resend from <strong>support@timecut.online</strong>. These include account verification emails and subscription confirmations. You will not receive marketing emails unless you explicitly subscribe to our newsletter.</p>

            <h2>6. Third-Party Services</h2>
            <p>TimeCut is built using the following third-party services, each of which has its own privacy policy and data practices:</p>
            <ul>
              <li><strong>Firebase / Google</strong> — User authentication (Firebase Auth) and database storage (Firestore). Data is stored on Google Cloud servers. See <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer">Firebase Privacy</a>.</li>
              <li><strong>Stripe</strong> — Payment processing and subscription management. All payment data is PCI-DSS compliant and managed by Stripe. TimeCut never sees your raw card number. See <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">Stripe Privacy</a>.</li>
              <li><strong>OpenAI</strong> — AI-powered content analysis. Text you submit is sent to OpenAI's API to generate your report. OpenAI does not use API data for model training by default. See <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer">OpenAI Privacy</a>.</li>
              <li><strong>Resend</strong> — Transactional email delivery (verification emails, subscription confirmations). See <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Resend Privacy</a>.</li>
              <li><strong>Vercel</strong> — Web hosting, serverless functions, and anonymous analytics. See <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Vercel Privacy</a>.</li>
            </ul>

            <h2>7. Data Retention</h2>
            <p>We retain your account data as long as your account is active. You may request deletion of your account and associated data by contacting us at <a href="mailto:support@timecut.online">support@timecut.online</a>.</p>

            <h2>8. Security</h2>
            <p>We implement industry-standard security measures including HTTPS encryption, Firebase security rules, and Stripe's PCI-compliant payment processing. However, no system is 100% secure and we cannot guarantee absolute security.</p>

            <h2>9. Children's Privacy</h2>
            <p>TimeCut is not directed at children under 13. We do not knowingly collect personal information from children under 13.</p>

            <h2>10. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of any significant changes by email or by posting a notice on the TimeCut website.</p>

            <h2>11. Contact Us</h2>
            <p>If you have questions about this Privacy Policy, please contact us at <a href="mailto:support@timecut.online">support@timecut.online</a>.</p>

          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}
