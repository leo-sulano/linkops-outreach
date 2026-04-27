import { google } from 'googleapis'
import type { Contact } from '@/components/dashboard/types'

let sheetsClient: any = null

function getSheetsClient() {
  if (!sheetsClient) {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const key = process.env.GOOGLE_PRIVATE_KEY

    if (!email || !key) {
      throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY')
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        type: 'service_account',
        project_id: process.env.GOOGLE_CLOUD_PROJECT || '',
        private_key_id: '',
        private_key: key,
        client_email: email,
        client_id: '',
      } as any,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })

    sheetsClient = google.sheets({ version: 'v4', auth })
  }
  return sheetsClient
}

export async function fetchContactsFromSheet(sheetId: string, tabName: string = 'Sheet1'): Promise<Contact[]> {
  if (!sheetId) {
    throw new Error('Sheet ID is required')
  }

  try {
    const sheets = getSheetsClient()

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A:S`,
    })

    const rows = response.data.values || []

    if (rows.length === 0) {
      return []
    }

    const headers = rows[0]
    const dataRows = rows.slice(1)

    const contacts: Contact[] = dataRows.map((row: any[], index: number) => {
      const parseValue = (val: any): any => {
        if (!val || val === '') return undefined
        if (val === 'TRUE') return true
        if (val === 'FALSE') return false
        if (!isNaN(val) && val !== '') return Number(val)
        return val
      }

      // Map columns to your exact Sheet structure
      // 0: Domain, 1: Niche, 2: Price from Backlinker - In Euro, 3: Email 1, 4: Name,
      // 5: Email 2, 6: Name, 7: Email 3, 8: Name, 9: Status, 10: Email Account, 11: Currency,
      // 12: Standard Price, 13: Gambling Price, 14: Negotiated Price (Gambling),
      // 15: Accept Casino, 16: Accept Betting, 17: Sponsored, 18: Link Term, 19: Date Confirmed,
      // 20: Notes, 21: Content Guidelines, 22: Reply

      return {
        id: String(index + 2), // Row 2 onwards (row 1 is header)
        domain: row[0]?.trim() || '',
        niche: row[1]?.trim() || '',
        priceFromBacklinker: parseValue(row[2]) || 0,
        email1: row[3]?.trim() || '',
        name1: row[4]?.trim() || '',
        email2: row[5]?.trim() || undefined,
        name2: row[6]?.trim() || undefined,
        email3: row[7]?.trim() || undefined,
        name3: row[8]?.trim() || undefined,
        status: (row[9]?.toLowerCase() || 'pending') as any,
        emailAccount: row[10]?.trim() || '',
        currency: row[11]?.trim() || 'EUR',
        standardPrice: parseValue(row[12]) || 0,
        gamblingPrice: parseValue(row[13]) || 0,
        negotiatedPrice: parseValue(row[14]) || undefined,
        acceptCasino: parseValue(row[15]) || false,
        acceptBetting: parseValue(row[16]) || false,
        sponsored: parseValue(row[17]) || false,
        linkTerm: row[18]?.trim() || '',
        dateConfirmed: row[19]?.trim() || undefined,
        notes: row[20]?.trim() || '',
        contentGuidelines: row[21]?.trim() || '',
        reply: (row[22]?.toLowerCase() || 'pending') as any,
        qualificationScore: undefined,
        qualificationCategory: undefined,
      }
    })

    return contacts
  } catch (error: any) {
    console.error('Error fetching contacts from Google Sheet:', error)
    throw new Error(`Failed to fetch from Sheet: ${error.message}`)
  }
}
