import { useState } from 'react'
import { GetServerSideProps } from 'next'
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

    // Read sheet — only Affiliates where Data Collected is not Done
    const sheetLeads = await readLeadsSheet(spreadsheetId, leadsTab)
    const pending = sheetLeads.filter(
      (l) =>
        l.type === 'Affiliate' &&
        (!l.data_collected || l.data_collected.trim().toLowerCase() !== 'done')
    )

    if (pending.length === 0) return { props: { initialLeads: [] } }

    // Get job statuses from Supabase for these domains
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
    // Sheet unavailable — fall back to Supabase leads not yet in lead_contacts
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">New Leads</h1>

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
