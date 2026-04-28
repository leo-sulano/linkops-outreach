import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchContactsFromSheet, updateContactInSheet } from '@/lib/integrations/sheets'
import { generateOutreachEmail } from '@/lib/claude'
import { sendOutreach } from '@/lib/senders/send'
import { requireApiKey } from '@/lib/api-auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!requireApiKey(req, res)) return

  const sheetId = process.env.GOOGLE_SHEET_ID
  const sheetTab = process.env.GOOGLE_SHEET_TAB || 'Sheet1'

  if (!sheetId) {
    return res.status(500).json({ error: 'GOOGLE_SHEET_ID not configured' })
  }

  try {
    const allContacts = await fetchContactsFromSheet(sheetId, sheetTab)
    const contacts = allContacts
      .filter(c => c.status === 'start_outreach' && c.email)
      .slice(0, 5)

    if (contacts.length === 0) {
      return res.status(200).json({ success: true, message: 'No contacts ready for outreach', sent: 0 })
    }

    let sent = 0
    const errors: string[] = []

    for (const contact of contacts) {
      try {
        const emailBody = await generateOutreachEmail(
          contact.contact || contact.domain,
          contact.email,
          contact.domain
        )

        const subject = `Link placement opportunity — ${contact.domain}`

        await sendOutreach(contact, subject, emailBody)

        // Mark as outreach_sent in sheet after successful send
        const rowIndex = parseInt(contact.id, 10) - 1
        await updateContactInSheet(sheetId, rowIndex, { status: 'outreach_sent' }, sheetTab)

        sent++
      } catch (err: any) {
        console.error(`Failed to send to ${contact.email}:`, err.message)
        errors.push(`${contact.email}: ${err.message}`)
      }
    }

    return res.status(200).json({
      success: true,
      sent,
      total: contacts.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('send-outreach error:', error)
    if (error.name === 'NoAvailableSenderError') {
      return res.status(503).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}
