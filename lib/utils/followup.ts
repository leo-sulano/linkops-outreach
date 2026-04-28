import type { Contact } from '@/components/dashboard/types'

export function isDueForFollowup(contact: Contact): boolean {
  if (contact.status !== 'outreach_sent' || !contact.outreachDate) return false
  const daysSince = (Date.now() - new Date(contact.outreachDate).getTime()) / (1000 * 60 * 60 * 24)
  return daysSince >= 2
}
