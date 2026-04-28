import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchContactsFromSheet } from '@/lib/integrations/sheets'
import { upsertContactsFromSheet } from '@/lib/integrations/supabase'
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
      console.warn('GOOGLE_SHEET_ID not configured, returning empty contacts')
      return res.status(200).json({ contacts: [], warning: 'Sheet ID not configured' })
    }

    const contacts = await fetchContactsFromSheet(sheetId, sheetTab)

    // Persist to Supabase (non-fatal — dashboard still loads from sheet data)
    if (contacts.length > 0) {
      upsertContactsFromSheet(contacts).then(({ upserted, errors }) => {
        if (errors > 0) console.warn(`Supabase upsert: ${upserted} ok, ${errors} failed`)
        else console.log(`✓ Upserted ${upserted} contacts to Supabase`)
      }).catch(err => console.error('Supabase upsert failed:', err.message))
    }

    return res.status(200).json({ contacts })
  } catch (error: any) {
    console.error('Sync sheets endpoint error:', error)
    return res.status(500).json({
      error: error.message || 'Failed to sync contacts from Google Sheet',
      contacts: [],
    })
  }
}
