import { NextApiRequest, NextApiResponse } from 'next'
import { randomUUID } from 'crypto'
import { requireApiKey } from '@/lib/api-auth'
import { readLeadsSheet } from '@/lib/leads/sheets-service'
import {
  upsertLeads,
  getAlreadyQueuedDomains,
  removeStalePendingJobs,
  insertPendingJobs,
} from '@/lib/leads/repository'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireApiKey(req, res)) return

  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID!
    const leadsTab = process.env.GOOGLE_LEADS_SHEET_TAB || 'Leads'

    const sheetLeads = await readLeadsSheet(spreadsheetId, leadsTab)

    // Explicitly exclude Operator, Skip, Unknown — only Affiliate is processed
    const EXCLUDED_TYPES = ['Operator', 'Skip', 'Unknown']
    const affiliates = sheetLeads.filter(
      (l) => l.type === 'Affiliate' && !EXCLUDED_TYPES.includes(l.type)
    )

    // Strip data_collected — that column lives in Google Sheets only, not in Supabase
    await upsertLeads(affiliates.map(({ data_collected: _, ...rest }) => rest))

    // Skip any row that already has a value in the Data Collected column
    const uncollected = affiliates.filter((l) => !l.data_collected?.trim())

    const qualifiedDomains = uncollected.map((l) => l.domain)

    // Remove pending/paused jobs that no longer qualify (type changed or data_collected filled)
    await removeStalePendingJobs(qualifiedDomains)

    const alreadyQueued = await getAlreadyQueuedDomains()
    const newDomains = qualifiedDomains.filter((d) => !alreadyQueued.has(d))

    if (newDomains.length === 0) {
      return res.status(200).json({
        runId: null,
        queued: 0,
        message: 'No new affiliate domains to process',
      })
    }

    const runId = randomUUID()
    await insertPendingJobs(runId, newDomains)

    return res.status(200).json({ runId, queued: newDomains.length })
  } catch (err: any) {
    console.error('[leads/process]', err)
    return res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}
