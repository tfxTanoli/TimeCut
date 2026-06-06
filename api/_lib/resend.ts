import { Resend } from 'resend'
import admin from 'firebase-admin'
import { getAdminDb } from './stripe-admin.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = 'TimeCut <support@timecut.online>'

export async function sendVerificationEmail(to: string, name: string) {
  // getAdminDb() handles init guard
  getAdminDb()
  const auth = admin.auth()
  const continueUrl = process.env.FRONTEND_URL ?? 'https://timecut.online'
  const verificationLink = await auth.generateEmailVerificationLink(to, { url: continueUrl })

  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Verify your TimeCut email address',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#0a0a0a;color:#e5e5e5;border-radius:12px;">
        <div style="text-align:center;margin-bottom:32px;">
          <h1 style="color:#d4af37;font-size:28px;margin:0;">TimeCut</h1>
          <p style="color:#888;margin:4px 0 0;">Cut through the noise.</p>
        </div>
        <h2 style="color:#ffffff;font-size:22px;">Welcome${name ? `, ${name}` : ''}!</h2>
        <p style="color:#aaa;line-height:1.6;">
          Thanks for signing up for <strong style="color:#d4af37;">TimeCut</strong>. Please verify your email address to get started.
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${verificationLink}" style="background:#d4af37;color:#0a0a0a;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Verify Email Address</a>
        </div>
        <p style="color:#666;font-size:13px;line-height:1.6;">
          If you did not create a TimeCut account, you can safely ignore this email.
          This link will expire in 24 hours.
        </p>
        <p style="color:#555;font-size:13px;text-align:center;margin-top:32px;">
          Questions? <a href="mailto:support@timecut.online" style="color:#d4af37;">support@timecut.online</a>
        </p>
      </div>
    `,
  })
  console.log(`[resend] Verification email sent to ${to}`)
}

export async function sendWelcomeEmail(to: string, name: string) {
  const firstName = name ? name.split(' ')[0] : 'there'
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Welcome to TimeCut, ${firstName}! 🎯`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#0a0a0a;color:#e5e5e5;border-radius:12px;">
        <div style="text-align:center;margin-bottom:32px;">
          <h1 style="color:#d4af37;font-size:28px;margin:0;">TimeCut</h1>
          <p style="color:#888;margin:4px 0 0;">Cut through the noise.</p>
        </div>
        <h2 style="color:#ffffff;font-size:22px;">Welcome aboard, ${firstName}!</h2>
        <p style="color:#aaa;line-height:1.6;">
          You've just unlocked smarter content decisions. TimeCut analyzes any article, email, PDF, or book chapter and tells you exactly whether it's worth your time — before you read a single word.
        </p>
        <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:20px;margin:24px 0;">
          <h3 style="color:#d4af37;margin:0 0 16px;">What you can do with TimeCut:</h3>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#aaa;font-size:14px;border-bottom:1px solid #222;"><span style="color:#d4af37;margin-right:8px;">✓</span> Paste text or upload a PDF</td></tr>
            <tr><td style="padding:8px 0;color:#aaa;font-size:14px;border-bottom:1px solid #222;"><span style="color:#d4af37;margin-right:8px;">✓</span> Get a verdict: Must Read, Skim Only, or Skip It</td></tr>
            <tr><td style="padding:8px 0;color:#aaa;font-size:14px;border-bottom:1px solid #222;"><span style="color:#d4af37;margin-right:8px;">✓</span> See exactly how many minutes you can safely skip</td></tr>
            <tr><td style="padding:8px 0;color:#aaa;font-size:14px;"><span style="color:#d4af37;margin-right:8px;">✓</span> Supports 12 languages</td></tr>
          </table>
        </div>
        <p style="color:#aaa;line-height:1.6;">
          Your free plan includes <strong style="color:#ffffff;">5 analyses per month</strong>. Need more? Upgrade anytime from your dashboard.
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="https://timecut.online" style="background:#d4af37;color:#0a0a0a;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Start Your First Analysis</a>
        </div>
        <p style="color:#555;font-size:13px;text-align:center;margin-top:32px;">
          Questions? <a href="mailto:support@timecut.online" style="color:#d4af37;">support@timecut.online</a>
        </p>
      </div>
    `,
  })
  console.log(`[resend] Welcome email sent to ${to}`)
}

export async function sendContactEmail(name: string, email: string, subject: string, message: string) {
  await resend.emails.send({
    from: FROM,
    to: 'support@timecut.online',
    replyTo: email,
    subject: `[Contact] ${subject || 'General Inquiry'} — from ${name}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#0a0a0a;color:#e5e5e5;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="color:#d4af37;font-size:24px;margin:0;">TimeCut</h1>
          <p style="color:#888;margin:4px 0 0;font-size:13px;">New message from Contact Form</p>
        </div>
        <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:20px;margin-bottom:20px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:8px 0;color:#888;font-size:13px;width:80px;border-bottom:1px solid #222;">Name</td>
              <td style="padding:8px 0;color:#fff;font-size:14px;border-bottom:1px solid #222;">${name}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#888;font-size:13px;border-bottom:1px solid #222;">Email</td>
              <td style="padding:8px 0;font-size:14px;border-bottom:1px solid #222;"><a href="mailto:${email}" style="color:#d4af37;">${email}</a></td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#888;font-size:13px;">Subject</td>
              <td style="padding:8px 0;color:#fff;font-size:14px;">${subject || 'General Inquiry'}</td>
            </tr>
          </table>
        </div>
        <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:20px;">
          <p style="color:#888;font-size:12px;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">Message</p>
          <p style="color:#e5e5e5;line-height:1.7;margin:0;white-space:pre-wrap;">${message}</p>
        </div>
        <p style="color:#555;font-size:12px;text-align:center;margin-top:24px;">
          Reply directly to this email to respond to ${name}.
        </p>
      </div>
    `,
  })
  console.log(`[resend] Contact email sent from ${email}`)
}
