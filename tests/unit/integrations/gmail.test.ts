import { sendEmail, verifyWebhookSignature } from '@/lib/integrations/gmail'
import { ValidationError } from '@/lib/integrations/errors'

jest.mock('googleapis', () => ({
  google: {
    gmail: jest.fn(),
    auth: {
      GoogleAuth: jest.fn(),
    },
  },
}))

describe('Gmail Integration Layer - Validation', () => {
  test('sendEmail throws ValidationError for empty recipient', async () => {
    await expect(sendEmail('', 'Subject', 'Body')).rejects.toThrow(ValidationError)
  })

  test('sendEmail throws ValidationError for empty subject', async () => {
    await expect(sendEmail('test@example.com', '', 'Body')).rejects.toThrow(ValidationError)
  })

  test('verifyWebhookSignature returns false for empty secret', async () => {
    delete process.env.GMAIL_WEBHOOK_SECRET
    const result = await verifyWebhookSignature('sig', 'body')
    expect(result).toBe(false)
  })
})
