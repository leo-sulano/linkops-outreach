import { useState, useEffect } from 'react'
import { ContactsTable } from '@/components/leads/ContactsTable'
import { LeadContact } from '@/lib/leads/repository'

const API_KEY = process.env.NEXT_PUBLIC_API_SECRET_KEY || ''

export default function ContactsPage() {
  const [contacts, setContacts] = useState<LeadContact[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [vertical, setVertical] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (vertical) params.set('vertical', vertical)
      params.set('page', String(page))
      params.set('perPage', '50')

      setLoading(true)
      fetch(`/api/leads/contacts?${params}`, { headers: { 'x-api-key': API_KEY } })
        .then((r) => r.json())
        .then((data) => {
          setContacts(data.contacts ?? [])
          setTotal(data.total ?? 0)
          setError(null)
        })
        .catch(() => setError('Failed to load contacts'))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [search, vertical, page])

  function handleSearch(v: string) { setSearch(v); setPage(1) }
  function handleVertical(v: string) { setVertical(v); setPage(1) }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Contacts</h1>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : (
        <ContactsTable
          contacts={contacts}
          total={total}
          page={page}
          perPage={50}
          search={search}
          vertical={vertical}
          onSearch={handleSearch}
          onVertical={handleVertical}
          onPage={setPage}
        />
      )}
    </div>
  )
}
