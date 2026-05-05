import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdminClient } from '@/lib/integrations/supabase'
import { requireApiKey } from '@/lib/api-auth'
import { encryptCredential } from '@/lib/crypto'

const PUBLIC_COLUMNS = 'id, name, email, credential_type, daily_limit, timezone, status, last_error, last_used_at, created_at'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!requireApiKey(req, res)) return

    const client = getSupabaseAdminClient()

    if (req.method === 'GET') {
      const { data, error } = await client
        .from('senders')
        .select(PUBLIC_COLUMNS)
        .order('created_at', { ascending: true })

      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json(data)
    }

    if (req.method === 'POST') {
      const { name, email, credential_type, credential_json, daily_limit, timezone } = req.body

      if (!name || !email || !credential_type || !credential_json) {
        return res.status(400).json({ error: 'name, email, credential_type, credential_json are required' })
      }

      if (!['service_account', 'oauth', 'smtp'].includes(credential_type)) {
        return res.status(400).json({ error: 'credential_type must be service_account, oauth, or smtp' })
      }

      const { data, error } = await client
        .from('senders')
        .insert([{
          name,
          email,
          credential_type,
          credential_json: encryptCredential(credential_json),
          daily_limit: daily_limit ?? 50,
          timezone: timezone ?? 'Europe/London',
        }])
        .select(PUBLIC_COLUMNS)
        .single()

      if (error) return res.status(500).json({ error: error.message })
      return res.status(201).json(data)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: any) {
    console.error('[POST /api/senders]', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
