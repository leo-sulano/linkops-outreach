import { LeadStats } from '@/lib/leads/repository'

const CARDS: { key: keyof LeadStats; label: string }[] = [
  { key: 'totalLeads', label: 'Total Leads' },
  { key: 'totalContacts', label: 'Total Contacts' },
  { key: 'newLeads', label: 'New Leads' },
  { key: 'affiliates', label: 'Affiliates' },
  { key: 'needsReview', label: 'Needs Review' },
  { key: 'outreachReady', label: 'Outreach Ready' },
]

export function StatsCards({ stats }: { stats: LeadStats }) {
  return (
    <div className="grid grid-cols-2 gap-4 mb-8 sm:grid-cols-3 xl:grid-cols-6">
      {CARDS.map(({ key, label }) => (
        <div key={key} className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <p className="text-xs text-slate-400 mb-1">{label}</p>
          <p className="text-2xl font-bold text-slate-100">{stats[key]}</p>
        </div>
      ))}
    </div>
  )
}
