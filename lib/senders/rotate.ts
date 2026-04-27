import { getSupabaseClient } from '@/lib/integrations/supabase'
import type { Sender } from './types'
import { NoAvailableSenderError } from './errors'

// Returns YYYY-MM-DD in the given IANA timezone
export function getLocalDate(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
}

export interface SenderWithCount extends Sender {
  sent_today: number
}

export async function pickSender(): Promise<SenderWithCount> {
  const client = getSupabaseClient()

  // Load active senders ordered by last_used_at ASC (nulls first = never-used goes first)
  const { data: senders, error } = await client
    .from('senders')
    .select('*')
    .eq('status', 'active')
    .order('last_used_at', { ascending: true, nullsFirst: true })

  if (error) throw new Error(`Failed to load senders: ${error.message}`)
  if (!senders || senders.length === 0) throw new NoAvailableSenderError()

  // Fetch today's sent_count for each sender (in their own timezone)
  const withCounts: SenderWithCount[] = await Promise.all(
    (senders as Sender[]).map(async (sender) => {
      const today = getLocalDate(sender.timezone)
      const { data: stat } = await client
        .from('sender_daily_stats')
        .select('sent_count')
        .eq('sender_id', sender.id)
        .eq('date', today)
        .maybeSingle()
      return { ...sender, sent_today: stat?.sent_count ?? 0 }
    })
  )

  const eligible = withCounts.filter((s) => s.sent_today < s.daily_limit)
  if (eligible.length === 0) throw new NoAvailableSenderError()

  return eligible[0] // already sorted by last_used_at ASC
}
