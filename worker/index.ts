import * as dotenv from 'dotenv'
dotenv.config({ path: '../.env.local' })

import { createClient } from '@supabase/supabase-js'
import { scrapeDomain } from './scraper'
import { discoverLinkedInContact } from './linkedin'
import { extractCompanyName, extractEmail, extractLinkedInCompany } from '../lib/leads/enrichment'
import { updateSingleContactInSheet, markLeadDataCollected } from '../lib/leads/sheets-service'

const POLL_INTERVAL_MS = 5_000
const DOMAIN_DELAY_MS = 5_000
const MAX_RETRIES = 3

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function claimPendingJob() {
  const sb = getSupabase()
  const { data } = await sb
    .from('lead_jobs')
    .select('*')
    .eq('status', 'pending')
    .lt('retry_count', MAX_RETRIES)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (!data) return null

  const { error } = await sb
    .from('lead_jobs')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', data.id)
    .eq('status', 'pending') // optimistic lock

  return error ? null : data
}

async function processJob(job: {
  id: string
  domain: string
  retry_count: number
}) {
  const sb = getSupabase()
  console.log(`[worker] Processing ${job.domain} (attempt ${job.retry_count + 1})`)

  try {
    const { html, text, links } = await scrapeDomain(job.domain)
    const company_name = extractCompanyName(text, html)
    const company_email = extractEmail(text)
    const company_linkedin = extractLinkedInCompany(links)

    let contact_name: string | null = null
    let contact_role: string | null = null
    let contact_linkedin: string | null = null

    if (company_linkedin) {
      const li = await discoverLinkedInContact(company_linkedin)
      contact_name = li.contact_name
      contact_role = li.contact_role
      contact_linkedin = li.contact_linkedin
    }

    const { data: lead } = await sb
      .from('leads')
      .select('vertical')
      .eq('domain', job.domain)
      .single()

    const contact = {
      domain: job.domain,
      vertical: lead?.vertical ?? null,
      company_type: null,
      company_name,
      company_email,
      company_linkedin,
      contact_name,
      contact_role,
      contact_linkedin,
      new_lead: true,
      emailed: false,
      contacted: false,
    }

    await sb.from('lead_contacts').upsert(contact, { onConflict: 'domain' })

    await updateSingleContactInSheet(
      process.env.GOOGLE_SHEET_ID!,
      process.env.GOOGLE_CONTACTS_SHEET_TAB || 'Contacts',
      contact
    )

    // Determine remark for Data Collected column
    const hasData = company_name || company_email || (company_linkedin ?? contact_linkedin)
    let remark: string
    if (hasData) {
      remark = 'Done'
    } else {
      // Nothing found — describe what was missing
      remark = 'No data found'
    }

    await markLeadDataCollected(
      process.env.GOOGLE_SHEET_ID!,
      process.env.GOOGLE_LEADS_SHEET_TAB || 'Leads',
      job.domain,
      remark
    )

    const finalStatus = company_name ? 'completed' : 'needs_review'
    await sb
      .from('lead_jobs')
      .update({ status: finalStatus, completed_at: new Date().toISOString() })
      .eq('id', job.id)

    console.log(`[worker] ${job.domain} → ${finalStatus} | Data Collected: ${remark}`)
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    console.error(`[worker] ${job.domain} failed: ${msg}`)

    const newRetry = job.retry_count + 1
    const isLastRetry = newRetry >= MAX_RETRIES

    // On final retry failure, write the reason to Data Collected column
    if (isLastRetry) {
      const reason = msg.toLowerCase().includes('timeout') ? 'Site timeout'
        : msg.toLowerCase().includes('err_name_not_resolved') || msg.toLowerCase().includes('net::') ? 'Site unreachable'
        : `Error: ${msg.slice(0, 60)}`
      try {
        await markLeadDataCollected(
          process.env.GOOGLE_SHEET_ID!,
          process.env.GOOGLE_LEADS_SHEET_TAB || 'Leads',
          job.domain,
          reason
        )
      } catch { /* don't let sheet write block job update */ }
    }

    await sb
      .from('lead_jobs')
      .update({
        status: isLastRetry ? 'failed' : 'pending',
        retry_count: newRetry,
        error_log: msg,
      })
      .eq('id', job.id)
      .eq('status', 'processing')
  }
}

async function pollLoop() {
  console.log('[worker] Starting poll loop...')
  while (true) {
    const job = await claimPendingJob()
    if (job) {
      await processJob(job)
      await sleep(DOMAIN_DELAY_MS)
    } else {
      await sleep(POLL_INTERVAL_MS)
    }
  }
}

pollLoop().catch((err) => {
  console.error('[worker] Fatal:', err)
  process.exit(1)
})
