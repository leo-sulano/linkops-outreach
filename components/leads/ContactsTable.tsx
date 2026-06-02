import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { LeadContact } from '@/lib/leads/repository'

type SortKey = keyof Pick<
  LeadContact,
  'domain' | 'company_name' | 'company_email' | 'contact_name' | 'contact_role' | 'vertical'
>

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'domain', label: 'Domain' },
  { key: 'company_name', label: 'Company Name' },
  { key: 'company_email', label: 'Email' },
  { key: 'contact_name', label: 'Contact Name' },
  { key: 'contact_role', label: 'Role' },
  { key: 'vertical', label: 'Vertical' },
]

export function ContactsTable({
  contacts,
  total,
  page,
  perPage,
  search,
  vertical,
  onSearch,
  onVertical,
  onPage,
}: {
  contacts: LeadContact[]
  total: number
  page: number
  perPage: number
  search: string
  vertical: string
  onSearch: (v: string) => void
  onVertical: (v: string) => void
  onPage: (p: number) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('domain')
  const [sortAsc, setSortAsc] = useState(true)

  const verticals = useMemo(() => {
    const s = new Set(contacts.map((c) => c.vertical).filter(Boolean) as string[])
    return Array.from(s).sort()
  }, [contacts])

  const sorted = useMemo(() => {
    return [...contacts].sort((a, b) => {
      const av = (a[sortKey] ?? '') as string
      const bv = (b[sortKey] ?? '') as string
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [contacts, sortKey, sortAsc])

  const totalPages = Math.ceil(total / perPage)

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortAsc((p) => !p)
    else { setSortKey(key); setSortAsc(true) }
  }

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search domain, company, email…"
          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-500"
        />
        <select
          value={vertical}
          onChange={(e) => onVertical(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-500"
        >
          <option value="">All Verticals</option>
          {verticals.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <div className="grid grid-cols-6 px-4 py-2 border-b border-slate-700 text-xs font-medium text-slate-400 uppercase tracking-wider">
          {COLUMNS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleSort(key)}
              className="flex items-center gap-1 hover:text-slate-200 transition-colors text-left"
            >
              {label}
              {sortKey === key ? (
                sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />
              ) : null}
            </button>
          ))}
        </div>

        <div className="divide-y divide-slate-800">
          {sorted.length === 0 ? (
            <p className="text-slate-500 text-sm px-4 py-6 text-center">No contacts found.</p>
          ) : (
            sorted.map((c) => (
              <div
                key={c.id}
                className="grid grid-cols-6 items-center px-4 py-2.5 hover:bg-slate-800/50 text-sm"
              >
                <span className="font-mono text-slate-200 truncate">{c.domain}</span>
                <span className="text-slate-300 truncate">{c.company_name ?? '—'}</span>
                <span className="text-slate-400 truncate">{c.company_email ?? '—'}</span>
                <span className="text-slate-300 truncate">{c.contact_name ?? '—'}</span>
                <span className="text-slate-400 truncate">{c.contact_role ?? '—'}</span>
                <span className="text-slate-500 truncate">{c.vertical ?? '—'}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-400">
          <span>
            {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onPage(page - 1)}
              disabled={page === 1}
              className="px-3 py-1 rounded-md border border-slate-700 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => onPage(page + 1)}
              disabled={page === totalPages}
              className="px-3 py-1 rounded-md border border-slate-700 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
