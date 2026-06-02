import { GetServerSideProps } from 'next'
import { StatsCards } from '@/components/leads/StatsCards'
import { LeadStats, getLeadStats } from '@/lib/leads/repository'

export const getServerSideProps: GetServerSideProps = async () => {
  try {
    const stats = await getLeadStats()
    return { props: { stats } }
  } catch {
    return {
      props: {
        stats: {
          totalLeads: 0,
          totalContacts: 0,
          newLeads: 0,
          affiliates: 0,
          needsReview: 0,
          outreachReady: 0,
        },
      },
    }
  }
}

export default function LeadsOverviewPage({ stats }: { stats: LeadStats }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Leads Overview</h1>
      <StatsCards stats={stats} />
    </div>
  )
}
