import { NextApiRequest, NextApiResponse } from 'next'
import { execSync } from 'child_process'
import { requireApiKey } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/integrations/supabase'

const IS_VERCEL = !!process.env.VERCEL

function pm2(args: string): string {
  try {
    return execSync(`pm2 ${args}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
  } catch {
    return ''
  }
}

function isWorkerRunning(): boolean {
  try {
    const out = pm2('jlist')
    const list = JSON.parse(out || '[]') as { name: string; pm2_env?: { status: string } }[]
    const proc = list.find((p) => p.name === 'lead-worker')
    return proc?.pm2_env?.status === 'online'
  } catch {
    return false
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireApiKey(req, res)) return

  // On Vercel: can't control the local PM2 process — infer state from Supabase job counts
  if (IS_VERCEL) {
    const sb = getSupabaseAdminClient()
    const [{ count: processing }, { count: pending }, { count: paused }] = await Promise.all([
      sb.from('lead_jobs').select('*', { count: 'exact', head: true }).eq('status', 'processing'),
      sb.from('lead_jobs').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      sb.from('lead_jobs').select('*', { count: 'exact', head: true }).eq('status', 'paused'),
    ])
    return res.status(200).json({
      running: (processing ?? 0) > 0,
      paused: (paused ?? 0) > 0,
      vercel: true,
      processing: processing ?? 0,
      pending: pending ?? 0,
    })
  }

  if (req.method === 'GET') {
    return res.status(200).json({ running: isWorkerRunning() })
  }

  if (req.method === 'POST') {
    const { action } = req.body as { action: 'start' | 'stop' }

    if (action === 'start') {
      if (isWorkerRunning()) {
        return res.status(200).json({ started: false, message: 'Worker already running' })
      }
      pm2('start lead-worker')
      return res.status(200).json({ started: true })
    }

    if (action === 'stop') {
      if (!isWorkerRunning()) {
        return res.status(200).json({ stopped: false, message: 'Worker not running' })
      }
      pm2('stop lead-worker')
      return res.status(200).json({ stopped: true })
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
