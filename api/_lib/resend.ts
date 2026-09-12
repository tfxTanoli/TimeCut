import { Resend } from 'resend'
import admin from 'firebase-admin'
import { getAdminDb } from './stripe-admin.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = 'TimeCut <support@timecut.online>'
const SUPPORT_ADDRESS = 'support@timecut.online'

/**
 * Escape a value before it goes into an email body.
 *
 * Every string below arrives from a request body. Interpolated raw, a `name` of
 * `<a href="http://evil">Click here</a>` rendered as a working link in the
 * recipient's mail client — which turned a transactional email sent from our
 * own verified domain into a phishing vehicle. Mail clients strip scripts, but
 * they render anchors, images and styles perfectly well, so the fix is to stop
 * treating these as markup at all.
 */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Strip CR/LF so a value cannot inject extra mail headers from a subject. */
function headerSafe(value: unknown): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200)
}

/** Escape for use inside an href/attribute, dropping anything non-mailto-safe. */
function escAddress(value: unknown): string {
  const raw = String(value ?? '').trim()
  // A plausible address only. Anything else becomes empty rather than being
  // written into an href.
  return /^[^\s<>"']{1,254}@[^\s<>"']{1,254}$/.test(raw) ? esc(raw) : ''
}

/**
 * Thrown when the address has no account here.
 *
 * Callers must treat this as a success for the *caller* (returning a distinct
 * response would turn these routes into a way to test which addresses are
 * registered) while still letting a genuine delivery failure surface as an
 * error. Collapsing the two is how "email resent!" ends up being shown to
 * someone who will never receive anything.
 */
export class NoSuchAccountError extends Error {
  constructor(email: string) {
    super(`No account for ${email}`)
    this.name = 'NoSuchAccountError'
  }
}

/** True when a Firebase Admin error means "that address has no account". */
function isUserNotFound(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e
    && (e as { code: unknown }).code === 'auth/user-not-found'
}

/**
 * Throw NoSuchAccountError when no account exists for this address.
 *
 * Checked with `getUserByEmail` rather than by reading the error off the
 * link-generation call, because the two link APIs disagree about how they
 * report a missing user:
 *
 *   generateEmailVerificationLink -> auth/user-not-found
 *   generatePasswordResetLink     -> auth/internal-error
 *                                    ("INTERNAL ASSERT FAILED: Unable to
 *                                     create the email action link")
 *
 * Matching on the link call's code therefore worked for one and silently
 * failed for the other, which turned "no such account" into a 500 on the
 * password-reset route. `getUserByEmail` reports it the same way every time.
 */
async function assertAccountExists(email: string): Promise<void> {
  try {
    await admin.auth().getUserByEmail(email)
  } catch (e) {
    if (isUserNotFound(e)) throw new NoSuchAccountError(email)
    throw e
  }
}

/**
 * Firebase's opaque failure when it cannot build an action link. In practice
 * this is a deleted-mid-request account, so it is treated the same way rather
 * than surfacing an internal assert to the caller.
 */
function isActionLinkFailure(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const code = (e as { code?: unknown }).code
  const message = String((e as { message?: unknown }).message ?? '')
  return code === 'auth/internal-error' && /email action link/i.test(message)
}

export async function sendVerificationEmail(to: string, name: string) {
  // getAdminDb() handles init guard
  getAdminDb()
  const auth = admin.auth()
  const continueUrl = process.env.FRONTEND_URL ?? 'https://timecut.online'
  await assertAccountExists(to)

  let verificationLink: string
  try {
    verificationLink = await auth.generateEmailVerificationLink(to, { url: continueUrl })
  } catch (e) {
    if (isUserNotFound(e) || isActionLinkFailure(e)) throw new NoSuchAccountError(to)
    throw e
  }

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
        <h2 style="color:#ffffff;font-size:22px;">Welcome${name ? `, ${esc(name)}` : ''}!</h2>
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

/**
 * Password reset.
 *
 * Firebase's client SDK can send this on its own, but it sends from Firebase's
 * own address with Google's default template — which, in the one flow where a
 * user is most alert to phishing, looks nothing like the verification and
 * welcome mail they already had from support@timecut.online. The link is
 * generated with the Admin SDK and delivered through the same sender as
 * everything else instead.
 */
export async function sendPasswordResetEmail(to: string, name: string) {
  getAdminDb()
  const auth = admin.auth()
  const continueUrl = process.env.FRONTEND_URL ?? 'https://timecut.online'
  await assertAccountExists(to)

  let resetLink: string
  try {
    resetLink = await auth.generatePasswordResetLink(to, { url: continueUrl })
  } catch (e) {
    if (isUserNotFound(e) || isActionLinkFailure(e)) throw new NoSuchAccountError(to)
    throw e
  }

  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Reset your TimeCut password',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#0a0a0a;color:#e5e5e5;border-radius:12px;">
        <div style="text-align:center;margin-bottom:32px;">
          <h1 style="color:#d4af37;font-size:28px;margin:0;">TimeCut</h1>
          <p style="color:#888;margin:4px 0 0;">Cut through the noise.</p>
        </div>
        <h2 style="color:#ffffff;font-size:22px;">Reset your password${name ? `, ${esc(name)}` : ''}</h2>
        <p style="color:#aaa;line-height:1.6;">
          We received a request to set a new password for your <strong style="color:#d4af37;">TimeCut</strong> account.
          Click the button below to choose one.
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${resetLink}" style="background:#d4af37;color:#0a0a0a;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Set a New Password</a>
        </div>
        <p style="color:#666;font-size:13px;line-height:1.6;">
          This link expires in one hour and can only be used once.
          If you did not ask to reset your password you can safely ignore this email &mdash;
          your current password will keep working and nothing has changed on your account.
        </p>
        <p style="color:#555;font-size:13px;text-align:center;margin-top:32px;">
          Questions? <a href="mailto:support@timecut.online" style="color:#d4af37;">support@timecut.online</a>
        </p>
      </div>
    `,
  })
  console.log(`[resend] Password reset email sent to ${to}`)
}

export async function sendWelcomeEmail(to: string, name: string) {
  const firstName = esc(name ? name.split(' ')[0] : 'there')
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
          You've just unlocked smarter decisions. TimeCut analyzes your documents — contracts, proposals, CVs, supplier quotes and more — and gives you a clear AI Decision Report: the recommendation, the hidden risks, the missing information, and the evidence behind it.
        </p>
        <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:20px;margin:24px 0;">
          <h3 style="color:#d4af37;margin:0 0 16px;">What you can do with TimeCut:</h3>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#aaa;font-size:14px;border-bottom:1px solid #222;"><span style="color:#d4af37;margin-right:8px;">✓</span> Upload your documents and get a clear recommendation</td></tr>
            <tr><td style="padding:8px 0;color:#aaa;font-size:14px;border-bottom:1px solid #222;"><span style="color:#d4af37;margin-right:8px;">✓</span> See hidden risks, missing information &amp; a confidence score</td></tr>
            <tr><td style="padding:8px 0;color:#aaa;font-size:14px;border-bottom:1px solid #222;"><span style="color:#d4af37;margin-right:8px;">✓</span> Review the evidence found across your documents</td></tr>
            <tr><td style="padding:8px 0;color:#aaa;font-size:14px;"><span style="color:#d4af37;margin-right:8px;">✓</span> Supports 12 languages</td></tr>
          </table>
        </div>
        <p style="color:#aaa;line-height:1.6;">
          Your free plan includes <strong style="color:#ffffff;">1 free report</strong> (up to 20 pages, 3 documents) with hidden risks, missing information, a confidence score and evidence found. Need more? Upgrade anytime from your dashboard.
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
  // A malformed or injected address must not end up in Reply-To, where a mail
  // client would happily use it.
  const replyAddress = escAddress(email)

  await resend.emails.send({
    from: FROM,
    to: SUPPORT_ADDRESS,
    ...(replyAddress ? { replyTo: email.trim() } : {}),
    // Header values, not HTML: newlines would let a caller inject extra
    // headers, so they are stripped rather than escaped.
    subject: `[Contact] ${headerSafe(subject) || 'General Inquiry'} — from ${headerSafe(name)}`,
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
              <td style="padding:8px 0;color:#fff;font-size:14px;border-bottom:1px solid #222;">${esc(name)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#888;font-size:13px;border-bottom:1px solid #222;">Email</td>
              <td style="padding:8px 0;font-size:14px;border-bottom:1px solid #222;">${replyAddress ? `<a href="mailto:${replyAddress}" style="color:#d4af37;">${replyAddress}</a>` : esc(email)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#888;font-size:13px;">Subject</td>
              <td style="padding:8px 0;color:#fff;font-size:14px;">${esc(subject) || 'General Inquiry'}</td>
            </tr>
          </table>
        </div>
        <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:20px;">
          <p style="color:#888;font-size:12px;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">Message</p>
          <p style="color:#e5e5e5;line-height:1.7;margin:0;white-space:pre-wrap;">${esc(message)}</p>
        </div>
        <p style="color:#555;font-size:12px;text-align:center;margin-top:24px;">
          Reply directly to this email to respond to ${esc(name)}.
        </p>
      </div>
    `,
  })
  console.log(`[resend] Contact email sent from ${email}`)
}
