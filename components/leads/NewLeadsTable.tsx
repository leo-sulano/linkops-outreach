import { useState } from 'react'
import { RefreshCw, ChevronLeft, ChevronRight, Globe } from 'lucide-react'
import { JobStatus } from './JobStatusRow'

interface NewLead {
  domain: string
  vertical: string | null
  status: string
}

const PAGE_SIZE = 24

const VERTICAL_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  Crypto:  { bg: 'bg-blue-500/10',   text: 'text-blue-400',   dot: 'bg-blue-400' },
  iGaming: { bg: 'bg-purple-500/10', text: 'text-purple-400', dot: 'bg-purple-400' },
  Forex:   { bg: 'bg-emerald-500/10',text: 'text-emerald-400',dot: 'bg-emerald-400' },
  Finance: { bg: 'bg-amber-500/10',  text: 'text-amber-400',  dot: 'bg-amber-400' },
  Sports:  { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-400' },
}

const STATUS_DOT: Record<string, string> = {
  unprocessed: 'bg-slate-600',
  pending:     'bg-slate-400',
  processing:  'bg-blue-400',
  completed:   'bg-green-400',
  needs_review:'bg-amber-400',
  failed:      'bg-red-400',
}

const STATUS_LABEL: Record<string, string> = {
  unprocessed:  'Unprocessed',
  pending:      'Pending',
  processing:   'Processing',
  completed:    'Completed',
  needs_review: 'Needs Review',
  failed:       'Failed',
}

function VerticalTag({ vertical }: { vertical: string | null }) {
  const v = vertical ?? '—'
  const style = VERTICAL_STYLES[v] ?? { bg: 'bg-slate-700/40', text: 'text-slate-400', dot: 'bg-slate-500' }
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-md ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {v}
    </span>
  )
}

function StatusIndicator({ status }: { status: string }) {
  const dot = STATUS_DOT[status] ?? 'bg-slate-600'
  const label = STATUS_LABEL[status] ?? status
  const isProcessing = status === 'processing'
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span className={`w-1.5 h-1.5 rounded-full ${dot} ${isProcessing ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  )
}

function LeadCard({ lead }: { lead: NewLead }) {
  const host = lead.domain.replace(/^www\./, '')
  const [tld, ...parts] = host.split('.').reverse()
  const name = parts.reverse().join('.')

  return (
    <div className="group bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 hover:border-slate-600 hover:bg-slate-800/60 transition-all duration-200 cursor-default">
      {/* Top row: icon + vertical tag */}
      <div className="flex items-start justify-between">
        <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center group-hover:border-slate-600 transition-colors">
          <Globe className="w-4 h-4 text-slate-500 group-hover:text-slate-400 transition-colors" />
        </div>
        <VerticalTag vertical={lead.vertical} />
      </div>

      {/* Domain name */}
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-200 truncate leading-snug">{name}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">.{tld}</p>
      </div>

      {/* Bottom: status */}
      <div className="pt-1 border-t border-slate-800">
        <StatusIndicator status={lead.status} />
      </div>
    </div>
  )
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
  const [page, setPage] = useState(0)
  const totalPages = Math.ceil(leads.length / PAGE_SIZE)
  const pageLeads = leads.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-100">New Leads</h2>
          <p className="text-xs text-slate-500 mt-0.5">{leads.length} domains to process</p>
        </div>
        <button
          onClick={onProcess}
          disabled={isProcessing || leads.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
          {isProcessing ? 'Processing…' : 'Process New Leads'}
        </button>
      </div>

      {leads.length === 0 ? (
        <p className="text-slate-500 text-sm">No new affiliate domains to process.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {pageLeads.map((lead) => (
              <LeadCard key={lead.domain} lead={lead} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-5">
              <span className="text-xs text-slate-500">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, leads.length)} of {leads.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Prev
                </button>
                <span className="text-xs text-slate-500 tabular-nums">{page + 1} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
