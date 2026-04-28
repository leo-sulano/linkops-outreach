import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchContactsFromSheet } from '@/lib/integrations/sheets'
import { upsertSheetContacts } from '@/lib/integrations/supabase'
import { requireApiKey } from '@/lib/api-auth'
import { throttle } from '@/lib/rate-limit'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!requireApiKey(req, res)) return

  if (!throttle('sync-sheets', 5_000)) {
    return res.status(429).json({ error: 'Too many requests — wait a few seconds' })
  }

  try {
    const sheetId = process.env.GOOGLE_SHEET_ID
    const sheetTab = process.env.GOOGLE_SHEET_TAB || 'Sheet1'

    if (!sheetId) {
      return res.status(500).json({ error: 'GOOGLE_SHEET_ID not configured' })
    }

    // 1. Fetch latest from Google Sheet
    const contacts = await fetchContactsFromSheet(sheetId, sheetTab)

    // 2. Persist to Supabase in background — don't block the response
    if (contacts.length > 0) {
      upsertSheetContacts(contacts)
        .then(() => console.log(`✓ Upserted ${contacts.length} contacts to Supabase`))
        .catch(err => console.error('Supabase upsert failed:', err.message))
    }

    // 3. Return fresh contacts immediately — no waiting for Supabase
    return res.status(200).json({ contacts, synced: contacts.length })
  } catch (error: any) {
    console.error('Sync sheets endpoint error:', error)
    return res.status(500).json({
      error: error.message || 'Failed to sync contacts from Google Sheet',
    })
  }
}
