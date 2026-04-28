import type { NextApiRequest, NextApiResponse } from 'next'
import { getEmailBody, verifyWebhookSignature } from '@/lib/integrations/gmail'
import { createMessage, getContact } from '@/lib/integrations/supabase'
import { NotFoundError } from '@/lib/integrations/errors'
import { requireApiKey } from '@/lib/api-auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!requireApiKey(req, res)) return

  try {
    const { encryptedMessage, signature, timestamp, messageId } = req.body

    if (!encryptedMessage || !signature) {
      return res.status(400).json({ error: 'encryptedMessage and signature are required' })
    }

    const isValid = await verifyWebhookSignature(signature, encryptedMessage)
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid webhook signature' })
    }

    let emailMessage
    try {
      emailMessage = await getEmailBody(messageId)
    } catch (error) {
      console.error('Failed to fetch email body:', error)
      return res.status(404).json({ error: 'Email message not found' })
    }

    if (!emailMessage) {
      return res.status(404).json({ error: 'Email message not found' })
    }

    const senderEmail = emailMessage.from
    const senderDomain = senderEmail.split('@')[1]

    let contact
    try {
      contact = await getContact(senderDomain)
    } catch (error) {
      if (error instanceof NotFoundError) {
        console.warn(`Received email from unknown domain: ${senderDomain}`)
      } else {
        throw error
      }
    }

    if (contact) {
      await createMessage({
        contact_id: contact.id,
        direction: 'inbound',
        from_email: emailMessage.from,
        to_email: emailMessage.to,
        subject: emailMessage.subject,
        body: emailMessage.body,
        gmail_message_id: emailMessage.id,
        sent_at: new Date().toISOString(),
      })
    }

    return res.status(200).json({
      status: 'message_received',
      messageId: emailMessage.id,
      contactDomain: senderDomain,
    })
  } catch (error: any) {
    console.error('Webhook error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}
