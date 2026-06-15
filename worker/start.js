const fs = require('fs')
const path = require('path')

const LOCK_FILE = path.join(__dirname, 'worker.lock')

// Prevent multiple worker instances from running simultaneously
if (fs.existsSync(LOCK_FILE)) {
  const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10)
  let alreadyRunning = false
  try {
    process.kill(pid, 0) // signal 0 = existence check, no-op
    alreadyRunning = true
  } catch {
    // ESRCH — process gone; stale lock file
    console.log(`[worker] Stale lock file found (PID ${pid} no longer running). Proceeding.`)
  }
  if (alreadyRunning) {
    console.error(`[worker] Another instance is already running (PID ${pid}). Exiting.`)
    process.exit(1)
  }
}

fs.writeFileSync(LOCK_FILE, String(process.pid))

function removeLock() {
  try { fs.unlinkSync(LOCK_FILE) } catch {}
}

process.on('exit', removeLock)
process.on('SIGINT', () => { removeLock(); process.exit(0) })
process.on('SIGTERM', () => { removeLock(); process.exit(0) })
process.on('uncaughtException', (err) => { console.error('[worker] Uncaught:', err); removeLock(); process.exit(1) })

require('ts-node').register({ transpileOnly: true })
require('tsconfig-paths/register')
require('./index.ts')
