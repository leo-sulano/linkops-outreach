import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { LeadContact } from '@/lib/leads/repository'

function CopyButton({ value }: { value: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!value) return <span className="text-slate-600 text-xs">—</span>

  function handleCopy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2_000)
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors text-xs"
    >
      <span className="truncate max-w-[160px]">{value}</span>
      {copied ? (
        <Check size={12} className="text-green-400 shrink-0" />
      ) : (
        <Copy size={12} className="shrink-0" />
      )}
    </button>
  )
}

function CopyAllButton({ contact }: { contact: LeadContact }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const row = [
      contact.domain,
      contact.company_name,
      contact.company_email,
      contact.company_linkedin,
      contact.contact_name,
      contact.contact_role,
      contact.contact_linkedin,
    ]
      .map((v) => v ?? '')
      .join('\t')
    navigator.clipboard.writeText(row)
    setCopied(true)
    setTimeout(() => setCopied(false), 2_000)
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors text-xs px-2 py-0.5 rounded border border-slate-700 hover:border-slate-500"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy Row'}
    </button>
  )
}

export function OutreachTable({ contacts }: { contacts: LeadContact[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-100">
          Outreach Ready ({contacts.length})
        </h2>
      </div>

      {contacts.length === 0 ? (
        <p className="text-slate-500 text-sm">
          No outreach-ready contacts yet. Process new leads to populate this list.
        </p>
      ) : (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 px-4 py-2 border-b border-slate-700 text-xs font-medium text-slate-400 uppercase tracking-wider">
            <span>Domain</span>
            <span>Company</span>
            <span>Email</span>
            <span>Company LinkedIn</span>
            <span>Contact</span>
            <span>Role</span>
            <span className="text-right">Copy</span>
          </div>
          <div className="divide-y divide-slate-800">
            {contacts.map((c) => (
              <div
                key={c.id}
                className="grid grid-cols-7 items-center px-4 py-2.5 hover:bg-slate-800/50 text-sm"
              >
                <span className="font-mono text-slate-200 truncate">{c.domain}</span>
                <span className="text-slate-300 truncate">{c.company_name ?? '—'}</span>
                <CopyButton value={c.company_email} />
                <CopyButton value={c.company_linkedin} />
                <span className="text-slate-300 truncate">{c.contact_name ?? '—'}</span>
                <span className="text-slate-400 truncate">{c.contact_role ?? '—'}</span>
                <div className="flex justify-end">
                  <CopyAllButton contact={c} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
