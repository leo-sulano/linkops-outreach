import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchContactsFromSheet, updateContactInSheet } from '@/lib/integrations/sheets'
import { getMockSubject, getMockBody } from '@/lib/mocks/paulResponses'
import { sendOutreachWithSender } from '@/lib/senders/send'
import { requireApiKey } from '@/lib/api-auth'
import { getSupabaseClient } from '@/lib/integrations/supabase'
import { decryptCredential } from '@/lib/crypto'
import { getLocalDate } from '@/lib/senders/rotate'
import type { Sender } from '@/lib/senders/types'
import type { SenderWithCount } from '@/lib/senders/rotate'

interface SenderResult {
  sender: string
  sent: number
  errors: string[]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!requireApiKey(req, res)) return

  const { senderIds, emailsPerSender, campaignName } = req.body

  if (!senderIds || (senderIds !== 'all' && !Array.isArray(senderIds)) || !emailsPerSender || typeof emailsPerSender !== 'number' || emailsPerSender < 1) {
    return res.status(400).json({ error: 'senderIds must be "all" or an array of IDs, and emailsPerSender must be a positive number' })
  }

  const sheetId = process.env.GOOGLE_SHEET_ID
  const sheetTab = process.env.GOOGLE_SHEET_TAB || 'Sheet1'

  if (!sheetId) {
    return res.status(500).json({ error: 'GOOGLE_SHEET_ID not configured' })
  }

  try {
    const allContacts = await fetchContactsFromSheet(sheetId, sheetTab)
    const contacts = allContacts.filter((c) => c.status === 'start_outreach' && c.email)

    if (contacts.length === 0) {
      return res.status(200).json({ success: true, message: 'No contacts ready for outreach', sent: 0, total: 0, results: [] })
    }

    const supabase = getSupabaseClient()
    let sendersQuery = supabase.from('senders').select('*').eq('status', 'active')
    if (senderIds !== 'all') {
      sendersQuery = (sendersQuery as any).in('id', senderIds)
    }
    const { data: rawSenders, error: senderError } = await sendersQuery
    if (senderError) return res.status(500).json({ error: (senderError as any).message })
    if (!rawSenders || (rawSenders as any[]).length === 0) {
      return res.status(400).json({ error: 'No active senders found' })
    }

    const senders: SenderWithCount[] = await Promise.all(
      (rawSenders as Sender[]).map(async (s) => {
        const today = getLocalDate(s.timezone)
        const { data: stat } = await supabase
          .from('sender_daily_stats')
          .select('sent_count')
          .eq('sender_id', s.id)
          .eq('date', today)
          .maybeSingle()
        return {
          ...s,
          credential_json: decryptCredential(s.credential_json),
          sent_today: (stat as any)?.sent_count ?? 0,
        }
      })
    )

    let totalSent = 0
    let totalAttempted = 0
    const results: SenderResult[] = []

    for (let i = 0; i < senders.length; i++) {
      const sender = senders[i]
      const remaining = Math.max(0, sender.daily_limit - sender.sent_today)
      const limit = Math.min(emailsPerSender, remaining)
      const batch = contacts.slice(i * emailsPerSender, i * emailsPerSender + limit)
      const senderResult: SenderResult = { sender: sender.email, sent: 0, errors: [] }

      for (const contact of batch) {
        totalAttempted++
        try {
          const subject = getMockSubject('standard', contact.domain, contact.niche, contact.contact)
          const body = getMockBody('standard', contact.domain, contact.niche, contact.contact)

          await sendOutreachWithSender(sender, contact, subject, body)

          const rowIndex = parseInt(contact.id, 10) - 1
          await updateContactInSheet(sheetId, rowIndex, { status: 'outreach_sent' }, sheetTab)

          senderResult.sent++
          totalSent++
        } catch (err: any) {
          senderResult.errors.push(`${contact.email}: ${err.message}`)
        }
      }

      results.push(senderResult)
    }

    // Log campaign to Supabase — awaited so it completes before response on serverless
    try {
      await supabase
        .from('campaigns')
        .insert({
          name: campaignName && typeof campaignName === 'string' && campaignName.trim() ? campaignName.trim() : null,
          sent: totalSent,
          total: totalAttempted,
          results,
        })
    } catch (err: any) {
      console.error('campaigns insert error:', err.message)
    }

    return res.status(200).json({
      success: true,
      sent: totalSent,
      total: totalAttempted,
      results,
    })
  } catch (error: any) {
    console.error('send-campaign error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}
