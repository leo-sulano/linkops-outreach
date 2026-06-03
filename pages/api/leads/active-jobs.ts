import { NextApiRequest, NextApiResponse } from 'next'
import { requireApiKey } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/integrations/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireApiKey(req, res)) return

  try {
    const sb = getSupabaseAdminClient()
    const { data: jobs } = await sb
      .from('lead_jobs')
      .select('domain, status')
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: true })

    return res.status(200).json({ jobs: jobs ?? [] })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}
