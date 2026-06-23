import { NextApiRequest, NextApiResponse } from 'next'
import { requireApiKey } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/integrations/supabase'
import { getExistingContactDomains } from '@/lib/leads/repository'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireApiKey(req, res)) return

  const sb = getSupabaseAdminClient()

  if (req.method === 'GET') {
    const [
      { data: affiliates },
      existingContacts,
      { data: activeJobs },
      { count: paused },
      { data: hb },
    ] = await Promise.all([
      sb.from('leads').select('domain').eq('type', 'Affiliate'),
      getExistingContactDomains(),
      sb.from('lead_jobs').select('domain, status').in('status', ['pending', 'processing']),
      sb.from('lead_jobs').select('*', { count: 'exact', head: true }).eq('status', 'paused'),
      sb.from('worker_heartbeat').select('last_seen_at').eq('id', 'worker').maybeSingle(),
    ])

    const qualifiedDomains = new Set(
      (affiliates ?? []).map((a) => a.domain).filter((d) => !existingContacts.has(d))
    )
    const qualifiedJobs = (activeJobs ?? []).filter((j) => qualifiedDomains.has(j.domain))
    const processing = qualifiedJobs.filter((j) => j.status === 'processing').length
    const pending = qualifiedJobs.filter((j) => j.status === 'pending').length

    const alive = hb != null && (Date.now() - new Date((hb as any).last_seen_at).getTime()) < 30_000
    return res.status(200).json({
      alive,
      running: processing > 0,
      paused: (paused ?? 0) > 0 && pending === 0 && processing === 0,
      processing,
      pending,
    })
  }

  if (req.method === 'POST') {
    const { action } = req.body as { action: 'start' | 'stop' }

    if (action === 'start') {
      // Flip any paused jobs back to pending so the worker picks them up
      const { data, error } = await sb
        .from('lead_jobs')
        .update({ status: 'pending' })
        .eq('status', 'paused')
        .select('id')
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ started: true, resumed: data?.length ?? 0 })
    }

    if (action === 'stop') {
      // Flip pending jobs to paused so the worker stops picking up new ones,
      // and reset any in-flight processing jobs so their results are abandoned.
      const [
        { data: pendingData, error: pendingErr },
        { data: processingData, error: processingErr },
      ] = await Promise.all([
        sb.from('lead_jobs').update({ status: 'paused' }).eq('status', 'pending').select('id'),
        sb.from('lead_jobs').update({ status: 'paused', started_at: null }).eq('status', 'processing').select('id'),
      ])
      if (pendingErr) return res.status(500).json({ error: pendingErr.message })
      if (processingErr) return res.status(500).json({ error: processingErr.message })
      const paused = (pendingData?.length ?? 0) + (processingData?.length ?? 0)
      return res.status(200).json({ stopped: true, paused })
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
