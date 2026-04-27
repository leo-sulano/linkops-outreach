import type { NextApiRequest, NextApiResponse } from 'next'
import { updateContactInSheet } from '@/lib/integrations/sheets'
import type { Contact } from '@/components/dashboard/types'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

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

    await updateContactInSheet(sheetId, rowIndex, contact, sheetTab)

    return res.status(200).json({ success: true, message: 'Contact saved to Sheet' })
  } catch (error: any) {
    console.error('Save contact endpoint error:', error)
    return res.status(500).json({
      error: error.message || 'Failed to save contact to Google Sheet',
    })
  }
}
