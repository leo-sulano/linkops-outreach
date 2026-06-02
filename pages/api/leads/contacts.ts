import { NextApiRequest, NextApiResponse } from 'next'
import { requireApiKey } from '@/lib/api-auth'
import {
  getContacts,
  getLeadStats,
  getNewLeads,
  getOutreachReady,
} from '@/lib/leads/repository'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireApiKey(req, res)) return

  const { view, search, vertical, page, perPage } = req.query

  try {
    if (view === 'stats') {
      return res.status(200).json(await getLeadStats())
    }
    if (view === 'new-leads') {
      return res.status(200).json({ leads: await getNewLeads() })
    }
    if (view === 'outreach-ready') {
      return res.status(200).json({ contacts: await getOutreachReady() })
    }

    const result = await getContacts({
      search: typeof search === 'string' ? search : undefined,
      vertical: typeof vertical === 'string' ? vertical : undefined,
      page: page ? parseInt(page as string, 10) : 1,
      perPage: perPage ? parseInt(perPage as string, 10) : 50,
    })
    return res.status(200).json(result)
  } catch (err: any) {
    console.error('[leads/contacts]', err)
    return res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}
