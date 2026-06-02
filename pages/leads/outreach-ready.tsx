import { GetServerSideProps } from 'next'
import { OutreachTable } from '@/components/leads/OutreachTable'
import { LeadContact, getOutreachReady } from '@/lib/leads/repository'

export const getServerSideProps: GetServerSideProps = async () => {
  try {
    const contacts = await getOutreachReady()
    return { props: { contacts } }
  } catch {
    return { props: { contacts: [] } }
  }
}

export default function OutreachReadyPage({
  contacts,
}: {
  contacts: LeadContact[]
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Outreach Ready</h1>
      <OutreachTable contacts={contacts} />
    </div>
  )
}
