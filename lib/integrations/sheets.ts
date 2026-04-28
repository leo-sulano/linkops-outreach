import { google } from 'googleapis'
import type { Contact, PipelineStatus } from '@/components/dashboard/types'

// Column indices (0-based) for the new sheet structure:
// 0:Name  1:DR  2:Global Traffic  3:Top Country Traffic  4:TCT Traffic
// 5:Regional Traffic  6:Market  7:Major Niche  8:Micro Niche  9:Language
// 10:Email 1  11:Name 1  12:Email 2  13:Name 2  14:Email 3  15:Name 3
// 16:Campaign  17:Status  18:QA Failed Reason  19:Email Account
// 20:Original Currency  21:Original Standard Cost  22:Original Gambling Cost
// 23:Original Betting Cost  24:Original Standard Link Insertion Cost
// 25:Original Gambling Link Insertion Cost  26:Accept Casino  27:Accept Betting
// 28:Link Insert  29:Sponsored  30:Link Term  31:Date Confirmed
// 32:Notes  33:Content Guidelines  34:Standard Cost  35:Gambling Cost
// 36:Betting Cost  37:Standard Price  38:Gambling Price  39:Betting Price
// 40:Standard Link Insert Cost in euro  41:Gambling Link insert Cost in euro

const COL = {
  NAME: 0,
  DR: 1,
  GLOBAL_TRAFFIC: 2,
  TOP_COUNTRY: 3,
  MARKET: 6,
  MAJOR_NICHE: 7,
  MICRO_NICHE: 8,
  LANGUAGE: 9,
  EMAIL_1: 10,
  NAME_1: 11,
  QA_FAIL_REASON: 18,
  STATUS: 17,
  EMAIL_ACCOUNT: 19,
  ORIGINAL_CURRENCY: 20,
  ORIGINAL_COST: 21,
  ACCEPT_CASINO: 26,
  ACCEPT_BETTING: 27,
  LINK_INSERT: 28,
  SPONSORED: 29,
  LINK_TERM: 30,
  DATE_CONFIRMED: 31,
  NOTES: 32,
  CONTENT_GUIDELINES: 33,
  STANDARD_COST: 34,
} as const

let sheetsClient: any = null

function getSheetsClient() {
  if (!sheetsClient) {
    const path = require('path')
    const keyFilePath = path.join(process.cwd(), 'google-creds.json')

    const auth = new google.auth.GoogleAuth({
      keyFilename: keyFilePath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })

    sheetsClient = google.sheets({ version: 'v4', auth })
  }
  return sheetsClient
}

const mapStatus = (raw: string): PipelineStatus => {
  const status = raw?.toLowerCase().trim() || ''
  const statusMap: Record<string, PipelineStatus> = {
    'pending': 'start_outreach',
    'info collected': 'start_outreach',
    'qa fail': 'start_outreach',
    'qa failed': 'start_outreach',
    'sent 1st': 'outreach_sent',
    'sent 2nd': 'send_followup',
    'follow_up': 'send_followup',
    'follow up': 'send_followup',
    'confirmed': 'response_received',
    'responded': 'response_received',
    'negotiation': 'under_negotiation',
    'under negotiation': 'under_negotiation',
    'negotiated': 'negotiated',
    'approved': 'approved',
    'no_deal': 'start_outreach',
    'no deal': 'start_outreach',
    'payment sent': 'payment_sent',
    'live': 'live',
  }
  return statusMap[status] || 'start_outreach'
}

