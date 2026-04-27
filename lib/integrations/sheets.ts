import { google } from 'googleapis'
import type { Contact } from '@/components/dashboard/types'

let sheetsClient: any = null

function getSheetsClient() {
  if (!sheetsClient) {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    let key = process.env.GOOGLE_PRIVATE_KEY

    if (!email || !key) {
      throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY')
    }

    // Handle escaped newlines in the private key
    if (key.includes('\\n')) {
      key = key.replace(/\\n/g, '\n')
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
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
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

export async function updateContactInSheet(
  sheetId: string,
  rowIndex: number,
  updates: Partial<Contact>,
  tabName: string = 'Sheet1'
): Promise<void> {
  try {
    const sheets = getSheetsClient()

    // Map Contact fields back to column positions
    const columnUpdates: { [key: number]: any } = {}

    // Only update fields that exist in the Sheet
    if (updates.status !== undefined) columnUpdates[9] = updates.status
    if (updates.standardPrice !== undefined) columnUpdates[12] = updates.standardPrice
    if (updates.gamblingPrice !== undefined) columnUpdates[13] = updates.gamblingPrice
    if (updates.negotiatedPrice !== undefined) columnUpdates[14] = updates.negotiatedPrice
    if (updates.notes !== undefined) columnUpdates[20] = updates.notes
    if (updates.dateConfirmed !== undefined) columnUpdates[19] = updates.dateConfirmed
    if (updates.reply !== undefined) columnUpdates[22] = updates.reply
    if (updates.acceptCasino !== undefined) columnUpdates[15] = updates.acceptCasino
    if (updates.acceptBetting !== undefined) columnUpdates[16] = updates.acceptBetting

    // Build the range and values for update
    const values: any[][] = []
    for (let i = 0; i <= 22; i++) {
      if (columnUpdates[i] !== undefined) {
        values.push([columnUpdates[i]])
      }
    }

    if (values.length === 0) return // Nothing to update

    // Update the row (rowIndex is 1-based, row 2 is index 1 in the sheet, etc)
    const range = `${tabName}!A${rowIndex + 1}:W${rowIndex + 1}`

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          undefined, // A: Domain (don't update)
          undefined, // B: Niche
          undefined, // C: Price from Backlinker
          undefined, // D: Email 1
          undefined, // E: Name
          undefined, // F: Email 2
          undefined, // G: Name
          undefined, // H: Email 3
          undefined, // I: Name
          columnUpdates[9], // J: Status
          undefined, // K: Email Account
          undefined, // L: Currency
          columnUpdates[12], // M: Standard Price
          columnUpdates[13], // N: Gambling Price
          columnUpdates[14], // O: Negotiated Price
          columnUpdates[15], // P: Accept Casino
          columnUpdates[16], // Q: Accept Betting
          undefined, // R: Sponsored
          undefined, // S: Link Term
          columnUpdates[19], // T: Date Confirmed
          columnUpdates[20], // U: Notes
          undefined, // V: Content Guidelines
          columnUpdates[22], // W: Reply
        ]],
      },
    })

    console.log(`✓ Updated row ${rowIndex + 1} in Sheet`)
  } catch (error: any) {
    console.error('Error updating contact in Sheet:', error)
    throw new Error(`Failed to update Sheet: ${error.message}`)
  }
}
