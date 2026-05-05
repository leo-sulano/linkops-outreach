import { getSupabaseClient } from '@/lib/integrations/supabase'
import { sendEmail } from './gmail'
import { pickSender, getLocalDate } from './rotate'
import { SenderAuthError } from './errors'
import { updateContactInSheet } from '@/lib/integrations/sheets'
import type { Contact } from '@/components/dashboard/types'
import type { SenderWithCount } from './rotate'

export async function sendOutreach(
  contact: Contact,
  subject: string,
  body: string
): Promise<{ sender_email: string; message_id: string }> {
  const sender = await pickSender()
  const client = getSupabaseClient()

  let messageId: string

  try {
    messageId = await sendEmail(sender, contact.email, subject, body)
  } catch (err: any) {
    // Log failure
    await client.from('outreach_logs').insert([{
      sender_id: sender.id,
      contact_domain: contact.domain,
      contact_email: contact.email,
      subject,
      status: 'failed',
      error: err.message,
    }])

    // If it's an auth error, mark the sender as broken
    const isAuthError = err instanceof SenderAuthError || /unauthenticated|invalid_grant|unauthorized/i.test(err.message ?? '')
    if (isAuthError) {
      await client
        .from('senders')
        .update({ status: 'error', last_error: err.message })
        .eq('id', sender.id)
    }

    throw err
  }

  // ── Success path ──────────────────────────────────────────────

  const today = getLocalDate(sender.timezone)

  // Atomic increment of daily count via Postgres function
  await client.rpc('increment_sender_daily_count', {
    p_sender_id: sender.id,
    p_date: today,
  })

  // Update last_used_at for round-robin ordering
  await client
    .from('senders')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', sender.id)

  // Write audit log
  await client.from('outreach_logs').insert([{
    sender_id: sender.id,
    contact_domain: contact.domain,
    contact_email: contact.email,
    subject,
    status: 'sent',
  }])

  // Assign sender email to the contact in Supabase contacts table
  await client
    .from('contacts')
    .update({ email_account: sender.email })
    .eq('domain', contact.domain)

  // Assign sender email to the contact in Google Sheet (col 10, best-effort)
  const sheetId = process.env.GOOGLE_SHEET_ID
  const sheetTab = process.env.GOOGLE_SHEET_TAB || 'Sheet1'
  if (sheetId) {
    try {
      const rowIndex = parseInt(contact.id, 10) - 1
      await updateContactInSheet(sheetId, rowIndex, { senderEmail: sender.email }, sheetTab)
    } catch (sheetErr) {
      console.warn('Could not write sender to Sheet (non-fatal):', sheetErr)
    }
  }

  return { sender_email: sender.email, message_id: messageId }
}

export async function sendOutreachWithSender(
  sender: SenderWithCount,
  contact: Contact,
  subject: string,
  body: string
): Promise<{ sender_email: string; message_id: string }> {
  const client = getSupabaseClient()
  let messageId: string

  try {
    messageId = await sendEmail(sender, contact.email, subject, body)
  } catch (err: any) {
    await client.from('outreach_logs').insert([{
      sender_id: sender.id,
      contact_domain: contact.domain,
      contact_email: contact.email,
      subject,
      status: 'failed',
      error: err.message,
    }])

    const isAuthError = err instanceof SenderAuthError || /unauthenticated|invalid_grant|unauthorized/i.test(err.message ?? '')
    if (isAuthError) {
      await client
        .from('senders')
        .update({ status: 'error', last_error: err.message })
        .eq('id', sender.id)
    }

    throw err
  }

  const today = getLocalDate(sender.timezone)

  await client.rpc('increment_sender_daily_count', {
    p_sender_id: sender.id,
    p_date: today,
  })

  await client
    .from('senders')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', sender.id)

  await client.from('outreach_logs').insert([{
    sender_id: sender.id,
    contact_domain: contact.domain,
    contact_email: contact.email,
    subject,
    status: 'sent',
  }])

  await client
    .from('contacts')
    .update({ email_account: sender.email })
    .eq('domain', contact.domain)

  const sheetId = process.env.GOOGLE_SHEET_ID
  const sheetTab = process.env.GOOGLE_SHEET_TAB || 'Sheet1'
  if (sheetId) {
    try {
      const rowIndex = parseInt(contact.id, 10) - 1
      await updateContactInSheet(sheetId, rowIndex, { senderEmail: sender.email }, sheetTab)
    } catch (sheetErr) {
      console.warn('Could not write sender to Sheet (non-fatal):', sheetErr)
    }
  }

  return { sender_email: sender.email, message_id: messageId }
}
