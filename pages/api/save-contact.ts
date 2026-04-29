import type { NextApiRequest, NextApiResponse } from 'next'
import { updateContactInSheet } from '@/lib/integrations/sheets'
import { updateSheetContact } from '@/lib/integrations/supabase'
import type { Contact } from '@/components/dashboard/types'
import { requireApiKey } from '@/lib/api-auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!requireApiKey(req, res)) return

  try {
    const { contact, rowIndex } = req.body as { contact: Contact; rowIndex: number }

    if (!contact || rowIndex === undefined) {
      return res.status(400).json({ error: 'contact and rowIndex are required' })
    }

    const sheetId = process.env.GOOGLE_SHEET_ID
    const sheetTab = process.env.GOOGLE_SHEET_TAB || 'Sheet1'

    if (!sheetId) {
      return res.status(400).json({ error: 'GOOGLE_SHEET_ID not configured' })
    }

    // Write to Google Sheet and Supabase in parallel
    await Promise.all([
      updateContactInSheet(sheetId, rowIndex, contact, sheetTab),
      updateSheetContact(rowIndex, contact),
    ])

    return res.status(200).json({ success: true })
  } catch (error: any) {
    console.error('Save contact error:', error)
    return res.status(500).json({ error: error.message || 'Failed to save contact' })
  }
}
