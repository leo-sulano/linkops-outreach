import { NextApiRequest, NextApiResponse } from 'next'
import { requireApiKey } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/integrations/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireApiKey(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const sb = getSupabaseAdminClient()
  const { error, count } = await sb
    .from('lead_jobs')
    .update({ status: 'pending' })
    .eq('status', 'paused')

  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ resumed: count ?? 0 })
}
