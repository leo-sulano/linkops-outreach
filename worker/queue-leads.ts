import * as dotenv from 'dotenv'
dotenv.config({ path: '../.env.local' })

import { randomUUID } from 'crypto'
import { readLeadsSheet } from '../lib/leads/sheets-service'
import { createClient } from '@supabase/supabase-js'

const EXCLUDED_TYPES = ['Operator', 'Skip', 'Unknown']

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function main() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!
  const leadsTab = process.env.GOOGLE_LEADS_SHEET_TAB || 'Leads'

  console.log('[queue] Reading leads sheet...')
  const sheetLeads = await readLeadsSheet(spreadsheetId, leadsTab)

  const affiliates = sheetLeads.filter(
    (l) => l.type === 'Affiliate' && !EXCLUDED_TYPES.includes(l.type)
  )
  console.log(`[queue] ${affiliates.length} affiliate leads found`)

  const uncollected = affiliates.filter((l) => !l.data_collected?.trim())
  console.log(`[queue] ${uncollected.length} leads with empty Data Collected`)

  if (uncollected.length === 0) {
    console.log('[queue] Nothing to queue.')
    return
  }

  const sb = getSupabase()

  // Upsert leads (without data_collected — that column stays in Sheets only)
  const { error: upsertErr } = await sb.from('leads').upsert(
    affiliates.map(({ data_collected: _, ...rest }) => rest),
    { onConflict: 'domain' }
  )
  if (upsertErr) throw new Error(`upsertLeads: ${upsertErr.message}`)

  const [{ data: existingContacts }, { data: queuedJobs }] = await Promise.all([
    sb.from('lead_contacts').select('domain'),
    sb.from('lead_jobs').select('domain').in('status', ['pending', 'processing']),
  ])
  const existing = new Set((existingContacts ?? []).map((r: any) => r.domain))
  const alreadyQueued = new Set((queuedJobs ?? []).map((r: any) => r.domain))

  const newDomains = uncollected
    .map((l) => l.domain)
    .filter((d) => !existing.has(d) && !alreadyQueued.has(d))

  if (newDomains.length === 0) {
    console.log('[queue] All uncollected leads are already processed or queued.')
    return
  }

  const runId = randomUUID()
  const rows = newDomains.map((domain) => ({ run_id: runId, domain, status: 'pending', retry_count: 0 }))
  const { error: insertErr } = await sb.from('lead_jobs').insert(rows)
  if (insertErr) throw new Error(`insertPendingJobs: ${insertErr.message}`)

  console.log(`[queue] Queued ${newDomains.length} domains (run: ${runId})`)
  console.log(newDomains.join('\n'))
}

main().catch((err) => {
  console.error('[queue] Fatal:', err)
  process.exit(1)
})
