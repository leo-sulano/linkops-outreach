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

      return {
        id: String(index + 2), // Row 2 onwards (row 1 is header)
        domain: row[0] || '',
        email1: row[1] || '',
        name1: row[2] || '',
        niche: row[3] || '',
        standardPrice: parseValue(row[4]) || 0,
        gamblingPrice: parseValue(row[5]) || 0,
        priceFromBacklinker: parseValue(row[6]) || 0,
        currency: row[7] || 'EUR',
        status: (row[8] || 'pending') as any,
        acceptCasino: parseValue(row[9]) || false,
        acceptBetting: parseValue(row[10]) || false,
        sponsored: parseValue(row[11]) || false,
        linkTerm: row[12] || '',
        email2: row[13] || undefined,
        name2: row[14] || undefined,
        email3: row[15] || undefined,
        name3: row[16] || undefined,
        notes: row[17] || '',
        contentGuidelines: row[18] || '',
        emailAccount: row[1] || '',
        dateConfirmed: undefined,
        reply: 'pending' as const,
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
