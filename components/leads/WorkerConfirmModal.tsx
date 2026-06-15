import { useState } from 'react'
import { X, Terminal, Loader2, CheckCircle2 } from 'lucide-react'

interface Props {
  onAccept: () => Promise<void>
  onCancel: () => void
}

export function WorkerConfirmModal({ onAccept, onCancel }: Props) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)

  const command = 'cd worker && node start.js'

  async function handleAccept() {
    setLoading(true)
    await onAccept()
    setDone(true)
    setLoading(false)
  }

  function copyCommand() {
    navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-base font-semibold text-slate-100">Start Scraping Worker</h2>
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-slate-300 leading-relaxed">
            The scraping worker will run <span className="text-white font-medium">on your machine</span>.
            Make sure it is already running before clicking Accept, or start it now using the command below.
          </p>

          {/* Command block */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700 bg-slate-800/80">
              <Terminal size={13} className="text-slate-400" />
              <span className="text-xs text-slate-400 font-medium">Terminal</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 gap-3">
              <code className="text-sm text-green-400 font-mono">{command}</code>
              <button
                onClick={copyCommand}
                className="flex-shrink-0 text-xs px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Once the worker is running it will automatically pick up pending jobs from the queue.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-slate-700">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleAccept}
            disabled={loading || done}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {done ? (
              <>
                <CheckCircle2 size={15} />
                Started
              </>
            ) : loading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Starting…
              </>
            ) : (
              'Accept & Start'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
