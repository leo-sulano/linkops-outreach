import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseClient } from '@/lib/integrations/supabase'
import { requireApiKey } from '@/lib/api-auth'

const PUBLIC_COLUMNS = 'id, name, email, credential_type, daily_limit, timezone, status, last_error, last_used_at, created_at'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireApiKey(req, res)) return

  const { id } = req.query
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' })

  const client = getSupabaseClient()

  if (req.method === 'PUT') {
    const { name, email, credential_type, credential_json, daily_limit, timezone, status } = req.body
    const updates: Record<string, any> = {}

    if (name !== undefined)            updates.name = name
    if (email !== undefined)           updates.email = email
    if (credential_type !== undefined) updates.credential_type = credential_type
    if (credential_json !== undefined) updates.credential_json = credential_json
    if (daily_limit !== undefined)     updates.daily_limit = daily_limit
    if (timezone !== undefined)        updates.timezone = timezone
    if (status !== undefined) {
      updates.status = status
      if (status === 'active') updates.last_error = null // clear error on re-activate
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    const { data, error } = await client
      .from('senders')
      .update(updates)
      .eq('id', id)
      .select(PUBLIC_COLUMNS)
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    const { error } = await client.from('senders').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
