import { NextApiRequest, NextApiResponse } from 'next'
import { requireApiKey } from '@/lib/api-auth'
import { getJobsByRunId } from '@/lib/leads/repository'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireApiKey(req, res)) return

  const { runId } = req.query
  if (!runId || typeof runId !== 'string') {
    return res.status(400).json({ error: 'runId query param required' })
  }

  try {
    const jobs = await getJobsByRunId(runId)
    return res.status(200).json({ jobs })
  } catch (err: any) {
    console.error('[leads/job-status]', err)
    return res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}
