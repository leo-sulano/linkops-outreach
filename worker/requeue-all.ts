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

  console.log('[requeue] Reading leads sheet...')
  const sheetLeads = await readLeadsSheet(spreadsheetId, leadsTab)

  const targets = sheetLeads.filter(
    (l) => l.type === 'Affiliate' && !EXCLUDED_TYPES.includes(l.type) && !l.data_collected?.trim()
  )
  console.log(`[requeue] ${targets.length} affiliate leads with empty Data Collected`)

  if (targets.length === 0) {
    console.log('[requeue] Nothing to requeue.')
    return
  }

  const domains = targets.map((l) => l.domain)
  const sb = getSupabase()

  // Delete old jobs and contacts so they can be re-scraped fresh
  const { error: delJobsErr } = await sb.from('lead_jobs').delete().in('domain', domains)
  if (delJobsErr) throw new Error(`delete lead_jobs: ${delJobsErr.message}`)
  console.log(`[requeue] Cleared old jobs for ${domains.length} domains`)

  const { error: delContactsErr } = await sb.from('lead_contacts').delete().in('domain', domains)
  if (delContactsErr) throw new Error(`delete lead_contacts: ${delContactsErr.message}`)
  console.log(`[requeue] Cleared old contacts for ${domains.length} domains`)

  // Upsert leads
  const { error: upsertErr } = await sb.from('leads').upsert(
    targets.map(({ data_collected: _, ...rest }) => rest),
    { onConflict: 'domain' }
  )
  if (upsertErr) throw new Error(`upsert leads: ${upsertErr.message}`)

  // Insert fresh pending jobs
  const runId = randomUUID()
  const rows = domains.map((domain) => ({ run_id: runId, domain, status: 'pending', retry_count: 0 }))
  const { error: insertErr } = await sb.from('lead_jobs').insert(rows)
  if (insertErr) throw new Error(`insert pending jobs: ${insertErr.message}`)

  console.log(`[requeue] Queued ${domains.length} domains for fresh scrape (run: ${runId})`)
  console.log(domains.join('\n'))
}

main().catch((err) => {
  console.error('[requeue] Fatal:', err)
  process.exit(1)
})
