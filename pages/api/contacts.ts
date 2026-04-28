import type { NextApiRequest, NextApiResponse } from 'next'
import { getSheetContacts } from '@/lib/integrations/supabase'
import { requireApiKey } from '@/lib/api-auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!requireApiKey(req, res)) return

  try {
    const contacts = await getSheetContacts()
    return res.status(200).json({ contacts })
  } catch (error: any) {
    console.error('GET /api/contacts error:', error)
    return res.status(500).json({ error: error.message || 'Failed to load contacts' })
  }
}
