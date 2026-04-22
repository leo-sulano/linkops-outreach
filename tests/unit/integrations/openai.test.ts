import { generateEmailBody, generateEmailSubject } from '@/lib/integrations/openai'
import { ValidationError } from '@/lib/integrations/errors'

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(),
}))

jest.mock('@/lib/mocks/paulResponses', () => ({
  getMockBody: jest.fn(() => 'Mock email body'),
}))

describe('OpenAI Integration Layer - Validation', () => {
  test('generateEmailBody throws ValidationError for empty domain', async () => {
    await expect(
      generateEmailBody({
        domain: '',
        niche: 'tech',
        contactName: 'John',
        relationshipTier: 'new',
        priceRange: '500-1000',
      })
    ).rejects.toThrow(ValidationError)
  })

  test('generateEmailBody throws ValidationError for empty niche', async () => {
    await expect(
      generateEmailBody({
        domain: 'example.com',
        niche: '',
        contactName: 'John',
        relationshipTier: 'new',
        priceRange: '500-1000',
      })
    ).rejects.toThrow(ValidationError)
  })

  test('generateEmailBody returns fallback when OpenAI fails', async () => {
    const result = await generateEmailBody({
      domain: 'example.com',
      niche: 'tech',
      contactName: 'John',
      relationshipTier: 'new',
      priceRange: '500-1000',
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  test('generateEmailSubject returns fallback when OpenAI fails', async () => {
    const result = await generateEmailSubject({
      domain: 'example.com',
      niche: 'tech',
      contactName: 'John',
      relationshipTier: 'new',
    })
    expect(result).toContain('example.com')
  })
})
