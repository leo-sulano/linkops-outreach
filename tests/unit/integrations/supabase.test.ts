import { getContact, saveContact, createMessage } from '@/lib/integrations/supabase'
import { ValidationError } from '@/lib/integrations/errors'

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        })),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
    })),
  })),
}))

describe('Supabase Integration Layer - Input Validation', () => {
  test('getContact throws ValidationError for empty domain', async () => {
    await expect(getContact('')).rejects.toThrow(ValidationError)
  })

  test('saveContact throws ValidationError for missing domain', async () => {
    await expect(saveContact({ niche: 'tech' } as any)).rejects.toThrow(ValidationError)
  })

  test('createMessage throws ValidationError for missing contact_id', async () => {
    await expect(
      createMessage({
        direction: 'outbound',
        from_email: 'test@example.com',
        to_email: 'other@example.com',
        subject: 'Test',
        body: 'Body',
      } as any)
    ).rejects.toThrow(ValidationError)
  })

  test('createMessage throws ValidationError for missing to_email', async () => {
    await expect(
      createMessage({
        contact_id: '123',
        direction: 'outbound',
        from_email: 'test@example.com',
        subject: 'Test',
        body: 'Body',
      } as any)
    ).rejects.toThrow(ValidationError)
  })
})
