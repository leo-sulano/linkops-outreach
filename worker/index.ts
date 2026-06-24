import * as dotenv from 'dotenv'
dotenv.config({ path: '../.env.local' })

import { createClient } from '@supabase/supabase-js'
import { scrapeDomain } from './scraper'
import { discoverLinkedInContact } from './linkedin'
import { aiExtract, regexExtract, AIExtractResult } from './ai-extract'
import { aiResearch } from './ai-research'
import { updateSingleContactInSheet, markLeadDataCollected } from '../lib/leads/sheets-service'
import { extractLinkedInPerson } from '../lib/leads/enrichment'

const POLL_INTERVAL_MS = 5_000
const DOMAIN_DELAY_MS = 2_000
const MAX_RETRIES = 3
const CONCURRENCY = 1
const JOB_TIMEOUT_MS = 5 * 60 * 1_000       // 5 min hard cap per job
const STUCK_JOB_THRESHOLD_MS = 10 * 60 * 1_000 // reset jobs processing > 10 min
const WATCHDOG_MS = 30 * 60 * 1_000
let lastJobTerminatedAt = Date.now()

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

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), JOB_TIMEOUT_MS)

  try {
    const { html, text, contactText, links, captchaRequired } = await scrapeDomain(
      job.domain,
      async (path) => {
        await sb.from('lead_jobs').update({ current_page: path }).eq('id', job.id)
      },
      controller.signal,
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

    // Gemini research — validates and enriches extracted data via Google Search grounding.
    // Only overwrites a field when 2+ independent external sources agree.
    // Failures are silent: scraped data is used as-is.
    let researched: Partial<AIExtractResult> = {}
    try {
      researched = await aiResearch(job.domain, extracted)
      console.log(`[worker] ${job.domain} → Gemini research OK`)
    } catch (err: any) {
      console.warn(`[worker] ${job.domain} → Gemini research failed, using scraped data: ${err.message}`)
    }
    // Gemini fills only fields that scraping left null — never overwrites a scraped value
    const merged: AIExtractResult = {
      ...extracted,
      company_name:      researched.company_name      ?? extracted.company_name,
      company_email:     researched.company_email     ?? extracted.company_email,
      contact_name:      researched.contact_name      ?? extracted.contact_name,
      contact_role:      researched.contact_role      ?? extracted.contact_role,
      company_linkedin:  researched.company_linkedin  ?? extracted.company_linkedin,
      contact_linkedin:  researched.contact_linkedin  ?? extracted.contact_linkedin,
    } as AIExtractResult

    const company_name = merged.company_name
    const company_email = merged.company_email
    const company_linkedin = merged.company_linkedin
    const company_type = merged.company_type
    let contact_name = merged.contact_name
    let contact_role = merged.contact_role
    let contact_linkedin = merged.contact_linkedin

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

    // Flag needs_review when the name is too long (paragraph) or is a generic UI string
    const nameIsTooLong = company_name !== null && company_name.length > 50
    const UI_STRINGS = /^(?:home|page\s*not\s*found|4\d{2}|error|all\s+rights\s+reserved|copyright|privacy\s*policy|terms(?:\s+(?:of\s+)?(?:service|use))?|contact\s*us|about\s*us|our\s+team|meet\s+the\s+team|welcome\s+to|loading|undefined|null|n\/?a)\s*$/i
    const nameIsUIString = company_name !== null && UI_STRINGS.test(company_name.trim())
    const finalStatus = (nameIsTooLong || nameIsUIString) ? 'needs_review' : 'completed'
    const completedAt = new Date().toISOString()
    await sb
      .from('lead_jobs')
      .update({ status: finalStatus, completed_at: completedAt, current_page: null })
      .eq('id', job.id)
      .eq('status', 'processing') // no-op if job was stopped/reset mid-flight

    // Deduplicate: kill any other pending/processing copies of the same domain
    // so a stuck duplicate can't loop the worker back to this domain indefinitely.
    await sb
      .from('lead_jobs')
      .update({ status: 'completed', completed_at: completedAt, current_page: null })
      .eq('domain', job.domain)
      .in('status', ['pending', 'processing'])
      .neq('id', job.id)

    console.log(`[worker] ${job.domain} → ${finalStatus} | Data Collected: ${remark}`)
  } catch (err: any) {
    if (controller.signal.aborted) {
      const msg = `Job timed out after ${JOB_TIMEOUT_MS / 1000}s: ${job.domain}`
      console.error(`[worker] ${job.domain} timed out`)
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
      return
    }

    const msg = err?.message ?? String(err)
    console.error(`[worker] ${job.domain} failed: ${msg}`)

    const isDriverError = msg.toLowerCase().includes('unable to obtain browser driver')
    if (isDriverError) {
      // Infrastructure failure — ChromeDriver/Selenium Manager glitch.
      // Still count against retry budget to prevent infinite loops when Chrome keeps failing.
      const newRetryDriver = job.retry_count + 1
      const isLastDriverRetry = newRetryDriver >= MAX_RETRIES
      console.warn(`[worker] ${job.domain} → driver init failure (${newRetryDriver}/${MAX_RETRIES}), ${isLastDriverRetry ? 'marking failed' : 'requeueing'}`)
      await sb
        .from('lead_jobs')
        .update({
          status: isLastDriverRetry ? 'failed' : 'pending',
          started_at: null,
          error_log: msg,
          retry_count: newRetryDriver,
        })
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
    const failedAt = isLastRetry ? new Date().toISOString() : null
    await sb
      .from('lead_jobs')
      .update({
        status: finalStatus,
        retry_count: newRetry,
        error_log: msg,
        ...(failedAt && { completed_at: failedAt, current_page: null }),
      })
      .eq('id', job.id)
      .eq('status', 'processing')

    // Deduplicate: on final failure, kill any other copies so they don't re-enter the loop
    if (isLastRetry) {
      await sb
        .from('lead_jobs')
        .update({ status: finalStatus, completed_at: failedAt, current_page: null })
        .eq('domain', job.domain)
        .in('status', ['pending', 'processing'])
        .neq('id', job.id)
    }
  } finally {
    clearTimeout(timeoutId)
    lastJobTerminatedAt = Date.now()
  }
}

async function sendHeartbeat() {
  try {
    const sb = getSupabase()
    await sb
      .from('worker_heartbeat')
      .upsert({ id: 'worker', last_seen_at: new Date().toISOString() }, { onConflict: 'id' })
  } catch { /* non-critical — never let heartbeat crash the worker */ }
}

let loopIteration = 0

async function pollLoop() {
  console.log(`[worker] Starting poll loop (concurrency: ${CONCURRENCY})...`)
  await resetStuckJobs()
  while (true) {
    loopIteration++
    await sendHeartbeat()
    // Periodically rescue jobs left in processing by a previous run or a timeout
    if (loopIteration % 12 === 0) await resetStuckJobs()

    const jobs = await claimPendingJobs(CONCURRENCY)
    if (jobs.length > 0) {
      await Promise.all(
        jobs.map((job) =>
          processJob(job).catch((err) => {
            console.error(`[worker] ${job.domain} unhandled error: ${err?.message ?? err}`)
          })
        )
      )
      await sleep(DOMAIN_DELAY_MS)
    } else {
      if (Date.now() - lastJobTerminatedAt > WATCHDOG_MS) {
        const sbWd = getSupabase()
        const { count } = await sbWd
          .from('lead_jobs')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'processing')
        if ((count ?? 0) > 0) {
          console.error('[worker] No job terminated in 30 min with active processing job — exiting for PM2 restart')
          process.exit(1)
        }
        lastJobTerminatedAt = Date.now()  // truly idle — reset so we don't query DB every poll
      }
      await sleep(POLL_INTERVAL_MS)
    }
  }
}

pollLoop().catch((err) => {
  console.error('[worker] Fatal:', err)
  process.exit(1)
})
