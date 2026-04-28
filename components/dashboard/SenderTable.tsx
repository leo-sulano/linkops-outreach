import { Pencil, Trash2, ToggleLeft, ToggleRight, AlertCircle } from 'lucide-react'
import type { SenderWithStats } from '@/lib/senders/types'

interface SenderTableProps {
  senders: SenderWithStats[]
  onEdit: (sender: SenderWithStats) => void
  onDelete: (id: string) => void
  onToggleStatus: (id: string, currentStatus: string) => void
}

function StatusBadge({ sender }: { sender: SenderWithStats }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    inactive: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    error: 'bg-red-500/10 text-red-400 border-red-500/20',
  }
  const dotColors: Record<string, string> = {
    active: 'bg-emerald-400 animate-pulse',
    inactive: 'bg-slate-400',
    error: 'bg-red-400',
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono border ${colors[sender.status] ?? colors.inactive}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[sender.status] ?? dotColors.inactive}`} />
        {sender.status}
      </span>
      {sender.status === 'error' && sender.last_error && (
        <span title={sender.last_error} className="cursor-help text-red-400">
          <AlertCircle size={13} />
        </span>
      )}
    </div>
  )
}

export function SenderTable({ senders, onEdit, onDelete, onToggleStatus }: SenderTableProps) {
  if (senders.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-10 text-center text-slate-400 text-sm">
        No senders configured. Add your first sender to start rotating outreach.
      </div>
    )
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-x-auto">
      <table className="w-full min-w-max">
        <thead>
          <tr className="bg-slate-900/50 border-b border-slate-700">
            {['Name', 'Email', 'Type', 'Daily Limit', 'Sent Today', 'Status', 'Actions'].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-slate-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {senders.map((sender) => (
            <tr key={sender.id} className="hover:bg-slate-800/50 transition-colors">
              <td className="px-4 py-3 text-sm font-semibold text-slate-100">{sender.name}</td>
              <td className="px-4 py-3 text-sm font-mono text-slate-300">{sender.email}</td>
              <td className="px-4 py-3 text-sm text-slate-400">
                <span className="px-2 py-0.5 bg-slate-700 rounded text-xs font-mono">
                  {sender.credential_type === 'service_account' ? 'Service Account' : 'OAuth'}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-slate-300">{sender.daily_limit}</td>
              <td className="px-4 py-3 text-sm">
                <span className={`font-mono font-bold ${sender.sent_today >= sender.daily_limit ? 'text-red-400' : 'text-emerald-400'}`}>
                  {sender.sent_today}
                </span>
                <span className="text-slate-500 text-xs"> / {sender.daily_limit}</span>
              </td>
              <td className="px-4 py-3">
                <StatusBadge sender={sender} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onToggleStatus(sender.id, sender.status)}
                    title={sender.status === 'active' ? 'Deactivate' : 'Activate'}
                    className="text-slate-400 hover:text-slate-100 transition-colors"
                  >
                    {sender.status === 'active'
                      ? <ToggleRight size={18} className="text-emerald-400" />
                      : <ToggleLeft size={18} />
                    }
                  </button>
                  <button
                    onClick={() => onEdit(sender)}
                    title="Edit"
                    className="text-slate-400 hover:text-blue-400 transition-colors"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete sender "${sender.name}"? This also deletes all logs for this sender.`)) {
                        onDelete(sender.id)
                      }
                    }}
                    title="Delete"
                    className="text-slate-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
