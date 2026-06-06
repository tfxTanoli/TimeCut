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

            <h2>3. Data Storage</h2>
            <p>Your account data is stored in Google Firebase (Firestore). Payment information is handled entirely by Stripe and is never stored on TimeCut servers. Analyzed content is sent to OpenAI's API for processing and is subject to OpenAI's data handling policies.</p>

            <h2>4. Cookies & Analytics</h2>
            <p>We use Vercel Analytics to understand how users interact with TimeCut. This data is anonymized and does not personally identify you. We do not use advertising cookies or sell your data to third parties.</p>

            <h2>5. Email Communications</h2>
            <p>We send emails through Resend from <strong>support@timecut.online</strong>. These include account verification emails and subscription confirmations. You will not receive marketing emails unless you explicitly subscribe to our newsletter.</p>

            <h2>6. Third-Party Services</h2>
            <p>TimeCut integrates with the following third-party services:</p>
            <ul>
              <li><strong>Firebase (Google)</strong> — authentication and database</li>
              <li><strong>Stripe</strong> — payment processing</li>
              <li><strong>OpenAI</strong> — AI content analysis</li>
              <li><strong>Resend</strong> — transactional email delivery</li>
              <li><strong>Vercel</strong> — hosting and analytics</li>
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
