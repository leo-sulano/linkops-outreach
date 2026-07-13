import { useState } from 'react'
import { RefreshCw, ChevronLeft, ChevronRight, Globe, Square, CheckSquare } from 'lucide-react'
import { JobStatus } from './JobStatusRow'

interface NewLead {
  domain: string
  vertical: string | null
  status: string
}

const PAGE_SIZE = 24

const STATUS_ORDER: Record<string, number> = {
  processing:   0,
  pending:      1,
  unprocessed:  2,
  paused:       3,
  needs_review: 4,
  failed:       5,
  completed:    6,
}

const SELECTABLE_STATUSES = new Set(['unprocessed', 'paused', 'pending', 'needs_review', 'failed'])

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

function LeadCard({
  lead,
  selected,
  onToggle,
}: {
  lead: NewLead
  selected: boolean
  onToggle: () => void
}) {
  const host = lead.domain.trim().replace(/^www\./, '')
  const isActive = lead.status === 'processing'
  const selectable = SELECTABLE_STATUSES.has(lead.status)

  return (
    <div
      className={`group relative bg-slate-900 border rounded-2xl p-4 flex flex-col gap-3 transition-all duration-200 cursor-default ${
        selected
          ? 'border-blue-500 ring-2 ring-blue-500/50 bg-slate-800/80'
          : isActive
          ? 'border-blue-500/60 bg-slate-800/80'
          : 'border-slate-800 hover:border-slate-600 hover:bg-slate-800/60'
      }`}
      style={isActive ? { animation: 'breathe 2.4s ease-in-out infinite' } : {}}
    >
      {selectable && (
        <button
          onClick={onToggle}
          aria-label={selected ? 'Deselect domain' : 'Select domain'}
          className="absolute top-3 right-3 text-slate-500 hover:text-blue-400 transition-colors"
        >
          {selected ? (
            <CheckSquare className="w-4 h-4 text-blue-400" />
          ) : (
            <Square className="w-4 h-4" />
          )}
        </button>
      )}

      {/* Top row: globe icon + domain */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 shrink-0 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center group-hover:border-slate-600 transition-colors">
          <Globe
            className={`w-3.5 h-3.5 transition-colors ${isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-400'}`}
            style={isActive ? { animation: 'spin-slow 2.8s linear infinite' } : {}}
          />
        </div>
        <p className="text-sm font-semibold text-slate-200 truncate whitespace-nowrap leading-snug pr-5">{host}</p>
      </div>

      {/* Bottom: vertical left, status right */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-800">
        <VerticalTag vertical={lead.vertical} />
        <StatusIndicator status={lead.status} />
      </div>
    </div>
  )
}

export function NewLeadsTable({
  leads,
  isProcessing,
  onProcess,
  onStartSelected,
}: {
  leads: NewLead[]
  isProcessing: boolean
  onProcess: () => void
  onStartSelected: (domains: string[]) => Promise<boolean>
}) {
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isStarting, setIsStarting] = useState(false)
  const sorted = [...leads].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
  )
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageLeads = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const pageSelectableDomains = pageLeads
    .filter((l) => SELECTABLE_STATUSES.has(l.status))
    .map((l) => l.domain)
  const allPageSelected =
    pageSelectableDomains.length > 0 && pageSelectableDomains.every((d) => selected.has(d))

  function toggleDomain(domain: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }

  function toggleSelectAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        pageSelectableDomains.forEach((d) => next.delete(d))
      } else {
        pageSelectableDomains.forEach((d) => next.add(d))
      }
      return next
    })
  }

  async function handleStartSelected() {
    setIsStarting(true)
    try {
      const success = await onStartSelected(Array.from(selected))
      if (success) setSelected(new Set())
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-100">New Leads</h2>
          <p className="text-xs text-slate-500 mt-0.5">{sorted.length} domains to process</p>
        </div>
        <div className="flex items-center gap-3">
          {pageSelectableDomains.length > 0 && (
            <button
              onClick={toggleSelectAllOnPage}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              {allPageSelected ? (
                <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              Select all on page
            </button>
          )}

          {selected.size > 0 && (
            <>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Clear ({selected.size})
              </button>
              <button
                onClick={handleStartSelected}
                disabled={isStarting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isStarting ? 'animate-spin' : ''}`} />
                {isStarting ? 'Starting…' : `Start Selected (${selected.size})`}
              </button>
            </>
          )}

          <button
            onClick={onProcess}
            disabled={isProcessing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
            {isProcessing ? 'Processing…' : 'Process New Leads'}
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-slate-500 text-sm">No new affiliate domains to process.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {pageLeads.map((lead) => (
              <LeadCard
                key={lead.domain}
                lead={lead}
                selected={selected.has(lead.domain)}
                onToggle={() => toggleDomain(lead.domain)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-5">
              <span className="text-xs text-slate-500">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
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
