import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdminClient } from '@/lib/integrations/supabase'

function getLocalDate(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const client = getSupabaseAdminClient()

  const { data: senders, error } = await client
    .from('senders')
    .select('id, name, email, credential_type, daily_limit, timezone, status, last_error')
    .order('created_at', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })

  const stats = await Promise.all(
    (senders || []).map(async (sender: any) => {
      const today = getLocalDate(sender.timezone)

      const { data: stat } = await client
        .from('sender_daily_stats')
        .select('sent_count')
        .eq('sender_id', sender.id)
        .eq('date', today)
        .maybeSingle()

      const { data: logs } = await client
        .from('outreach_logs')
        .select('contact_email, subject, status, sent_at, error')
        .eq('sender_id', sender.id)
        .order('sent_at', { ascending: false })
        .limit(10)

      return {
        id: sender.id,
        name: sender.name,
        email: sender.email,
        credential_type: sender.credential_type,
        daily_limit: sender.daily_limit,
        timezone: sender.timezone,
        status: sender.status,
        last_error: sender.last_error,
        sent_today: stat?.sent_count ?? 0,
        recent_logs: logs ?? [],
      }
    })
  )

  return res.status(200).json(stats)
}
