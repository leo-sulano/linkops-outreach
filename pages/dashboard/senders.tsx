import { useState, useEffect } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { SenderTable } from '@/components/dashboard/SenderTable'
import { AddSenderModal } from '@/components/dashboard/AddSenderModal'
import type { SenderWithStats, SenderPublic } from '@/lib/senders/types'

export default function SendersPage() {
  const [senders, setSenders] = useState<SenderWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SenderPublic | null>(null)

  const loadSenders = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/senders/stats')
      const data = await res.json()
      setSenders(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to load senders:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSenders() }, [])

  const handleSave = async (payload: any) => {
    if (editing) {
      const res = await fetch(`/api/senders/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update sender')
      }
    } else {
      const res = await fetch('/api/senders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create sender')
      }
    }
    await loadSenders()
    setEditing(null)
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/senders/${id}`, { method: 'DELETE' })
    await loadSenders()
  }

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const next = currentStatus === 'active' ? 'inactive' : 'active'
    await fetch(`/api/senders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    await loadSenders()
  }

  const activeSenders = senders.filter((s) => s.status === 'active')
  const totalSentToday = senders.reduce((sum, s) => sum + s.sent_today, 0)
  const totalLimit = senders.reduce((sum, s) => sum + s.daily_limit, 0)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <a href="/dashboard" className="text-xs font-mono text-slate-500 hover:text-slate-300 transition-colors mb-2 block">
              ← Back to Dashboard
            </a>
            <h1 className="text-2xl font-black text-slate-100 tracking-tight">
              Sender <span className="text-emerald-400">Accounts</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage Gmail sender accounts for outreach rotation
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadSenders}
              disabled={loading}
              className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => { setEditing(null); setModalOpen(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-500 transition-colors text-sm"
            >
              <Plus size={16} />
              Add Sender
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Active Senders', value: activeSenders.length },
            { label: 'Sent Today (all)', value: totalSentToday },
            { label: 'Daily Capacity', value: totalLimit },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-4">
              <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-1">{label}</div>
              <div className="text-2xl font-black text-slate-100">{value}</div>
            </div>
          ))}
        </div>

        {/* Sender table */}
        <SenderTable
          senders={senders}
          onEdit={(sender) => { setEditing(sender as SenderPublic); setModalOpen(true) }}
          onDelete={handleDelete}
          onToggleStatus={handleToggleStatus}
        />

        {/* Recent logs */}
        {senders.some((s) => s.recent_logs.length > 0) && (
          <div className="mt-8">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest mb-4">Recent Send Logs</h2>
            <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-900/50 border-b border-slate-700">
                    {['Sender', 'To', 'Subject', 'Status', 'Time'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {senders.flatMap((s) =>
                    s.recent_logs.map((log, i) => (
                      <tr key={`${s.id}-${i}`} className="hover:bg-slate-800/50">
                        <td className="px-4 py-2 text-xs font-mono text-slate-400">{s.email}</td>
                        <td className="px-4 py-2 text-xs text-slate-300">{log.contact_email || '—'}</td>
                        <td className="px-4 py-2 text-xs text-slate-300 max-w-xs truncate">{log.subject || '—'}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${log.status === 'sent' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500">
                          {new Date(log.sent_at).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AddSenderModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        editing={editing}
      />
    </div>
  )
}
