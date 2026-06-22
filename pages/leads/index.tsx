import { GetServerSideProps } from 'next'
import { useState, useEffect, useCallback } from 'react'
import { PlayCircle, Loader2, StopCircle, Globe, Trash2 } from 'lucide-react'
import { StatsCards } from '@/components/leads/StatsCards'
import { WorkerSetupModal } from '@/components/leads/WorkerSetupModal'
import { NewLeadsTable } from '@/components/leads/NewLeadsTable'
import { LeadStats, getLeadStats } from '@/lib/leads/repository'

interface NewLead {
  domain: string
  vertical: string | null
  status: string
}

const API_HEADERS = {
  'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY ?? '',
  'Content-Type': 'application/json',
}

interface ActiveJob {
  domain: string
  status: 'pending' | 'processing'
  current_page?: string | null
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

export default function LeadsOverviewPage({ stats: initialStats }: { stats: LeadStats }) {
  const [workerAlive, setWorkerAlive] = useState(false)
  const [workerRunning, setWorkerRunning] = useState(false)
  const [workerCounts, setWorkerCounts] = useState({ processing: 0, pending: 0 })
  const [showWorkerModal, setShowWorkerModal] = useState(false)
  const [loadingAction, setLoadingAction] = useState<'process' | 'start' | 'stop' | 'reset' | null>(null)
  const busy = loadingAction !== null
  const [message, setMessage] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([])
  const [leads, setLeads] = useState<NewLead[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [stats, setStats] = useState<LeadStats>(initialStats)

  const checkWorker = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/worker-control', { headers: API_HEADERS })
      const data = await res.json()
      setWorkerAlive(data.alive ?? false)
      setWorkerRunning(data.running)
      setWorkerCounts({ processing: data.processing ?? 0, pending: data.pending ?? 0 })
    } catch { /* ignore */ }
  }, [])

  const fetchActiveJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/active-jobs', { headers: API_HEADERS })
      const data = await res.json()
      setActiveJobs(data.jobs ?? [])
    } catch { /* ignore */ }
  }, [])

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/contacts?view=new-leads', { headers: API_HEADERS })
      const data = await res.json()
      setLeads(data.leads ?? [])
    } catch { /* ignore */ }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/contacts?view=stats', { headers: API_HEADERS })
      const data = await res.json()
      setStats(data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    checkWorker()
    fetchActiveJobs()
    fetchLeads()
    fetchStats()
    const workerInterval = setInterval(checkWorker, 5000)
    const jobsInterval = setInterval(fetchActiveJobs, 3000)
    const leadsInterval = setInterval(fetchLeads, 6000)
    const statsInterval = setInterval(fetchStats, 10000)
    return () => {
      clearInterval(workerInterval)
      clearInterval(jobsInterval)
      clearInterval(leadsInterval)
      clearInterval(statsInterval)
    }
  }, [checkWorker, fetchActiveJobs, fetchLeads, fetchStats])

  async function handleProcessLeads() {
    setIsProcessing(true)
    try {
      const res = await fetch('/api/leads/process', { method: 'POST', headers: API_HEADERS })
      const data = await res.json()
      if (data.queued > 0) {
        setMessage(data.scrapingPaused
          ? `✓ ${data.queued} domains queued (scraping is stopped — click Start Scraping to begin).`
          : `✓ ${data.queued} new domains queued.`)
        fetchActiveJobs()
        fetchLeads()
      } else {
        setMessage(data.message ?? 'No new leads to process.')
      }
    } catch {
      setMessage('Failed to queue leads.')
    } finally {
      setIsProcessing(false)
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
      fetchActiveJobs()
      await checkWorker()
    } catch {
      setMessage('Failed to start scraping.')
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleReset() {
    setLoadingAction('reset')
    setMessage(null)
    setConfirmReset(false)
    try {
      const res = await fetch('/api/leads/reset', { method: 'POST', headers: API_HEADERS })
      const data = await res.json()
      if (!res.ok) {
        setMessage(`Reset failed: ${data.error ?? res.statusText}`)
        return
      }
      setMessage('All data cleared. Click "Process New Leads" to re-import from Google Sheets.')
      setActiveJobs([])
      setLeads([])
    } catch {
      setMessage('Reset failed.')
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
      if (!res.ok) {
        setMessage(`Failed to stop scraping: ${data.error ?? res.statusText}`)
        return
      }
      setMessage(`Scraping stopped — ${data.paused} jobs paused. Click Start Scraping to resume.`)
      setWorkerRunning(false)
      fetchActiveJobs()
      fetchLeads()
    } catch {
      setMessage('Failed to stop scraping.')
    } finally {
      setLoadingAction(null)
    }
  }

  const pendingJobs = activeJobs.filter((j) => j.status === 'pending')
  const processingJobs = activeJobs.filter((j) => j.status === 'processing')
  const pendingCount = workerCounts.pending
  const processingCount = workerCounts.processing

  // Merge live job status into lead cards so the processing animation fires immediately
  const processingDomains = new Set(processingJobs.map((j) => j.domain))
  const mergedLeads = leads.map((l) =>
    processingDomains.has(l.domain) ? { ...l, status: 'processing' } : l
  )

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Leads Overview</h1>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm text-slate-400">
            <span className={`w-2 h-2 rounded-full ${workerRunning ? 'bg-green-400 animate-pulse' : workerAlive ? 'bg-green-400' : pendingCount > 0 ? 'bg-yellow-500' : 'bg-slate-600'}`} />
            {workerRunning
              ? `Scraping — ${processingCount} active, ${pendingCount} pending`
              : workerAlive
              ? pendingCount > 0 ? `Worker running — ${pendingCount} jobs queued` : 'Worker running — idle'
              : pendingCount > 0
              ? `Worker not running — ${pendingCount} jobs waiting`
              : 'Idle'}
          </span>

          <button
            onClick={() => setShowWorkerModal(true)}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {(workerRunning || loadingAction === 'start') ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <PlayCircle className="w-4 h-4" />
            )}
            Start Scraping
          </button>

          <button
            onClick={stopScraping}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            <StopCircle className="w-4 h-4" />
            Stop Scraping
          </button>

          {confirmReset ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400 font-medium">Delete all data?</span>
              <button
                onClick={handleReset}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                {loadingAction === 'reset' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Yes, Reset
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                disabled={busy}
                className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              disabled={busy}
              title="Clear all leads, contacts, and job data"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-red-900 border border-slate-600 hover:border-red-700 text-slate-300 hover:text-red-300 text-sm font-medium disabled:opacity-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Reset All
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-slate-800 text-slate-300 text-sm">
          {message}
        </div>
      )}

      {showWorkerModal && (
        <WorkerSetupModal
          onAccept={async () => {
            setShowWorkerModal(false)
            await startScraping()
          }}
          onCancel={() => setShowWorkerModal(false)}
        />
      )}

      {/* Live Monitor */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-6 px-4 py-3 rounded-lg bg-slate-900 border border-slate-700">
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`w-2.5 h-2.5 rounded-full ${workerRunning ? 'bg-green-400 animate-pulse' : workerAlive ? 'bg-green-400' : 'bg-slate-600'}`} />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {workerRunning ? 'Worker Active' : workerAlive ? 'Worker Running' : 'Worker Idle'}
          </span>
        </div>

        <div className="w-px h-4 bg-slate-700 hidden sm:block flex-shrink-0" />

        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-slate-500 flex-shrink-0">Now scraping:</span>
          {processingJobs.length > 0 ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400 flex-shrink-0" />
              <a
                href={processingJobs[0].current_page || `https://${processingJobs[0].domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-mono text-indigo-300 truncate hover:text-indigo-200 hover:underline"
              >
                {processingJobs[0].current_page || processingJobs[0].domain}
              </a>
              {processingJobs.length > 1 && (
                <span className="text-xs text-slate-500 flex-shrink-0">+{processingJobs.length - 1} more</span>
              )}
            </div>
          ) : (
            <span className="text-sm text-slate-600 italic">—</span>
          )}
        </div>


        {activeJobs.length === 0 && !workerRunning && (
          <span className="text-xs text-slate-600 italic ml-1">No active jobs</span>
        )}
      </div>

      {/* Stats */}
      <StatsCards stats={stats} />

      {/* Active scraping queue — processing only */}
      {processingJobs.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Now Scraping ({processingJobs.length})
          </h2>
          <div className="flex flex-col gap-1.5">
            {processingJobs.map((job) => (
              <div
                key={job.domain}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
              >
                <Globe className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                <span className="truncate flex-1 font-mono">{job.domain}</span>
                {job.current_page && (
                  <span className="text-xs text-slate-500 flex-shrink-0 truncate">
                    · {job.current_page}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New leads */}
      <div className="mt-6">
        <NewLeadsTable
          leads={mergedLeads}
          isProcessing={isProcessing}
          onProcess={handleProcessLeads}
        />
      </div>
    </div>
  )
}
