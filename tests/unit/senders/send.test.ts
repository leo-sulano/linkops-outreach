import { sendOutreachWithSender } from '../../../lib/senders/send'
import type { Contact } from '../../../components/dashboard/types'
import type { SenderWithCount } from '../../../lib/senders/rotate'

jest.mock('../../../lib/integrations/supabase', () => ({
  getSupabaseClient: jest.fn(),
}))
jest.mock('../../../lib/senders/gmail', () => ({
  buildGmailClient: jest.fn(),
  sendWithClient: jest.fn(),
}))
jest.mock('../../../lib/integrations/sheets', () => ({
  updateContactInSheet: jest.fn(),
}))
jest.mock('../../../lib/senders/rotate', () => ({
  getLocalDate: jest.fn(() => '2026-05-05'),
}))

const { getSupabaseClient } = require('../../../lib/integrations/supabase')
const { buildGmailClient, sendWithClient } = require('../../../lib/senders/gmail')
const { updateContactInSheet } = require('../../../lib/integrations/sheets')

const mockSender: SenderWithCount = {
  id: 'sender-1',
  name: 'Test Sender',
  email: 'sender@example.com',
  credential_type: 'service_account',
  credential_json: { client_email: 'sa@p.iam.gserviceaccount.com', private_key: 'key' } as any,
  daily_limit: 50,
  timezone: 'UTC',
  status: 'active',
  last_error: null,
  last_used_at: null,
  created_at: '2026-01-01',
  sent_today: 5,
}

const mockContact: Contact = {
  id: '2',
  domain: 'example.com',
  website: 'https://example.com',
  niche: 'tech',
  contact: 'John',
  email: 'john@example.com',
  status: 'start_outreach',
  linkType: 'guest_post',
  notes: '',
}

function makeMockSupabase() {
  const builder: any = {}
  builder.insert = jest.fn().mockResolvedValue({ error: null })
  builder.update = jest.fn().mockReturnValue(builder)
  builder.eq = jest.fn().mockResolvedValue({ error: null })
  const client = {
    from: jest.fn().mockReturnValue(builder),
    rpc: jest.fn().mockResolvedValue({ error: null }),
  }
  return { client, builder }
}

describe('sendOutreachWithSender', () => {
  beforeEach(() => {
    process.env.GOOGLE_SHEET_ID = 'sheet-123'
    buildGmailClient.mockReturnValue({})
    sendWithClient.mockResolvedValue('msg-id-123')
    updateContactInSheet.mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('sends email using the provided sender and returns sender_email + message_id', async () => {
    const { client } = makeMockSupabase()
    getSupabaseClient.mockReturnValue(client)

    const result = await sendOutreachWithSender(mockSender, mockContact, 'Subject', 'Body')

    expect(result.sender_email).toBe('sender@example.com')
    expect(result.message_id).toBe('msg-id-123')
    expect(buildGmailClient).toHaveBeenCalledWith(mockSender)
    expect(sendWithClient).toHaveBeenCalledWith(
      {},
      'john@example.com',
      'Subject',
      'Body',
      'sender@example.com'
    )
  })

  it('logs failure and rethrows when send fails', async () => {
    const { client, builder } = makeMockSupabase()
    getSupabaseClient.mockReturnValue(client)
    sendWithClient.mockRejectedValue(new Error('Gmail auth failed'))

    await expect(
      sendOutreachWithSender(mockSender, mockContact, 'Subject', 'Body')
    ).rejects.toThrow('Gmail auth failed')

    expect(builder.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ status: 'failed', error: 'Gmail auth failed' }),
      ])
    )
  })
})
