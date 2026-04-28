import { verifyWebhookSignature } from '@/lib/integrations/gmail'

jest.mock('googleapis', () => ({
  google: {
    gmail: jest.fn(),
    auth: {
      GoogleAuth: jest.fn(),
    },
  },
}))

describe('Gmail Integration Layer', () => {
  test('verifyWebhookSignature returns false when GMAIL_WEBHOOK_SECRET is not set', async () => {
    delete process.env.GMAIL_WEBHOOK_SECRET
    const result = await verifyWebhookSignature('sig', 'body')
    expect(result).toBe(false)
  })
})
