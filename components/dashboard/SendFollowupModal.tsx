import { useState, useEffect } from 'react'
import { X, Reply, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import type { SenderWithStats } from '@/lib/senders/types'

interface FollowupResult {
  sender: string
  sent: number
  errors: string[]
}

interface FollowupResponse {
  sent: number
  total: number
  results: FollowupResult[]
}

interface SendFollowupModalProps {
  followupCount: number
  onClose: () => void
  onRefresh: () => void
}

type ModalState = 'idle' | 'sending' | 'done'

const API_HEADERS = { 'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY || '' }

export function SendFollowupModal({ followupCount, onClose, onRefresh }: SendFollowupModalProps) {
  const [modalState, setModalState] = useState<ModalState>('idle')
  const [useAllSenders, setUseAllSenders] = useState(true)
  const [senders, setSenders] = useState<SenderWithStats[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [emailsPerSender, setEmailsPerSender] = useState(10)
  const [results, setResults] = useState<FollowupResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalState !== 'sending') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [modalState, onClose])

  useEffect(() => {
    fetch('/api/senders/stats', { headers: API_HEADERS })
      .then((r) => r.json())
      .then((data) => {
        const active: SenderWithStats[] = Array.isArray(data)
          ? data.filter((s: SenderWithStats) => s.status === 'active')
          : []
        setSenders(active)
        setSelectedIds(new Set(active.map((s) => s.id)))
      })
      .catch(() => setError('Failed to load senders'))
  }, [])

  const activeSenderCount = useAllSenders ? senders.length : selectedIds.size
  const canSend = activeSenderCount > 0 && emailsPerSender >= 1 && modalState === 'idle'

  const toggleSender = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSend = async () => {
    setModalState('sending')
    setError(null)
    try {
      const senderIds = useAllSenders ? 'all' : Array.from(selectedIds)
      const res = await fetch('/api/paul/send-followup', {
        method: 'POST',
        headers: { ...API_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderIds, emailsPerSender }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `Error ${res.status}`)
        setModalState('idle')
        return
      }
      setResults(data)
      setModalState('done')
    } catch {
      setError('Network error. Please try again.')
      setModalState('idle')
    }
  }

  const handleCloseAndRefresh = () => {
    onRefresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70"
        onClick={modalState !== 'sending' ? onClose : undefined}
      />
      <div
        className="relative z-10 w-[480px] bg-slate-900 border border-slate-700 rounded-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Send Follow-up</h2>
            <p className="text-xs font-mono text-slate-500 mt-0.5">
              {followupCount} contact{followupCount !== 1 ? 's' : ''} awaiting follow-up
            </p>
          </div>
          {modalState !== 'sending' && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="p-6 flex flex-col gap-5">
          {modalState === 'done' && results ? (
            <>
              <div className="flex items-center gap-3">
                <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0" />
                <p className="text-slate-100 font-bold">
                  Follow-ups sent — {results.sent} of {results.total} emails delivered
                </p>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      {['Sender', 'Sent', 'Errors'].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {results.results.map((r) => (
                      <tr key={r.sender}>
                        <td className="px-4 py-2 text-xs font-mono text-slate-300 truncate max-w-[180px]">{r.sender}</td>
                        <td className="px-4 py-2 text-xs text-slate-300">{r.sent}</td>
                        <td className="px-4 py-2 text-xs text-red-400">
                          {r.errors.length > 0 ? r.errors.join('; ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 transition-colors text-sm font-bold"
                >
                  Close
                </button>
                <button
                  onClick={handleCloseAndRefresh}
                  className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors text-sm font-bold"
                >
                  Close & Refresh
                </button>
              </div>
            </>
          ) : (
            <>
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  {error}
                </div>
              )}

              <div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={useAllSenders}
                  onClick={() => setUseAllSenders((v) => !v)}
                  disabled={modalState === 'sending'}
                  className="flex items-center gap-3 cursor-pointer disabled:opacity-50"
                >
                  <div
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 ${
                      useAllSenders ? 'bg-emerald-500' : 'bg-slate-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                        useAllSenders ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </div>
                  <span className="text-sm text-slate-300 font-medium">Use all active senders</span>
                </button>
              </div>

              {!useAllSenders && (
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
                  {senders.length === 0 && (
                    <p className="text-xs text-slate-500 py-2">No active senders found.</p>
                  )}
                  {senders.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggleSender(s.id)}
                        disabled={modalState === 'sending'}
                        className="accent-emerald-500 w-4 h-4 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-200 font-medium truncate">{s.name}</div>
                        <div className="text-xs text-slate-500 font-mono truncate">{s.email}</div>
                      </div>
                      <div className="text-xs text-slate-500 flex-shrink-0 font-mono">
                        {s.sent_today}/{s.daily_limit}
                      </div>
                    </label>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-sm text-slate-400 mb-1.5 font-medium">
                  Emails per sender
                </label>
                <input
                  type="number"
                  min={1}
                  value={emailsPerSender}
                  onChange={(e) => setEmailsPerSender(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={modalState === 'sending'}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                />
              </div>

              <p className="text-xs text-slate-500">
                Will send up to{' '}
                <span className="text-slate-300 font-bold">{activeSenderCount * emailsPerSender}</span> follow-ups across{' '}
                <span className="text-slate-300 font-bold">{activeSenderCount}</span>{' '}
                sender{activeSenderCount !== 1 ? 's' : ''}
              </p>

              <button
                onClick={handleSend}
                disabled={!canSend}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {modalState === 'sending' ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Sending follow-ups…
                  </>
                ) : (
                  <>
                    <Reply size={15} />
                    Send Follow-ups
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
