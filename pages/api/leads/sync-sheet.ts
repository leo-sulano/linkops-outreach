import { NextApiRequest, NextApiResponse } from 'next'
import { requireApiKey } from '@/lib/api-auth'
import { getContacts } from '@/lib/leads/repository'
import { updateContactsInSheet } from '@/lib/leads/sheets-service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireApiKey(req, res)) return

  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID!
    const contactsTab = process.env.GOOGLE_CONTACTS_SHEET_TAB || 'Contacts'
    const { contacts } = await getContacts({ perPage: 10000 })
    const { updated, notFound } = await updateContactsInSheet(spreadsheetId, contactsTab, contacts)
    return res.status(200).json({ total: contacts.length, updated, notFound })
  } catch (err: any) {
    console.error('[leads/sync-sheet]', err)
    return res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}
