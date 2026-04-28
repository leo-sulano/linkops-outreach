import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchContactsFromSheet } from '@/lib/integrations/sheets'
import { requireApiKey } from '@/lib/api-auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!requireApiKey(req, res)) return

  try {
    const sheetId = process.env.GOOGLE_SHEET_ID
    const sheetTab = process.env.GOOGLE_SHEET_TAB || 'Sheet1'

    if (!sheetId) {
      console.warn('GOOGLE_SHEET_ID not configured, returning empty contacts')
      return res.status(200).json({ contacts: [], warning: 'Sheet ID not configured' })
    }

    const contacts = await fetchContactsFromSheet(sheetId, sheetTab)

    return res.status(200).json({ contacts })
  } catch (error: any) {
    console.error('Sync sheets endpoint error:', error)
    return res.status(500).json({
      error: error.message || 'Failed to sync contacts from Google Sheet',
      contacts: [],
    })
  }
}
