import { GetServerSideProps } from 'next'
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Play, Loader2, Pause, Square } from 'lucide-react'
import { StatsCards } from '@/components/leads/StatsCards'
import { LeadStats, getLeadStats } from '@/lib/leads/repository'

const API_HEADERS = {
  'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY ?? '',
  'Content-Type': 'application/json',
}

interface ActiveJob {
  domain: string
  status: 'pending' | 'processing'
}

export const getServerSideProps: GetServerSideProps = async () => {
  try {
    const stats = await getLeadStats()
    return { props: { stats } }
  } catch {
    return {
      props: {
        stats: { totalLeads: 0, totalContacts: 0, newLeads: 0, affiliates: 0, needsReview: 0, outreachReady: 0 },
      },
    }
  }
}

export default function LeadsOverviewPage({ stats }: { stats: LeadStats }) {
  const [workerRunning, setWorkerRunning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [loadingAction, setLoadingAction] = useState<'process' | 'start' | 'pause' | 'stop' | null>(null)
  const busy = loadingAction !== null
  const [message, setMessage] = useState<string | null>(null)
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([])

  const checkWorker = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/worker-control', { headers: API_HEADERS })
      const data = await res.json()
      setWorkerRunning(data.running)
      setIsPaused(data.paused ?? false)
    } catch { /* ignore */ }
  }, [])

  const fetchActiveJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/active-jobs', { headers: API_HEADERS })
      const data = await res.json()
      setActiveJobs(data.jobs ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    checkWorker()
    fetchActiveJobs()
    const workerInterval = setInterval(checkWorker, 5000)
    const jobsInterval = setInterval(fetchActiveJobs, 3000)
    return () => {
      clearInterval(workerInterval)
      clearInterval(jobsInterval)
    }
  }, [checkWorker, fetchActiveJobs])

  async function processNewLeads() {
    setLoadingAction('process')
    setMessage(null)
    try {
      const res = await fetch('/api/leads/process', { method: 'POST', headers: API_HEADERS })
      const data = await res.json()
      setMessage(data.queued > 0 ? `✓ ${data.queued} new domains queued.` : (data.message ?? 'No new leads to process.'))
      if (data.queued > 0) fetchActiveJobs()
    } catch {
      setMessage('Failed to queue leads.')
    } finally {
      setLoadingAction(null)
    }
  }

  async function startScraping() {
    setLoadingAction('start')
    setMessage(null)
    try {
      const res = await fetch('/api/leads/worker-control', {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({ action: 'start' }),
      })
      const data = await res.json()
      setMessage(data.resumed > 0 ? `Scraping resumed — ${data.resumed} jobs unpaused.` : 'Scraping active.')
      setWorkerRunning(true)
      setIsPaused(false)
      fetchActiveJobs()
    } catch {
      setMessage('Failed to start scraping.')
    } finally {
      setLoadingAction(null)
    }
  }

  async function pauseScraping() {
    setLoadingAction('pause')
    setMessage(null)
    try {
      const res = await fetch('/api/leads/cancel-queue', { method: 'POST', headers: API_HEADERS })
      const data = await res.json()
      setMessage(`Paused — ${data.cancelled} jobs held. Click Start Scraping to resume.`)
      setIsPaused(true)
      setWorkerRunning(false)
      fetchActiveJobs()
    } catch {
      setMessage('Failed to pause queue.')
    } finally {
      setLoadingAction(null)
    }
  }

  async function stopScraping() {
    setLoadingAction('stop')
    setMessage(null)
    try {
      const res = await fetch('/api/leads/worker-control', {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({ action: 'stop' }),
      })
      const data = await res.json()
      setMessage(`Scraping stopped — ${data.paused} jobs paused. Click Start Scraping to resume.`)
      setWorkerRunning(false)
      fetchActiveJobs()
    } catch {
      setMessage('Failed to stop scraping.')
    } finally {
      setLoadingAction(null)
    }
  }

  const pendingCount = activeJobs.filter((j) => j.status === 'pending').length
  const processingCount = activeJobs.filter((j) => j.status === 'processing').length

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Leads Overview</h1>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm text-slate-400">
            <span className={`w-2 h-2 rounded-full ${workerRunning ? 'bg-green-400 animate-pulse' : isPaused ? 'bg-amber-400' : pendingCount > 0 ? 'bg-yellow-500' : 'bg-slate-600'}`} />
            {workerRunning
              ? `Scraping — ${processingCount} active, ${pendingCount} pending`
              : isPaused
              ? `Paused — ${pendingCount} jobs held`
              : pendingCount > 0
              ? `Worker not running — ${pendingCount} jobs waiting`
              : 'Idle'}
          </span>

          <button
            onClick={processNewLeads}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loadingAction === 'process' ? 'animate-spin' : ''}`} />
            Process New Leads
          </button>

          <button
            onClick={startScraping}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {loadingAction === 'start' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
            Start Scraping
          </button>

          <button
            onClick={pauseScraping}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            <Pause className={`w-4 h-4 ${isPaused ? 'fill-current' : ''}`} />
            Pause
          </button>

          <button
            onClick={stopScraping}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            <Square className="w-4 h-4 fill-current" />
            Stop Scraping
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-slate-800 text-slate-300 text-sm">
          {message}
        </div>
      )}

      {/* Stats */}
      <StatsCards stats={stats} />

      {/* Active scraping queue */}
      {activeJobs.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Scraping Queue ({activeJobs.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {activeJobs.map((job) => (
              <div
                key={job.domain}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm ${
                  job.status === 'processing'
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400'
                }`}
              >
                {job.status === 'processing' ? (
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-slate-600 flex-shrink-0" />
                )}
                <span className="truncate flex-1">{job.domain}</span>
                <span className="text-xs flex-shrink-0 opacity-60">
                  {job.status === 'processing' ? 'Scraping…' : 'Queued'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
