import { NextApiRequest, NextApiResponse } from 'next'
import { requireApiKey } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/integrations/supabase'
import { clearDataCollectedColumn } from '@/lib/leads/sheets-service'

const TABLES_IN_ORDER = [
  // Delete dependents before parents
  'messages',
  'contacts_metadata',
  'contacts',
  'lead_jobs',
  'lead_contacts',
  'leads',
  'sheet_contacts',
] as const

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireApiKey(req, res)) return

  try {
    const sb = getSupabaseAdminClient()

    const skipped: string[] = []
    for (const table of TABLES_IN_ORDER) {
      let error: any
      if (table === 'sheet_contacts') {
        ;({ error } = await sb.from(table).delete().gte('row_index', 0))
      } else {
        ;({ error } = await sb.from(table).delete().not('id', 'is', null))
      }
      if (error) {
        // Table doesn't exist yet — skip silently
        if (error.message?.includes('schema cache') || error.code === '42P01') {
          skipped.push(table)
          continue
        }
        console.error(`[reset] Failed to clear ${table}:`, error.message)
        return res.status(500).json({ error: `Failed to clear ${table}: ${error.message}` })
      }
    }

    // Clear "Data Collected" column in Google Sheets so leads get re-queued on next Process
    const spreadsheetId = process.env.GOOGLE_SHEET_ID!
    const leadsTab = process.env.GOOGLE_LEADS_SHEET_TAB || 'Leads'
    await clearDataCollectedColumn(spreadsheetId, leadsTab)

    return res.status(200).json({ ok: true, message: 'All data cleared. Ready to start fresh.', skipped })
  } catch (err: any) {
    console.error('[reset]', err)
    return res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}
