import * as dotenv from 'dotenv'
dotenv.config({ path: '../.env.local' })

import { createClient } from '@supabase/supabase-js'
import { scrapeDomain } from './scraper'
import { discoverLinkedInContact } from './linkedin'
import { aiExtract, regexExtract, AIExtractResult } from './ai-extract'
import { updateSingleContactInSheet, markLeadDataCollected } from '../lib/leads/sheets-service'
import { extractLinkedInPerson } from '../lib/leads/enrichment'

const POLL_INTERVAL_MS = 5_000
const DOMAIN_DELAY_MS = 2_000
const MAX_RETRIES = 3
const CONCURRENCY = 1
const JOB_TIMEOUT_MS = 5 * 60 * 1_000       // 5 min hard cap per job
const STUCK_JOB_THRESHOLD_MS = 10 * 60 * 1_000 // reset jobs processing > 10 min

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
  const cutoff = new Date(Date.now() - STUCK_JOB_THRESHOLD_MS).toISOString()
  const { data } = await sb
    .from('lead_jobs')
    .select('id')
    .eq('status', 'processing')
    .lt('started_at', cutoff)
  if (!data || data.length === 0) return
  const ids = data.map((r) => r.id)
  await sb
    .from('lead_jobs')
    .update({ status: 'pending', started_at: null })
    .in('id', ids)
  console.log(`[worker] Reset ${ids.length} stuck processing jobs → pending`)
}

async function claimPendingJobs(count: number) {
  const sb = getSupabase()

  // Enforce strict serial execution: don't claim if any job is still in-flight
  const { count: activeCount } = await sb
    .from('lead_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'processing')
  if ((activeCount ?? 0) > 0) return []

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
    const { html, text, contactText, links, captchaRequired } = await scrapeDomain(
      job.domain,
      async (path) => {
        await sb.from('lead_jobs').update({ current_page: path }).eq('id', job.id)
      },
    )

    if (captchaRequired) {
      await markLeadDataCollected(
        process.env.GOOGLE_SHEET_ID!,
        process.env.GOOGLE_LEADS_SHEET_TAB || 'Leads',
        job.domain,
        'Captcha Required'
      )
      await sb.from('lead_jobs').update({ status: 'needs_review', completed_at: new Date().toISOString(), current_page: null }).eq('id', job.id).eq('status', 'processing')
      console.log(`[worker] ${job.domain} → captcha required`)
      return
    }

    // AI extraction — regex fallback fires silently if AI call fails
    let extracted: AIExtractResult
    try {
      extracted = await aiExtract(html, text, contactText, links)
      console.log(`[worker] ${job.domain} → AI extraction OK`)
    } catch (err: any) {
      console.warn(`[worker] ${job.domain} → AI failed, using regex fallback: ${err.message}`)
      extracted = regexExtract(html, text, contactText, links)
    }

    const company_name = extracted.company_name
    const company_email = extracted.company_email
    const company_linkedin = extracted.company_linkedin
    const company_type = extracted.company_type
    let contact_name = extracted.contact_name
    let contact_role = extracted.contact_role
    let contact_linkedin = extracted.contact_linkedin

    // LinkedIn scraping fallback: AI found a company page but no contact name
    if (company_linkedin && !contact_name) {
      const li = await discoverLinkedInContact(company_linkedin)
      contact_name = li.contact_name
      contact_role = li.contact_role
      contact_linkedin = li.contact_linkedin ?? extracted.contact_linkedin
    }

    // Personal LinkedIn fallback: if AI missed a /in/ link present in raw HTML links
    if (!contact_linkedin) {
      contact_linkedin = extractLinkedInPerson(links)
    }

    const { data: lead } = await sb
      .from('leads')
      .select('vertical')
      .eq('domain', job.domain)
      .single()

    const contact = {
      domain: job.domain,
      vertical: lead?.vertical ?? null,
      company_type,
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
      .update({ status: finalStatus, completed_at: new Date().toISOString(), current_page: null })
      .eq('id', job.id)
      .eq('status', 'processing') // no-op if job was stopped/reset mid-flight

    console.log(`[worker] ${job.domain} → ${finalStatus} | Data Collected: ${remark}`)
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    console.error(`[worker] ${job.domain} failed: ${msg}`)

    const isDriverError = msg.toLowerCase().includes('unable to obtain browser driver')
    if (isDriverError) {
      // Infrastructure failure — ChromeDriver/Selenium Manager glitch. Don't count against the
      // domain's retry budget and don't write anything to the sheet; just requeue and wait.
      console.warn(`[worker] ${job.domain} → driver init failure, requeueing without retry penalty`)
      await sb
        .from('lead_jobs')
        .update({ status: 'pending', started_at: null, error_log: msg })
        .eq('id', job.id)
        .eq('status', 'processing')
      return
    }

    const newRetry = job.retry_count + 1
    const isSiteUnreachable = msg.toLowerCase().includes('net::') || msg.toLowerCase().includes('err_name_not_resolved')
    const isLastRetry = newRetry >= MAX_RETRIES || isSiteUnreachable

    // On final retry failure, write the reason to Data Collected column
    if (isLastRetry) {
      const reason = isSiteUnreachable ? 'No data found'
        : msg.toLowerCase().includes('timeout') ? 'Site timeout'
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

    const finalStatus = isLastRetry ? (isSiteUnreachable ? 'completed' : 'failed') : 'pending'
    await sb
      .from('lead_jobs')
      .update({
        status: finalStatus,
        retry_count: newRetry,
        error_log: msg,
        ...(isLastRetry && { completed_at: new Date().toISOString(), current_page: null }),
      })
      .eq('id', job.id)
      .eq('status', 'processing')
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Job timed out after ${ms / 1000}s: ${label}`)), ms)
    ),
  ])
}

let loopIteration = 0

async function pollLoop() {
  console.log(`[worker] Starting poll loop (concurrency: ${CONCURRENCY})...`)
  await resetStuckJobs()
  while (true) {
    loopIteration++
    // Periodically rescue jobs left in processing by a previous run or a timeout
    if (loopIteration % 12 === 0) await resetStuckJobs()

    const jobs = await claimPendingJobs(CONCURRENCY)
    if (jobs.length > 0) {
      await Promise.all(
        jobs.map((job) =>
          withTimeout(processJob(job), JOB_TIMEOUT_MS, job.domain).catch(async (err) => {
            const msg = err?.message ?? String(err)
            console.error(`[worker] ${job.domain} timed out: ${msg}`)
            const sb = getSupabase()
            const newRetry = job.retry_count + 1
            const isLastRetry = newRetry >= MAX_RETRIES
            await sb
              .from('lead_jobs')
              .update({
                status: isLastRetry ? 'failed' : 'pending',
                retry_count: newRetry,
                error_log: msg,
                started_at: null,
              })
              .eq('id', job.id)
              .eq('status', 'processing')
          })
        )
      )
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
