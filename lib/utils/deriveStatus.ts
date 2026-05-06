import type { Contact, PipelineStatus } from '@/components/dashboard/types'

const MANUAL_STAGES: PipelineStatus[] = [
  'outreach_sent',
  'send_followup',
  'response_received',
  'under_negotiation',
  'negotiated',
  'approved',
  'payment_sent',
  'live',
]

export function deriveStatus(contact: Contact): PipelineStatus {
  if (MANUAL_STAGES.includes(contact.status)) return contact.status

  if (contact.responseDate) return 'response_received'
  if (!contact.outreachDate) return 'start_outreach'

  const daysSince =
    (Date.now() - new Date(contact.outreachDate).getTime()) / (1000 * 60 * 60 * 24)

  return daysSince >= 2 ? 'send_followup' : 'outreach_sent'
}

export const MANUAL_PIPELINE_STAGES = MANUAL_STAGES
