import { NextApiRequest, NextApiResponse } from 'next'
import { spawn } from 'child_process'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { requireApiKey } from '@/lib/api-auth'

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

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireApiKey(req, res)) return

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
