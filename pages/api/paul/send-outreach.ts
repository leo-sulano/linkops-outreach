import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '@/lib/prisma'
import { generateOutreachEmail } from '@/lib/claude'
import { sendOutreach } from '@/lib/senders/send'
import type { Contact } from '@/components/dashboard/types'
import { requireApiKey } from '@/lib/api-auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!requireApiKey(req, res)) return

  try {
    const contacts = await prisma.prospect.findMany({
      where: { status: 'OUTREACH_SENT' },
      take: 5,
    })

    if (contacts.length === 0) {
      return res.status(200).json({ success: true, message: 'No contacts to send outreach to', sent: 0 })
    }

    let sent = 0
    const errors: string[] = []

    for (const prospect of contacts) {
      try {
        const emailBody = await generateOutreachEmail(
          prospect.name,
          prospect.email,
          prospect.websiteCategory || 'their-website.com'
        )

        const subject = `Link placement opportunity — ${prospect.websiteCategory || 'your site'}`

        const contact: Contact = {
          id: String(prospect.id),
          domain: prospect.websiteCategory || prospect.email.split('@')[1] || '',
          website: '',
          niche: prospect.websiteCategory || '',
          contact: prospect.name,
          email: prospect.email,
          status: 'outreach_sent',
          linkType: '',
          notes: '',
        }

        await sendOutreach(contact, subject, emailBody)
        sent++
      } catch (err: any) {
        console.error(`Failed to send to ${prospect.email}:`, err.message)
        errors.push(`${prospect.email}: ${err.message}`)
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
