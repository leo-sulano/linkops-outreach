import { RefreshCw } from 'lucide-react'
import { JobStatusBadge, JobStatus } from './JobStatusRow'

interface NewLead {
  domain: string
  vertical: string | null
  status: string
}

export function NewLeadsTable({
  leads,
  isProcessing,
  onProcess,
}: {
  leads: NewLead[]
  isProcessing: boolean
  onProcess: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-100">
          New Leads ({leads.length})
        </h2>
        <button
          onClick={onProcess}
          disabled={isProcessing || leads.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
          {isProcessing ? 'Processing…' : 'Process New Leads'}
        </button>
      </div>

      {leads.length === 0 ? (
        <p className="text-slate-500 text-sm">No new affiliate domains to process.</p>
      ) : (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <div className="grid grid-cols-3 px-4 py-2 border-b border-slate-700 text-xs font-medium text-slate-400 uppercase tracking-wider">
            <span>Domain</span>
            <span>Vertical</span>
            <span className="text-right">Status</span>
          </div>
          <div className="divide-y divide-slate-800">
            {leads.map((lead) => (
              <div
                key={lead.domain}
                className="grid grid-cols-3 items-center px-4 py-2.5 hover:bg-slate-800/50"
              >
                <span className="text-sm font-mono text-slate-200 truncate">{lead.domain}</span>
                <span className="text-sm text-slate-400">{lead.vertical ?? '—'}</span>
                <div className="flex justify-end">
                  <JobStatusBadge status={(lead.status as JobStatus) || 'unprocessed'} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