export async function fetchContactsFromSheet(sheetId: string, tabName: string = 'Sheet1'): Promise<Contact[]> {
  if (!sheetId) throw new Error('Sheet ID is required')

  try {
    const sheets = getSheetsClient()

    const metadata = await sheets.spreadsheets.get({ spreadsheetId: sheetId })
    const availableSheets = metadata.data.sheets || []
    const sheetNames = availableSheets.map((s: any) => s.properties.title)
    console.log('Available sheets:', sheetNames)

    let actualTabName = tabName
    if (!sheetNames.includes(tabName)) {
      console.log(`Sheet "${tabName}" not found. Available: ${sheetNames.join(', ')}`)
      if (sheetNames.length > 0) {
        actualTabName = sheetNames[0]
        console.log(`Using first sheet: "${actualTabName}"`)
      } else {
        throw new Error('No sheets found in spreadsheet')
      }
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${actualTabName}'!A:AP`,
    })

    const rows: any[][] = response.data.values || []
    if (rows.length === 0) return []

    const dataRows = rows.slice(1) // skip header row

    const contacts: Contact[] = dataRows
      .filter((row) => row[COL.NAME]?.trim())
      .map((row: any[], index: number) => {
        const str = (i: number) => row[i]?.toString().trim() || ''
        const num = (i: number) => {
          const v = row[i]
          if (!v || v === '') return undefined
          const n = Number(v)
          return isNaN(n) ? undefined : n
        }

        const parseBool = (i: number) => {
          const v = row[i]?.toString().trim().toUpperCase()
          if (v === 'TRUE') return true
          if (v === 'FALSE') return false
          return undefined
        }

        return {
          id: String(index + 2),
          domain: str(COL.NAME),
          website: '',
          dr: num(COL.DR),
          traffic: num(COL.GLOBAL_TRAFFIC),
          topCountry: str(COL.TOP_COUNTRY).toUpperCase() || undefined,
          market: str(COL.MARKET) || undefined,
          niche: str(COL.MAJOR_NICHE),
          microNiche: str(COL.MICRO_NICHE) || undefined,
          language: str(COL.LANGUAGE) || undefined,
          contact: str(COL.NAME_1),
          email: str(COL.EMAIL_1),
          status: mapStatus(str(COL.STATUS)),
          qaFailReason: str(COL.QA_FAIL_REASON) || undefined,
          price: num(COL.STANDARD_COST),
          originalCurrency: str(COL.ORIGINAL_CURRENCY) || undefined,
          originalCost: num(COL.ORIGINAL_COST),
          acceptCasino: parseBool(COL.ACCEPT_CASINO),
          acceptBetting: parseBool(COL.ACCEPT_BETTING),
          linkInsert: parseBool(COL.LINK_INSERT),
          sponsored: str(COL.SPONSORED).toLowerCase() === 'yes' ? true : str(COL.SPONSORED).toLowerCase() === 'no' ? false : undefined,
          tat: undefined,
          linkType: str(COL.LINK_TERM),
          publishDate: str(COL.DATE_CONFIRMED) || undefined,
          liveUrl: undefined,
          notes: str(COL.NOTES),
          contentGuideline: str(COL.CONTENT_GUIDELINES) || undefined,
          senderEmail: str(COL.EMAIL_ACCOUNT) || undefined,
          outreachDate: undefined,
          followupDate: undefined,
          responseDate: undefined,
          paymentStatus: undefined,
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

    // Build a sparse update: only send columns that changed
    const colUpdates: Record<number, any> = {}

    if (updates.niche !== undefined)            colUpdates[COL.MAJOR_NICHE] = updates.niche
    if (updates.email !== undefined)            colUpdates[COL.EMAIL_1] = updates.email
    if (updates.contact !== undefined)          colUpdates[COL.NAME_1] = updates.contact
    if (updates.status !== undefined)           colUpdates[COL.STATUS] = updates.status
    if (updates.linkType !== undefined)         colUpdates[COL.LINK_TERM] = updates.linkType
    if (updates.publishDate !== undefined)      colUpdates[COL.DATE_CONFIRMED] = updates.publishDate
    if (updates.notes !== undefined)            colUpdates[COL.NOTES] = updates.notes
    if (updates.contentGuideline !== undefined) colUpdates[COL.CONTENT_GUIDELINES] = updates.contentGuideline
    if (updates.price !== undefined)            colUpdates[COL.STANDARD_COST] = updates.price
    if (updates.senderEmail !== undefined)      colUpdates[COL.EMAIL_ACCOUNT] = updates.senderEmail

    if (Object.keys(colUpdates).length === 0) return

    // Build full row array (42 cols, A:AP), leaving unchanged cells as null
    const TOTAL_COLS = 42
    const rowValues: (any)[] = Array(TOTAL_COLS).fill(null)
    for (const [col, val] of Object.entries(colUpdates)) {
      rowValues[Number(col)] = val ?? ''
    }

    const range = `${tabName}!A${rowIndex + 1}:AP${rowIndex + 1}`

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [rowValues] },
    })

    console.log(`✓ Updated row ${rowIndex + 1} in Sheet`)
  } catch (error: any) {
    console.error('Error updating contact in Sheet:', error)
    throw new Error(`Failed to update Sheet: ${error.message}`)
  }
}
