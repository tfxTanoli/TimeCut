import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendContactEmail } from './_lib/resend.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { name, email, subject, message } = req.body ?? {}
  if (!name || !email || !message) return res.status(400).json({ error: 'Missing required fields' })

  try {
    await sendContactEmail(name, email, subject ?? '', message)
    return res.json({ success: true })
  } catch (err) {
    console.error('[send-contact-email] Error:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send contact email' })
  }
}
