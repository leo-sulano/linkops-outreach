import handler from '../../../pages/api/paul/send-campaign'
import type { NextApiRequest, NextApiResponse } from 'next'

jest.mock('../../../lib/integrations/sheets', () => ({
  fetchContactsFromSheet: jest.fn().mockResolvedValue([]),
  updateContactInSheet: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../../../lib/integrations/supabase', () => ({
  getSupabaseClient: jest.fn(),
}))
jest.mock('../../../lib/senders/send', () => ({
  sendOutreachWithSender: jest.fn(),
}))
jest.mock('../../../lib/mocks/paulResponses', () => ({
  getMockSubject: jest.fn(() => 'Subject'),
  getMockBody: jest.fn(() => 'Body'),
}))
jest.mock('../../../lib/crypto', () => ({
  decryptCredential: jest.fn((c) => c),
}))
jest.mock('../../../lib/senders/rotate', () => ({
  getLocalDate: jest.fn(() => '2026-05-05'),
}))
jest.mock('../../../lib/api-auth', () => ({
  requireApiKey: jest.fn(() => true),
}))

function makeReqRes(body: object, method = 'POST') {
  const req = { method, body, headers: {} } as unknown as NextApiRequest
  const json = jest.fn()
  const status = jest.fn().mockReturnValue({ json })
  const res = { status, json } as unknown as NextApiResponse
  return { req, res, json, status }
}

