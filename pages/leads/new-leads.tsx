import { useState, useEffect, useCallback } from 'react'
import { GetServerSideProps } from 'next'
import { Play, Loader2, Pause, Square } from 'lucide-react'
import { NewLeadsTable } from '@/components/leads/NewLeadsTable'
import { ProcessingModal } from '@/components/leads/ProcessingModal'
import { readLeadsSheet } from '@/lib/leads/sheets-service'
import { getSupabaseAdminClient } from '@/lib/integrations/supabase'

const API_HEADERS = {
  'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY || '',
  'Content-Type': 'application/json',
}

interface NewLead {
  domain: string
  vertical: string | null
  status: string
}

export const getServerSideProps: GetServerSideProps = async () => {
  const sb = getSupabaseAdminClient()

  const hasSheetCreds =
    !!process.env.GOOGLE_SHEET_ID &&
    !!process.env.GOOGLE_CLIENT_EMAIL &&
    !!process.env.GOOGLE_PRIVATE_KEY

  try {
    if (!hasSheetCreds) throw new Error('Sheet credentials not configured')

    const spreadsheetId = process.env.GOOGLE_SHEET_ID!
    const leadsTab = process.env.GOOGLE_LEADS_SHEET_TAB || 'Leads'

    const sheetLeads = await readLeadsSheet(spreadsheetId, leadsTab)
    const EXCLUDED_TYPES = ['Operator', 'Skip', 'Unknown']
    const pending = sheetLeads.filter(
      (l) =>
        l.type === 'Affiliate' &&
        !EXCLUDED_TYPES.includes(l.type) &&
        (!l.data_collected || l.data_collected.trim().toLowerCase() !== 'done')
    )

    if (pending.length === 0) return { props: { initialLeads: [] } }

    const { data: jobs } = await sb
      .from('lead_jobs')
      .select('domain, status')
      .in('domain', pending.map((l) => l.domain))

    const jobMap = new Map((jobs ?? []).map((j) => [j.domain, j.status]))

    const leads: NewLead[] = pending.map((l) => ({
      domain: l.domain,
      vertical: l.vertical,
      status: jobMap.get(l.domain) ?? 'unprocessed',
    }))

    return { props: { initialLeads: leads } }
  } catch {
    try {
      const { data: affiliates } = await sb
        .from('leads')
        .select('domain, vertical')
        .eq('type', 'Affiliate')

      if (!affiliates?.length) return { props: { initialLeads: [] } }

      const { data: contacts } = await sb.from('lead_contacts').select('domain')
      const contactSet = new Set((contacts ?? []).map((c) => c.domain))

      const { data: jobs } = await sb
        .from('lead_jobs')
        .select('domain, status')
        .in('domain', affiliates.map((a) => a.domain))
      const jobMap = new Map((jobs ?? []).map((j) => [j.domain, j.status]))

      const leads: NewLead[] = affiliates
        .filter((a) => !contactSet.has(a.domain))
        .map((a) => ({
          domain: a.domain,
          vertical: a.vertical,
          status: jobMap.get(a.domain) ?? 'unprocessed',
        }))

      return { props: { initialLeads: leads } }
    } catch {
      return { props: { initialLeads: [] } }
    }
  }
}

export default function NewLeadsPage({
  initialLeads,
}: {
  initialLeads: NewLead[]
}) {
  const [leads, setLeads] = useState<NewLead[]>(initialLeads)
  const [isProcessing, setIsProcessing] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [workerRunning, setWorkerRunning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [loadingAction, setLoadingAction] = useState<'start' | 'pause' | 'stop' | null>(null)
  const busy = loadingAction !== null

  const checkWorker = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/worker-control', { headers: API_HEADERS })
      const data = await res.json()
      setWorkerRunning(data.running)
      setIsPaused(data.paused ?? false)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    checkWorker()
    const interval = setInterval(checkWorker, 5000)
    return () => clearInterval(interval)
  }, [checkWorker])

  async function startScraping() {
    setLoadingAction('start')
    try {
      await fetch('/api/leads/worker-control', {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({ action: 'start' }),
      })
      setWorkerRunning(true)
      setIsPaused(false)
    } catch { /* ignore */ }
    finally { setLoadingAction(null) }
  }

  async function pauseScraping() {
    setLoadingAction('pause')
    try {
      await fetch('/api/leads/cancel-queue', { method: 'POST', headers: API_HEADERS })
      setIsPaused(true)
      setWorkerRunning(false)
    } catch { /* ignore */ }
    finally { setLoadingAction(null) }
  }

  async function stopScraping() {
    setLoadingAction('stop')
    try {
      await fetch('/api/leads/worker-control', {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({ action: 'stop' }),
      })
      setWorkerRunning(false)
    } catch { /* ignore */ }
    finally { setLoadingAction(null) }
  }

  async function handleProcess() {
    setIsProcessing(true)
    setError(null)
    try {
      const res = await fetch('/api/leads/process', {
        method: 'POST',
        headers: API_HEADERS,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`)
        setIsProcessing(false)
        return
      }
      if (data.runId) {
        setRunId(data.runId)
      } else {
        setError(data.message ?? 'No new leads to process')
        setIsProcessing(false)
      }
    } catch {
      setError('Failed to start processing')
      setIsProcessing(false)
    }
  }

  async function handleModalComplete() {
    setRunId(null)
    setIsProcessing(false)
    try {
      const res = await fetch('/api/leads/contacts?view=new-leads', {
        headers: { 'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY || '' },
      })
      const data = await res.json()
      setLeads(data.leads ?? [])
    } catch {
      // ignore
    }
  }

  const pendingCount = leads.filter((l) => l.status === 'pending').length
  const processingCount = leads.filter((l) => l.status === 'processing').length

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-100">New Leads</h1>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm text-slate-400">
            <span className={`w-2 h-2 rounded-full ${workerRunning ? 'bg-green-400 animate-pulse' : isPaused ? 'bg-amber-400' : 'bg-slate-600'}`} />
            {workerRunning
              ? `Scraping — ${processingCount} active, ${pendingCount} pending`
              : isPaused
              ? 'Paused'
              : 'Idle'}
          </span>

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

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      <NewLeadsTable
        leads={leads}
        isProcessing={isProcessing}
        onProcess={handleProcess}
      />

      {runId && (
        <ProcessingModal runId={runId} onComplete={handleModalComplete} />
      )}
    </div>
  )
}
