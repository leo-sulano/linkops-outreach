import { google } from 'googleapis'

let sheetsClient: ReturnType<typeof google.sheets> | null = null

function getSheetsClient() {
  if (!sheetsClient) {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
    const privateKey = process.env.GOOGLE_PRIVATE_KEY
    if (!clientEmail || !privateKey) {
      throw new Error('Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY')
    }
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
    sheetsClient = google.sheets({ version: 'v4', auth })
  }
  return sheetsClient
}

export interface SheetLead {
  date_found: string | null
  vertical: string | null
  query: string | null
  domain: string
  url: string | null
  title: string | null
  type: string
  data_collected: string | null  // column H — "Done" means already scraped
}

export interface SheetContact {
  domain: string
  vertical: string | null
  company_type: string | null
  company_name: string | null
  company_email: string | null
  company_linkedin: string | null
  contact_name: string | null
  contact_role: string | null
  contact_linkedin: string | null
}

// Columns: date_found(A) vertical(B) query(C) domain(D) url(E) title(F) type(G) data_collected(H)
export async function readLeadsSheet(
  spreadsheetId: string,
  tab: string
): Promise<SheetLead[]> {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A2:H`,
  })
  const rows = res.data.values ?? []
  return rows
    .filter((row) => row.length > 0 && row[3])
    .map((row) => ({
      date_found: row[0] || null,
      vertical: row[1] || null,
      query: row[2] || null,
      domain: String(row[3])
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, ''),
      url: row[4] || null,
      title: row[5] || null,
      type: row[6] || 'Unknown',
      data_collected: row[7] || null,
    }))
}

// Write a value to column H (Data Collected) of the matching domain row.
// Pass "Done" when data was collected, or a short reason when it wasn't.
export async function markLeadDataCollected(
  spreadsheetId: string,
  tab: string,
  domain: string,
  value = 'Done'
): Promise<void> {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!D:D`,
  })
  const rows = res.data.values ?? []
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i]?.[0]) continue
    if (normalizeDomain(rows[i][0]) === domain) {
      const row = i + 1
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!H${row}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[value]] },
      })
      return
    }
  }
}

// Contacts sheet layout: domain(A) vertical(B) company_type(C) company_name(D) company_email(E) company_linkedin(F)
// Column A is formula-driven (=Leads!D[row]) — rows auto-exist, we update D:F only.
// Column F = contact (personal) LinkedIn if found, else company LinkedIn as fallback.

function normalizeDomain(raw: string): string {
  return String(raw).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
}

async function buildDomainRowMap(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  tab: string
): Promise<Map<string, number>> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A:A`,
  })
  const rows = res.data.values ?? []
  const map = new Map<string, number>()
  for (let i = 1; i < rows.length; i++) {
    const raw = rows[i]?.[0]
    if (!raw) continue
    map.set(normalizeDomain(raw), i + 1) // 1-indexed sheet row
  }
  return map
}

// Update a single contact's enrichment columns (D:F) by matching domain in column A.
// Returns true if the domain was found and updated.
export async function updateSingleContactInSheet(
  spreadsheetId: string,
  tab: string,
  contact: SheetContact
): Promise<boolean> {
  const sheets = getSheetsClient()
  const domainToRow = await buildDomainRowMap(sheets, spreadsheetId, tab)
  const row = domainToRow.get(contact.domain)
  if (!row) return false

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!D${row}:F${row}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        contact.company_name ?? '',
        contact.company_email ?? '',
        contact.contact_linkedin ?? contact.company_linkedin ?? '',
      ]],
    },
  })
  return true
}

// Clear the Data Collected column (H) for all rows so leads can be re-queued.
export async function clearDataCollectedColumn(
  spreadsheetId: string,
  tab: string
): Promise<void> {
  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${tab}!H2:H`,
  })
}

// Batch-update enrichment columns (D:F) for many contacts in one API call.
export async function updateContactsInSheet(
  spreadsheetId: string,
  tab: string,
  contacts: SheetContact[]
): Promise<{ updated: number; notFound: number }> {
  if (contacts.length === 0) return { updated: 0, notFound: 0 }
  const sheets = getSheetsClient()
  const domainToRow = await buildDomainRowMap(sheets, spreadsheetId, tab)

  const data: { range: string; values: string[][] }[] = []
  let notFound = 0

  for (const c of contacts) {
    const row = domainToRow.get(c.domain)
    if (!row) { notFound++; continue }
    data.push({
      range: `${tab}!D${row}:F${row}`,
      values: [[
        c.company_name ?? '',
        c.company_email ?? '',
        c.contact_linkedin ?? c.company_linkedin ?? '',
      ]],
    })
  }

  if (data.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data },
    })
  }

  return { updated: data.length, notFound }
}
