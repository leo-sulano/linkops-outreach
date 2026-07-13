import { randomUUID } from 'crypto'
import { getSupabaseAdminClient } from '@/lib/integrations/supabase'

export interface Lead {
  id: string
  date_found: string | null
  vertical: string | null
  query: string | null
  domain: string
  url: string | null
  title: string | null
  type: string
  created_at: string
}

export interface LeadContact {
  id: string
  domain: string
  vertical: string | null
  company_type: string | null
  company_name: string | null
  company_email: string | null
  company_linkedin: string | null
  contact_name: string | null
  contact_role: string | null
  contact_linkedin: string | null
  new_lead: boolean
  emailed: boolean
  contacted: boolean
  created_at: string
  updated_at: string
}

export interface LeadJob {
  id: string
  run_id: string
  domain: string
  status: 'pending' | 'processing' | 'completed' | 'needs_review' | 'failed' | 'paused'
  retry_count: number
  error_log: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface LeadStats {
  totalLeads: number
  totalContacts: number
  newLeads: number
  affiliates: number
  needsReview: number
  outreachReady: number
}

export async function upsertLeads(leads: Omit<Lead, 'id' | 'created_at'>[]): Promise<void> {
  const sb = getSupabaseAdminClient()
  const { error } = await sb.from('leads').upsert(leads, { onConflict: 'domain' })
  if (error) throw new Error(`upsertLeads: ${error.message}`)
}

export async function getExistingContactDomains(): Promise<Set<string>> {
  const sb = getSupabaseAdminClient()
  const { data, error } = await sb.from('lead_contacts').select('domain')
  if (error) throw new Error(`getExistingContactDomains: ${error.message}`)
  return new Set((data ?? []).map((r) => r.domain))
}

export async function deleteContactsForDomains(domains: string[]): Promise<void> {
  if (domains.length === 0) return
  const sb = getSupabaseAdminClient()
  const { error } = await sb.from('lead_contacts').delete().in('domain', domains)
  if (error) throw new Error(`deleteContactsForDomains: ${error.message}`)
}

// Returns domains that already have an active job (pending, processing, or paused — don't re-queue these)
export async function getAlreadyQueuedDomains(): Promise<Set<string>> {
  const sb = getSupabaseAdminClient()
  const { data, error } = await sb
    .from('lead_jobs')
    .select('domain')
    .in('status', ['pending', 'processing', 'paused'])
  if (error) throw new Error(`getAlreadyQueuedDomains: ${error.message}`)
  return new Set((data ?? []).map((r) => r.domain))
}

// Scraping is considered paused/stopped when paused jobs exist and nothing is actively running
export async function isScrapingPaused(): Promise<boolean> {
  const sb = getSupabaseAdminClient()
  const [{ count: paused }, { count: pending }, { count: processing }] = await Promise.all([
    sb.from('lead_jobs').select('*', { count: 'exact', head: true }).eq('status', 'paused'),
    sb.from('lead_jobs').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    sb.from('lead_jobs').select('*', { count: 'exact', head: true }).eq('status', 'processing'),
  ])
  return (paused ?? 0) > 0 && (pending ?? 0) === 0 && (processing ?? 0) === 0
}

// Remove pending/paused jobs whose domain is no longer in the qualified set
export async function removeStalePendingJobs(qualifiedDomains: string[]): Promise<number> {
  const sb = getSupabaseAdminClient()
  const { data: pending, error: fetchErr } = await sb
    .from('lead_jobs')
    .select('domain')
    .in('status', ['pending', 'paused'])
  if (fetchErr) throw new Error(`removeStalePendingJobs fetch: ${fetchErr.message}`)

  const qualifiedSet = new Set(qualifiedDomains)
  const stale = (pending ?? []).map((r) => r.domain).filter((d) => !qualifiedSet.has(d))
  if (stale.length === 0) return 0

  const { error: delErr } = await sb
    .from('lead_jobs')
    .delete()
    .in('domain', stale)
    .in('status', ['pending', 'paused'])
  if (delErr) throw new Error(`removeStalePendingJobs delete: ${delErr.message}`)
  return stale.length
}

export async function insertPendingJobs(
  runId: string,
  domains: string[],
  status: 'pending' | 'paused' = 'pending'
): Promise<void> {
  const sb = getSupabaseAdminClient()
  const rows = domains.map((domain) => ({ run_id: runId, domain, status, retry_count: 0 }))
  const { error } = await sb.from('lead_jobs').insert(rows)
  if (error) throw new Error(`insertPendingJobs: ${error.message}`)
}

export async function upsertContact(
  contact: Omit<LeadContact, 'id' | 'created_at' | 'updated_at'>
): Promise<void> {
  const sb = getSupabaseAdminClient()
  const { error } = await sb.from('lead_contacts').upsert(contact, { onConflict: 'domain' })
  if (error) throw new Error(`upsertContact: ${error.message}`)
}

export async function getJobsByRunId(runId: string): Promise<LeadJob[]> {
  const sb = getSupabaseAdminClient()
  const { data, error } = await sb
    .from('lead_jobs')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`getJobsByRunId: ${error.message}`)
  return (data ?? []) as LeadJob[]
}

