import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { JobStatusRow, JobStatus } from './JobStatusRow'

interface Job {
  id: string
  domain: string
  status: JobStatus
}

const API_HEADERS = { 'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY || '' }

export function ProcessingModal({
  runId,
  onComplete,
}: {
  runId: string
  onComplete: () => void
}) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [done, setDone] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const completed = jobs.filter((j) =>
    ['completed', 'needs_review', 'failed'].includes(j.status)
  ).length
  const total = jobs.length
  const allFinished = total > 0 && completed === total
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/leads/job-status?runId=${runId}`, {
          headers: API_HEADERS,
        })
        if (!res.ok) return
        const data = await res.json()
        setJobs(data.jobs ?? [])
      } catch {
        // ignore transient errors
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 3_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [runId])

  useEffect(() => {
    if (allFinished && !done) {
      setDone(true)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [allFinished, done])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-base font-semibold text-slate-100">Processing Leads</h2>
          <button
            onClick={onComplete}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            title="Close — worker keeps running in background"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-slate-700">
          <div className="flex justify-between text-xs text-slate-400 mb-2">
            <span>{completed} / {total} domains</span>
            <span>{progressPct}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-0.5">
          {jobs.length === 0 ? (
            <p className="text-slate-500 text-sm py-4 text-center">
              Waiting for worker to pick up jobs…
            </p>
          ) : (
            jobs.map((job) => (
              <JobStatusRow key={job.id} domain={job.domain} status={job.status} />
            ))
          )}
        </div>

        {done && (
          <div className="px-5 py-4 border-t border-slate-700">
            <button
              onClick={onComplete}
              className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