describe('POST /api/paul/send-campaign', () => {
  beforeEach(() => {
    process.env.GOOGLE_SHEET_ID = 'sheet-123'
    jest.clearAllMocks()
  })

  it('returns 405 for non-POST methods', async () => {
    const { req, res, status, json } = makeReqRes({}, 'GET')
    await handler(req, res)
    expect(status).toHaveBeenCalledWith(405)
    expect(json).toHaveBeenCalledWith({ error: 'Method not allowed' })
  })

  it('returns 400 when senderIds is missing', async () => {
    const { req, res, status, json } = makeReqRes({ emailsPerSender: 10 })
    await handler(req, res)
    expect(status).toHaveBeenCalledWith(400)
  })

  it('returns 400 when emailsPerSender is missing', async () => {
    const { req, res, status, json } = makeReqRes({ senderIds: 'all' })
    await handler(req, res)
    expect(status).toHaveBeenCalledWith(400)
  })

  it('returns 400 when emailsPerSender is less than 1', async () => {
    const { req, res, status, json } = makeReqRes({ senderIds: 'all', emailsPerSender: 0 })
    await handler(req, res)
    expect(status).toHaveBeenCalledWith(400)
  })

  it('returns 200 with sent:0 when no start_outreach contacts exist', async () => {
    const { fetchContactsFromSheet } = require('../../../lib/integrations/sheets')
    fetchContactsFromSheet.mockResolvedValue([])

    const { getSupabaseClient } = require('../../../lib/integrations/supabase')
    const builder: any = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ data: [], error: null }) }
    getSupabaseClient.mockReturnValue({ from: jest.fn().mockReturnValue(builder) })

    const { req, res, status, json } = makeReqRes({ senderIds: 'all', emailsPerSender: 10 })
    await handler(req, res)
    expect(status).toHaveBeenCalledWith(200)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ sent: 0 }))
  })

  it('calls supabase insert with campaignName when contacts exist and emails send', async () => {
    const { fetchContactsFromSheet, updateContactInSheet } = require('../../../lib/integrations/sheets')
    fetchContactsFromSheet.mockResolvedValue([
      { id: '1', email: 'a@x.com', status: 'start_outreach', domain: 'x.com', niche: 'tech', contact: 'Alice' },
    ])
    updateContactInSheet.mockResolvedValue(undefined)

    const { sendOutreachWithSender } = require('../../../lib/senders/send')
    sendOutreachWithSender.mockResolvedValue(undefined)

    const insertMock = jest.fn().mockResolvedValue({ error: null })
    const statBuilder: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { sent_count: 0 }, error: null }),
    }
    const fromMock = jest.fn((table: string) => {
      if (table === 'campaigns') return { insert: insertMock }
      if (table === 'sender_daily_stats') return statBuilder
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [{ id: 's1', email: 'sender@x.com', status: 'active', daily_limit: 50, timezone: 'UTC', credential_json: '{}' }],
          error: null,
        }),
        in: jest.fn().mockResolvedValue({
          data: [{ id: 's1', email: 'sender@x.com', status: 'active', daily_limit: 50, timezone: 'UTC', credential_json: '{}' }],
          error: null,
        }),
      }
    })
    const { getSupabaseClient } = require('../../../lib/integrations/supabase')
    getSupabaseClient.mockReturnValue({ from: fromMock })

    const { req, res, json } = makeReqRes({ senderIds: 'all', emailsPerSender: 10, campaignName: 'May Batch 1' })
    await handler(req, res)

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'May Batch 1', sent: expect.any(Number), total: expect.any(Number) })
    )
  })

  it('calls supabase insert with null name when campaignName is omitted', async () => {
    const { fetchContactsFromSheet, updateContactInSheet } = require('../../../lib/integrations/sheets')
    fetchContactsFromSheet.mockResolvedValue([
      { id: '2', email: 'b@x.com', status: 'start_outreach', domain: 'x.com', niche: 'tech', contact: 'Bob' },
    ])
    updateContactInSheet.mockResolvedValue(undefined)

    const { sendOutreachWithSender } = require('../../../lib/senders/send')
    sendOutreachWithSender.mockResolvedValue(undefined)

    const insertMock = jest.fn().mockResolvedValue({ error: null })
    const statBuilder: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { sent_count: 0 }, error: null }),
    }
    const fromMock = jest.fn((table: string) => {
      if (table === 'campaigns') return { insert: insertMock }
      if (table === 'sender_daily_stats') return statBuilder
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [{ id: 's2', email: 'sender2@x.com', status: 'active', daily_limit: 50, timezone: 'UTC', credential_json: '{}' }],
          error: null,
        }),
        in: jest.fn().mockResolvedValue({
          data: [{ id: 's2', email: 'sender2@x.com', status: 'active', daily_limit: 50, timezone: 'UTC', credential_json: '{}' }],
          error: null,
        }),
      }
    })
    const { getSupabaseClient } = require('../../../lib/integrations/supabase')
    getSupabaseClient.mockReturnValue({ from: fromMock })

    const { req, res } = makeReqRes({ senderIds: 'all', emailsPerSender: 10 })
    await handler(req, res)

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: null })
    )
  })

  it('calls supabase insert with null name when campaignName is whitespace only', async () => {
    const { fetchContactsFromSheet, updateContactInSheet } = require('../../../lib/integrations/sheets')
    fetchContactsFromSheet.mockResolvedValue([
      { id: '3', email: 'c@x.com', status: 'start_outreach', domain: 'x.com', niche: 'tech', contact: 'Carol' },
    ])
    updateContactInSheet.mockResolvedValue(undefined)

    const { sendOutreachWithSender } = require('../../../lib/senders/send')
    sendOutreachWithSender.mockResolvedValue(undefined)

    const insertMock = jest.fn().mockResolvedValue({ error: null })
    const statBuilder: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { sent_count: 0 }, error: null }),
    }
    const fromMock = jest.fn((table: string) => {
      if (table === 'campaigns') return { insert: insertMock }
      if (table === 'sender_daily_stats') return statBuilder
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [{ id: 's3', email: 'sender3@x.com', status: 'active', daily_limit: 50, timezone: 'UTC', credential_json: '{}' }],
          error: null,
        }),
        in: jest.fn().mockResolvedValue({
          data: [{ id: 's3', email: 'sender3@x.com', status: 'active', daily_limit: 50, timezone: 'UTC', credential_json: '{}' }],
          error: null,
        }),
      }
    })
    const { getSupabaseClient } = require('../../../lib/integrations/supabase')
    getSupabaseClient.mockReturnValue({ from: fromMock })

    const { req, res } = makeReqRes({ senderIds: 'all', emailsPerSender: 10, campaignName: '   ' })
    await handler(req, res)

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: null })
    )
  })
})
