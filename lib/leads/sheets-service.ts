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

// Columns: date_found(A) vertical(B) query(C) domain(D) url(E) title(F) type(G)
export async function readLeadsSheet(
  spreadsheetId: string,
  tab: string
): Promise<SheetLead[]> {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A2:G`,
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
    }))
}

// Columns: domain(A) vertical(B) company_type(C) company_name(D) company_email(E)
//          company_linkedin(F) contact_name(G) contact_role(H) contact_linkedin(I)
//          new_lead(J) emailed(K) contacted(L)
export async function appendContactsToSheet(
  spreadsheetId: string,
  tab: string,
  contacts: SheetContact[]
): Promise<void> {
  if (contacts.length === 0) return
  const sheets = getSheetsClient()
  const values = contacts.map((c) => [
    c.domain,
    c.vertical ?? '',
    c.company_type ?? '',
    c.company_name ?? '',
    c.company_email ?? '',
    c.company_linkedin ?? '',
    c.contact_name ?? '',
    c.contact_role ?? '',
    c.contact_linkedin ?? '',
    'TRUE',
    'FALSE',
    'FALSE',
  ])
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values },
  })
}
