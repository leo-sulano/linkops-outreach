import * as dotenv from 'dotenv'
dotenv.config({ path: '../.env.local' })

import { createClient } from '@supabase/supabase-js'
import { scrapeDomain } from './scraper'
import { discoverLinkedInContact } from './linkedin'
import { extractCompanyName, extractMailtoEmail, extractEmail, extractLinkedInCompany, extractLinkedInPerson, extractContactFromSiteText } from '../lib/leads/enrichment'
import { updateSingleContactInSheet, markLeadDataCollected } from '../lib/leads/sheets-service'

const POLL_INTERVAL_MS = 5_000
const DOMAIN_DELAY_MS = 5_000
const MAX_RETRIES = 3
const CONCURRENCY = 5

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

async function resetStuckJobs() {
  const sb = getSupabase()
  const { data } = await sb
    .from('lead_jobs')
    .select('id')
    .eq('status', 'processing')
  if (!data || data.length === 0) return
  await sb
    .from('lead_jobs')
    .update({ status: 'pending', started_at: null })
    .eq('status', 'processing')
  console.log(`[worker] Reset ${data.length} stuck processing jobs → pending`)
}

async function claimPendingJobs(count: number) {
  const sb = getSupabase()
  const { data } = await sb
    .from('lead_jobs')
    .select('*')
    .eq('status', 'pending')
    .lt('retry_count', MAX_RETRIES)
    .order('created_at', { ascending: true })
    .limit(count)

  if (!data || data.length === 0) return []

  const claimed = await Promise.all(
    data.map(async (job) => {
      const { error } = await sb
        .from('lead_jobs')
        .update({ status: 'processing', started_at: new Date().toISOString() })
        .eq('id', job.id)
        .eq('status', 'pending') // optimistic lock
      return error ? null : job
    })
  )

  return claimed.filter(Boolean) as typeof data
}

async function processJob(job: {
  id: string
  domain: string
  retry_count: number
}) {
  const sb = getSupabase()
  console.log(`[worker] Processing ${job.domain} (attempt ${job.retry_count + 1})`)

  try {
    const { html, text, contactText, links, captchaRequired } = await scrapeDomain(job.domain)

    if (captchaRequired) {
      await markLeadDataCollected(
        process.env.GOOGLE_SHEET_ID!,
        process.env.GOOGLE_LEADS_SHEET_TAB || 'Leads',
        job.domain,
        'Captcha Required'
      )
      await sb.from('lead_jobs').update({ status: 'needs_review', completed_at: new Date().toISOString() }).eq('id', job.id)
      console.log(`[worker] ${job.domain} → captcha required`)
      return
    }

    const company_name = extractCompanyName(text, html)
    // mailto: links from HTML source first (avoids tracker/JS addresses); fall back to rendered body text
    const company_email = extractMailtoEmail(html) ?? extractEmail(text, contactText)
    const company_linkedin = extractLinkedInCompany(links)
    const person_linkedin_from_site = extractLinkedInPerson(links)

    // Step 1: Try to extract name/role from the site's own About/Team pages (fast, no rate limits)
    const siteContact = extractContactFromSiteText(contactText)
    let contact_name: string | null = siteContact.name
    let contact_role: string | null = siteContact.role
    let contact_linkedin: string | null = null

    if (company_linkedin) {
      if (!contact_name) {
        // Site text didn't yield a name — fall back to LinkedIn scraping
        const li = await discoverLinkedInContact(company_linkedin)
        contact_name = li.contact_name
        contact_role = li.contact_role
        contact_linkedin = li.contact_linkedin ?? person_linkedin_from_site
      } else {
        // Name found on site; use any personal LinkedIn link found on the site
        contact_linkedin = person_linkedin_from_site
      }
    } else if (person_linkedin_from_site) {
      contact_linkedin = person_linkedin_from_site
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

    // Only flag needs_review when a name was found but looks like a paragraph (>50 chars)
    const nameIsTooLong = company_name !== null && company_name.length > 50
    const finalStatus = nameIsTooLong ? 'needs_review' : 'completed'
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
  console.log(`[worker] Starting poll loop (concurrency: ${CONCURRENCY})...`)
  await resetStuckJobs()
  while (true) {
    const jobs = await claimPendingJobs(CONCURRENCY)
    if (jobs.length > 0) {
      await Promise.all(jobs.map((job) => processJob(job)))
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
