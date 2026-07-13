import { NextApiRequest, NextApiResponse } from 'next'
import { requireApiKey } from '@/lib/api-auth'
import { startSelectedDomains } from '@/lib/leads/repository'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireApiKey(req, res)) return

  const { domains } = req.body as { domains?: unknown }
  if (
    !Array.isArray(domains) ||
    domains.length === 0 ||
    !domains.every((d) => typeof d === 'string')
  ) {
    return res.status(400).json({ error: 'domains must be a non-empty array of strings' })
  }

  try {
    const { resumed, queued } = await startSelectedDomains(domains)
    return res.status(200).json({ resumed, queued })
  } catch (err: any) {
    console.error('[leads/start-selected]', err)
    return res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}
