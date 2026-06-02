export type JobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'needs_review'
  | 'failed'
  | 'unprocessed'

const STATUS_STYLES: Record<JobStatus, string> = {
  pending: 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
  processing: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  completed: 'bg-green-500/10 text-green-400 border border-green-500/20',
  needs_review: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  failed: 'bg-red-500/10 text-red-400 border border-red-500/20',
  unprocessed: 'bg-slate-500/10 text-slate-500 border border-slate-600/20',
}

const STATUS_LABELS: Record<JobStatus, string> = {
  pending: 'Pending',
  processing: 'Processing…',
  completed: 'Completed',
  needs_review: 'Needs Review',
  failed: 'Failed',
  unprocessed: 'Unprocessed',
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[status]}`}
    >
      {status === 'processing' && (
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
      )}
      {STATUS_LABELS[status]}
    </span>
  )
}

export function JobStatusRow({ domain, status }: { domain: string; status: JobStatus }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-slate-800/50">
      <span className="text-sm text-slate-300 font-mono truncate mr-4">{domain}</span>
      <JobStatusBadge status={status} />
    </div>
  )
}
