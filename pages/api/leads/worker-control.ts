import { NextApiRequest, NextApiResponse } from 'next'
import { spawn } from 'child_process'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { requireApiKey } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/integrations/supabase'

const PID_FILE = path.join(process.cwd(), '.worker.pid')

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function getWorkerPid(): number | null {
  try {
    if (!fs.existsSync(PID_FILE)) return null
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim())
    return isNaN(pid) ? null : pid
  } catch {
    return null
  }
}

const IS_VERCEL = !!process.env.VERCEL

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireApiKey(req, res)) return

  // Worker runs locally via Selenium — cannot be spawned on Vercel serverless
  // Infer if worker is running by checking for active 'processing' jobs in Supabase
  if (IS_VERCEL) {
    const sb = getSupabaseAdminClient()
    const { count } = await sb
      .from('lead_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'processing')
    const { count: pending } = await sb
      .from('lead_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    const isActive = (count ?? 0) > 0
    return res.status(200).json({
      running: isActive,
      vercel: true,
      processing: count ?? 0,
      pending: pending ?? 0,
      message: 'Worker must be started locally: open a terminal and run `cd worker && npm start`',
    })
  }

  if (req.method === 'GET') {
    const pid = getWorkerPid()
    const running = pid !== null && isRunning(pid)
    if (!running && fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE)
    return res.status(200).json({ running, pid: running ? pid : null })
  }

  if (req.method === 'POST') {
    const { action } = req.body as { action: 'start' | 'stop' }

    if (action === 'start') {
      const existingPid = getWorkerPid()
      if (existingPid && isRunning(existingPid)) {
        return res.status(200).json({ started: false, message: 'Worker already running', pid: existingPid })
      }

      const workerDir = path.join(process.cwd(), 'worker')
      const child = spawn('npm', ['start'], {
        cwd: workerDir,
        detached: true,
        stdio: 'ignore',
        shell: true,
      })
      child.unref()
      fs.writeFileSync(PID_FILE, String(child.pid))
      return res.status(200).json({ started: true, pid: child.pid })
    }

    if (action === 'stop') {
      const pid = getWorkerPid()
      if (!pid || !isRunning(pid)) {
        if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE)
        return res.status(200).json({ stopped: false, message: 'Worker not running' })
      }
      try {
        // Use taskkill on Windows to kill entire process tree
        execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' })
      } catch {
        try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
      }
      if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE)
      return res.status(200).json({ stopped: true })
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
