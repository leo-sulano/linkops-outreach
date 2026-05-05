import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { SenderPublic } from '@/lib/senders/types'

interface AddSenderModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: any) => Promise<void>
  editing?: SenderPublic | null
}

const TIMEZONES = [
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Australia/Sydney',
]

export function AddSenderModal({ isOpen, onClose, onSave, editing }: AddSenderModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [appPassword, setAppPassword] = useState('')
  const [dailyLimit, setDailyLimit] = useState(50)
  const [timezone, setTimezone] = useState('Europe/London')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (editing) {
      setName(editing.name)
      setEmail(editing.email)
      setDailyLimit(editing.daily_limit)
      setTimezone(editing.timezone)
      setAppPassword('')
    } else {
      setName('')
      setEmail('')
      setAppPassword('')
      setDailyLimit(50)
      setTimezone('Europe/London')
    }
    setError(null)
  }, [editing, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!editing && !appPassword.trim()) {
      setError('App Password is required')
      return
    }

    setSaving(true)
    try {
      const payload: any = { name, email, daily_limit: dailyLimit, timezone }
      if (appPassword.trim()) {
        payload.credential_type = 'smtp'
        payload.credential_json = { app_password: appPassword.trim() }
      }
      await onSave(payload)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to save sender')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-widest">
            {editing ? 'Edit Sender' : 'Add Sender'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-mono text-slate-500 mb-1">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Leo Outreach 1"
              className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-500 mb-1">Gmail Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="sender@yourdomain.com"
              className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-slate-500 mb-1">Daily Limit</label>
              <input
                type="number"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Number(e.target.value))}
                min={1}
                max={500}
                required
                className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-500 mb-1">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-500 mb-1">
              Gmail App Password {editing && <span className="text-slate-600">(leave blank to keep existing)</span>}
            </label>
            <input
              type="password"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              placeholder="xxxx xxxx xxxx xxxx"
              className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 font-mono tracking-widest"
            />
            <p className="text-xs text-slate-600 mt-1">
              Google Account → Security → 2-Step Verification → App passwords
            </p>
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition-colors text-sm"
            >
              {saving ? 'Saving…' : editing ? 'Update Sender' : 'Add Sender'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 text-slate-100 font-bold rounded-lg hover:bg-slate-600 transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
