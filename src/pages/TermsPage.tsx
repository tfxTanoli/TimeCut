import Footer from '../components/Footer'

export default function TermsPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container page-hero-inner">
          <span className="hero-badge">Legal</span>
          <h1 className="page-hero-title">Terms of Service</h1>
          <p className="page-hero-sub">Last updated: June 2025</p>
        </div>
      </section>

      <section style={{ padding: '56px 0 80px' }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <div className="legal-doc">

            <h2>1. Acceptance of Terms</h2>
            <p>By accessing or using TimeCut ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.</p>

            <h2>2. Description of Service</h2>
            <p>TimeCut is an AI-powered content evaluation service that helps users assess whether content is worth their time. The Service analyzes text, URLs, and PDF documents and provides structured reports including verdicts, scores, and recommendations.</p>

            <h2>3. Account Registration</h2>
            <p>To access full features of TimeCut, you must create an account. You are responsible for:</p>
            <ul>
              <li>Providing accurate and complete registration information</li>
              <li>Maintaining the security of your password</li>
              <li>All activity that occurs under your account</li>
            </ul>

            <h2>4. Plans & Billing</h2>
            <p>TimeCut offers a Free plan and paid subscription plans (Starter, Pro, Business). Paid plans are billed monthly through Stripe. You may cancel your subscription at any time. No refunds are provided for partial billing periods unless required by applicable law.</p>
            <ul>
              <li><strong>Free</strong>:5 analyses/month, no credit card required</li>
              <li><strong>Starter</strong>:60 analyses/month at $9/month</li>
              <li><strong>Pro</strong>:300 analyses/month at $29/month</li>
              <li><strong>Business</strong>:2,000 analyses/month at $149/month</li>
            </ul>

            <h2>5. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Use the Service to analyze illegal, harmful, or malicious content</li>
              <li>Attempt to reverse-engineer, scrape, or abuse the Service</li>
              <li>Share your account credentials with others</li>
              <li>Create multiple free accounts to circumvent usage limits</li>
              <li>Use the Service for any purpose that violates applicable laws</li>
            </ul>

            <h2>6. Content & Privacy</h2>
            <p>Content you submit for analysis is processed by our AI engine. We do not permanently store the content you analyze. Please review our <a href="/privacy">Privacy Policy</a> for full details on how we handle your data.</p>

            <h2>7. Intellectual Property</h2>
            <p>TimeCut and its original content, features, and functionality are owned by TimeCut and are protected by international copyright and trademark laws. The AI-generated reports are provided for your personal use only.</p>

            <h2>8. Disclaimer of Warranties</h2>
            <p>The Service is provided "as is" without warranties of any kind. TimeCut does not guarantee that AI-generated reports are accurate, complete, or suitable for any specific purpose. Reports are intended to assist your decision-making, not replace it.</p>

            <h2>9. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, TimeCut shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service.</p>

            <h2>10. Termination</h2>
            <p>We reserve the right to suspend or terminate your account if you violate these Terms of Service. You may also close your account at any time by contacting us at <a href="mailto:support@timecut.online">support@timecut.online</a>.</p>

            <h2>11. Changes to Terms</h2>
            <p>We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the updated Terms.</p>

            <h2>12. Contact</h2>
            <p>For questions about these Terms, contact us at <a href="mailto:support@timecut.online">support@timecut.online</a>.</p>

          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}