export async function getContacts(params: {
  search?: string
  vertical?: string
  page?: number
  perPage?: number
}): Promise<{ contacts: LeadContact[]; total: number }> {
  const sb = getSupabaseAdminClient()
  const { search, vertical, page = 1, perPage = 50 } = params
  const from = (page - 1) * perPage
  const to = from + perPage - 1

  let query = sb.from('lead_contacts').select('*', { count: 'exact' })
  if (search) {
    query = query.or(
      `domain.ilike.%${search}%,company_name.ilike.%${search}%,company_email.ilike.%${search}%,contact_name.ilike.%${search}%`
    )
  }
  if (vertical) query = query.eq('vertical', vertical)

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw new Error(`getContacts: ${error.message}`)
  return { contacts: (data ?? []) as LeadContact[], total: count ?? 0 }
}

export async function getOutreachReady(): Promise<LeadContact[]> {
  const sb = getSupabaseAdminClient()
  const { data, error } = await sb
    .from('lead_contacts')
    .select('*')
    .not('company_name', 'is', null)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`getOutreachReady: ${error.message}`)
  return (data ?? []) as LeadContact[]
}

export async function getLeadStats(): Promise<LeadStats> {
  const sb = getSupabaseAdminClient()
  const [
    { count: totalLeads, error: e1 },
    { count: totalContacts, error: e2 },
    { count: newLeads, error: e3 },
    { count: affiliates, error: e4 },
    { count: needsReview, error: e5 },
    { count: outreachReady, error: e6 },
  ] = await Promise.all([
    sb.from('leads').select('*', { count: 'exact', head: true }),
    sb.from('lead_contacts').select('*', { count: 'exact', head: true }),
    sb.from('lead_contacts').select('*', { count: 'exact', head: true }).eq('new_lead', true),
    sb.from('leads').select('*', { count: 'exact', head: true }).eq('type', 'Affiliate'),
    sb.from('lead_jobs').select('*', { count: 'exact', head: true }).eq('status', 'needs_review'),
    sb
      .from('lead_contacts')
      .select('*', { count: 'exact', head: true })
      .not('company_name', 'is', null),
  ])
  const firstError = e1 ?? e2 ?? e3 ?? e4 ?? e5 ?? e6
  if (firstError) throw new Error(`getLeadStats: ${firstError.message}`)
  return {
    totalLeads: totalLeads ?? 0,
    totalContacts: totalContacts ?? 0,
    newLeads: newLeads ?? 0,
    affiliates: affiliates ?? 0,
    needsReview: needsReview ?? 0,
    outreachReady: outreachReady ?? 0,
  }
}

export async function getNewLeads(): Promise<
  { domain: string; vertical: string | null; status: string }[]
> {
  const sb = getSupabaseAdminClient()
  const { data: affiliates } = await sb
    .from('leads')
    .select('domain, vertical')
    .eq('type', 'Affiliate')
  if (!affiliates) return []

  const existing = await getExistingContactDomains()
  const newDomains = affiliates.filter((a) => !existing.has(a.domain))
  if (newDomains.length === 0) return []

  const { data: jobs } = await sb
    .from('lead_jobs')
    .select('domain, status')
    .in(
      'domain',
      newDomains.map((d) => d.domain)
    )

  const jobMap = new Map((jobs ?? []).map((j) => [j.domain, j.status]))

  return newDomains.map((a) => ({
    domain: a.domain,
    vertical: a.vertical,
    status: jobMap.get(a.domain) ?? 'unprocessed',
  }))
}

const RESUMABLE_STATUSES = new Set(['paused', 'failed', 'needs_review'])

// Resumes already-queued (paused/failed/needs_review) domains and queues brand-new
// ones as pending. Domains already pending/processing are left untouched.
export async function startSelectedDomains(
  domains: string[]
): Promise<{ resumed: number; queued: number }> {
  const sb = getSupabaseAdminClient()

  const { data: existingJobs, error: fetchErr } = await sb
    .from('lead_jobs')
    .select('domain, status')
    .in('domain', domains)
  if (fetchErr) throw new Error(`startSelectedDomains fetch: ${fetchErr.message}`)

  const jobStatusMap = new Map((existingJobs ?? []).map((j: any) => [j.domain, j.status]))

  const toResume = domains.filter((d) => RESUMABLE_STATUSES.has(jobStatusMap.get(d) ?? ''))
  const toQueue = domains.filter((d) => !jobStatusMap.has(d))

  if (toResume.length > 0) {
    const { error: resumeErr } = await sb
      .from('lead_jobs')
      .update({ status: 'pending', started_at: null })
      .in('domain', toResume)
    if (resumeErr) throw new Error(`startSelectedDomains resume: ${resumeErr.message}`)
  }

  if (toQueue.length > 0) {
    await insertPendingJobs(randomUUID(), toQueue, 'pending')
  }

  return { resumed: toResume.length, queued: toQueue.length }
}
