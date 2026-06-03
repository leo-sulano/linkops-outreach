import { NextApiRequest, NextApiResponse } from 'next'
import { randomUUID } from 'crypto'
import { requireApiKey } from '@/lib/api-auth'
import { readLeadsSheet } from '@/lib/leads/sheets-service'
import {
  upsertLeads,
  getExistingContactDomains,
  insertPendingJobs,
} from '@/lib/leads/repository'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireApiKey(req, res)) return

  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID!
    const leadsTab = process.env.GOOGLE_LEADS_SHEET_TAB || 'Leads'

    const sheetLeads = await readLeadsSheet(spreadsheetId, leadsTab)
    const affiliates = sheetLeads.filter((l) => l.type === 'Affiliate')
    await upsertLeads(affiliates)

    // Skip domains already marked Done in the Leads sheet
    const uncollected = affiliates.filter(
      (l) => !l.data_collected || l.data_collected.trim().toLowerCase() !== 'done'
    )

    const existing = await getExistingContactDomains()
    const newDomains = uncollected
      .map((l) => l.domain)
      .filter((d) => !existing.has(d))

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
