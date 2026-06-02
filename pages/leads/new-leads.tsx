import { useState } from 'react'
import { GetServerSideProps } from 'next'
import { NewLeadsTable } from '@/components/leads/NewLeadsTable'
import { ProcessingModal } from '@/components/leads/ProcessingModal'
import { getNewLeads } from '@/lib/leads/repository'

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
  try {
    const leads = await getNewLeads()
    return { props: { initialLeads: leads } }
  } catch {
    return { props: { initialLeads: [] } }
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
