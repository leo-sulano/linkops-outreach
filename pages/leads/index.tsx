import { GetServerSideProps } from 'next'
import { useState, useEffect, useCallback } from 'react'
import { StatsCards } from '@/components/leads/StatsCards'
import { LeadStats, getLeadStats } from '@/lib/leads/repository'

const API_HEADERS = {
  'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY ?? '',
  'Content-Type': 'application/json',
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
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const checkWorker = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/worker-control', { headers: API_HEADERS })
      const data = await res.json()
      setWorkerRunning(data.running)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    checkWorker()
    const interval = setInterval(checkWorker, 5000)
    return () => clearInterval(interval)
  }, [checkWorker])

  async function processNewLeads() {
    setProcessing(true)
    setMessage(null)
    try {
      const res = await fetch('/api/leads/process', {
        method: 'POST',
        headers: API_HEADERS,
      })
      const data = await res.json()
      if (data.queued > 0) {
        setMessage(`✓ ${data.queued} new domains queued. Click Start Scraping to process them.`)
      } else {
        setMessage('No new leads to process — all domains already queued.')
      }
    } catch {
      setMessage('Failed to process leads. Check the console.')
    } finally {
      setProcessing(false)
    }
  }

  async function toggleWorker() {
    const action = workerRunning ? 'stop' : 'start'
    setProcessing(true)
    setMessage(null)
    try {
      const res = await fetch('/api/leads/worker-control', {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (action === 'start') {
        setMessage(data.started ? '✓ Scraping started — check your Contacts sheet for updates.' : data.message)
        setWorkerRunning(data.started)
      } else {
        setMessage(data.stopped ? '✓ Scraping stopped.' : data.message)
        setWorkerRunning(false)
      }
    } catch {
      setMessage('Failed to control worker.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Leads Overview</h1>

        <div className="flex items-center gap-3">
          {/* Worker status indicator */}
          <span className="flex items-center gap-1.5 text-sm text-slate-400">
            <span className={`w-2 h-2 rounded-full ${workerRunning ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
            {workerRunning ? 'Scraping running' : 'Scraper idle'}
          </span>

          <button
            onClick={processNewLeads}
            disabled={processing}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {processing ? 'Processing…' : 'Process New Leads'}
          </button>

          <button
            onClick={toggleWorker}
            disabled={processing}
            className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors ${
              workerRunning
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {processing ? '…' : workerRunning ? 'Stop Scraping' : 'Start Scraping'}
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-slate-800 text-slate-300 text-sm">
          {message}
        </div>
      )}

      <StatsCards stats={stats} />
    </div>
  )
}
