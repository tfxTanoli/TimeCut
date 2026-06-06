import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendWelcomeEmail } from './_lib/resend.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email, name } = req.body ?? {}
  if (!email) return res.status(400).json({ error: 'Missing email' })

  try {
    await sendWelcomeEmail(email, name ?? '')
    return res.json({ success: true })
  } catch (err) {
    console.error('[send-welcome-email] Error:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send welcome email' })
  }
}
