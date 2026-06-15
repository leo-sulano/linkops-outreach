import { useState } from 'react'
import {
  X, CheckCircle2, Circle, ExternalLink, Terminal,
  Package, Chrome, KeyRound, Rocket, Play, Loader2,
} from 'lucide-react'

const STORAGE_KEY = 'worker-setup-done'

interface Step {
  id: string
  title: string
  subtitle: string
  icon: React.ReactNode
  content: React.ReactNode
  confirmLabel: string
}

function CopyBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden mt-3">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700">
        <Terminal size={13} className="text-slate-400" />
        <span className="text-xs text-slate-400 font-medium">Terminal</span>
      </div>
      <div className="flex items-center justify-between px-4 py-3 gap-3">
        <code className="text-sm text-green-400 font-mono break-all">{command}</code>
        <button
          onClick={copy}
          className="flex-shrink-0 text-xs px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

const STEPS: Step[] = [
  {
    id: 'nodejs',
    title: 'Install Node.js',
    subtitle: 'Runtime for the worker',
    icon: <Package size={20} className="text-green-400" />,
    confirmLabel: 'I have Node.js installed',
    content: (
      <div className="space-y-3">
        <p className="text-sm text-slate-300 leading-relaxed">
          The scraping worker runs on <span className="text-white font-medium">Node.js</span>.
          If you don&apos;t have it yet, download and install it first.
        </p>
        <a
          href="https://nodejs.org"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm transition-colors"
        >
          <ExternalLink size={14} />
          Download Node.js (LTS)
        </a>
        <p className="text-xs text-slate-500">
          After installing, verify by running <code className="text-green-400">node --version</code> in your terminal.
        </p>
      </div>
    ),
  },
  {
    id: 'chrome',
    title: 'Chrome Browser',
    subtitle: 'Required for scraping',
    icon: <Chrome size={20} className="text-blue-400" />,
    confirmLabel: 'I have Chrome installed',
    content: (
      <div className="space-y-3">
        <p className="text-sm text-slate-300 leading-relaxed">
          The worker uses <span className="text-white font-medium">Google Chrome</span> to browse
          websites. Make sure Chrome is installed on this PC.
        </p>
        <a
          href="https://www.google.com/chrome"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm transition-colors"
        >
          <ExternalLink size={14} />
          Download Google Chrome
        </a>
        <p className="text-xs text-slate-500">
          Skip this if Chrome is already installed — most PCs already have it.
        </p>
      </div>
    ),
  },
  {
    id: 'credentials',
    title: 'Get your credentials',
    subtitle: 'The .env.local file',
    icon: <KeyRound size={20} className="text-amber-400" />,
    confirmLabel: 'I have my .env.local file',
    content: (
      <div className="space-y-3">
        <p className="text-sm text-slate-300 leading-relaxed">
          The worker needs a <code className="text-amber-300">.env.local</code> file with database
          and API credentials. Ask the admin to send you this file.
        </p>
        <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 space-y-1">
          <p className="text-xs text-slate-400 mb-2 font-medium">Place it here:</p>
          <code className="text-xs text-slate-300 block">your-folder/</code>
          <code className="text-xs text-slate-300 block pl-4">worker/</code>
          <code className="text-xs text-amber-300 block pl-4 font-bold">.env.local  ← here</code>
        </div>
        <p className="text-xs text-slate-500">
          Never share this file publicly — it contains private API keys.
        </p>
      </div>
    ),
  },
  {
    id: 'install',
    title: 'Install dependencies',
    subtitle: 'One-time npm install',
    icon: <Terminal size={20} className="text-purple-400" />,
    confirmLabel: 'Dependencies installed',
    content: (
      <div className="space-y-3">
        <p className="text-sm text-slate-300 leading-relaxed">
          Inside the <code className="text-purple-300">worker/</code> folder, run this command once
          to install required packages.
        </p>
        <CopyBlock command="cd worker && npm install" />
        <p className="text-xs text-slate-500">
          This only needs to be done once. Skip it if you&apos;ve already run it.
        </p>
      </div>
    ),
  },
  {
    id: 'run',
    title: 'Start the worker',
    subtitle: 'Run it in your terminal',
    icon: <Rocket size={20} className="text-indigo-400" />,
    confirmLabel: 'Worker is running',
    content: (
      <div className="space-y-3">
        <p className="text-sm text-slate-300 leading-relaxed">
          Open a terminal and run the command below. Keep the terminal open — the worker
          runs continuously until you close it.
        </p>
        <CopyBlock command="node start.js" />
        <p className="text-xs text-slate-500">
          You should see <code className="text-green-400">[worker] Starting poll loop…</code> in the terminal.
        </p>
      </div>
    ),
  },
]

interface Props {
  onAccept: () => Promise<void>
  onCancel: () => void
}

export function WorkerSetupModal({ onAccept, onCancel }: Props) {
  const isFirstTime = typeof window !== 'undefined'
    ? !localStorage.getItem(STORAGE_KEY)
    : false

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const isLastStep = step === STEPS.length - 1
  const current = STEPS[step]

  async function handleConfirm() {
    if (isLastStep) {
      setLoading(true)
      localStorage.setItem(STORAGE_KEY, 'true')
      await onAccept()
      setDone(true)
      setLoading(false)
    } else {
      setStep((s) => s + 1)
    }
  }

  // Returning user — simple confirm
  if (!isFirstTime) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm shadow-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
            <h2 className="text-base font-semibold text-slate-100">Start Scraping</h2>
            <button onClick={onCancel} className="text-slate-400 hover:text-slate-200 transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="px-5 py-5">
            <p className="text-sm text-slate-300 leading-relaxed">
              Make sure the worker is running on your machine, then click Accept to start.
            </p>
            <CopyBlock command="node start.js" />
          </div>
          <div className="flex items-center gap-3 px-5 py-4 border-t border-slate-700">
            <button
              onClick={onCancel}
              className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                setLoading(true)
                await onAccept()
                setLoading(false)
              }}
              disabled={loading || done}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Play size={14} className="fill-current" />}
              {loading ? 'Starting…' : 'Accept & Start'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // First-time wizard
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Worker Setup</h2>
            <p className="text-xs text-slate-400 mt-0.5">One-time setup — only shown once</p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Step progress */}
        <div className="flex items-center gap-1.5 px-5 py-3 border-b border-slate-800">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5 flex-1">
              <div className={`flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0 transition-colors ${
                i < step ? 'bg-green-600' : i === step ? 'bg-indigo-600' : 'bg-slate-700'
              }`}>
                {i < step
                  ? <CheckCircle2 size={14} className="text-white" />
                  : <span className="text-xs text-white font-medium">{i + 1}</span>
                }
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px transition-colors ${i < step ? 'bg-green-600' : 'bg-slate-700'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="px-5 py-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
              {current.icon}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">{current.title}</h3>
              <p className="text-xs text-slate-400">{current.subtitle}</p>
            </div>
          </div>
          {current.content}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-slate-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || done}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {done ? (
              <><CheckCircle2 size={15} /> Started</>
            ) : loading ? (
              <><Loader2 size={15} className="animate-spin" /> Starting…</>
            ) : isLastStep ? (
              <><Play size={14} className="fill-current" /> Accept & Start Scraping</>
            ) : (
              current.confirmLabel + ' →'
            )}
          </button>
        </div>

        {/* Step counter */}
        <div className="px-5 pb-3 text-center">
          <span className="text-xs text-slate-600">Step {step + 1} of {STEPS.length}</span>
        </div>
      </div>
    </div>
  )
}
