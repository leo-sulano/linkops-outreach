import { NextApiRequest, NextApiResponse } from 'next'
import { generateOutreachEmail, generateEmailSubject } from '@/lib/claude'
import { getContact, createMessage } from '@/lib/integrations/supabase'
import { NotFoundError } from '@/lib/integrations/errors'
import { requireApiKey } from '@/lib/api-auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!requireApiKey(req, res)) return

  try {
    const { domain, publisherName, niche, contactName } = req.body

    if (!domain || !niche) {
      return res.status(400).json({ error: 'Missing required fields: domain, niche' })
    }

    const name = contactName || publisherName || 'there'

    let contact
    try {
      contact = await getContact(domain)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: `Contact not found for domain: ${domain}` })
      }
      throw error
    }

    const [subject, body] = await Promise.all([
      generateEmailSubject(name, domain, niche),
      generateOutreachEmail(name, contact.email1 || contact.email_account || '', domain),
    ])

    const message = await createMessage({
      contact_id: contact.id,
      direction: 'outbound',
      from_email: contact.email_account || process.env.DEFAULT_OUTREACH_EMAIL || 'outreach@linkops.io',
      to_email: contact.email1 || contact.email_account || '',
      subject,
      body,
      sent_at: new Date().toISOString(),
    })

    return res.status(200).json({
      success: true,
      domain,
      subject,
      body,
      messageId: message.id,
      createdAt: message.created_at,
    })
  } catch (error: any) {
    console.error('Generate outreach endpoint error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
