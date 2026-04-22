// tests/unit/integrations/errors.test.ts
import {
  SupabaseConnectionError,
  NotFoundError,
  ValidationError,
  AuthError,
  SendError,
  SecurityError,
  RateLimitError,
  TimeoutError,
} from '@/lib/integrations/errors'

describe('Integration Errors', () => {
  test('SupabaseConnectionError has correct name and message', () => {
    const error = new SupabaseConnectionError('Connection lost')
    expect(error.name).toBe('SupabaseConnectionError')
    expect(error.message).toBe('Connection lost')
    expect(error).toBeInstanceOf(Error)
  })

  test('NotFoundError has correct name', () => {
    const error = new NotFoundError('Contact not found')
    expect(error.name).toBe('NotFoundError')
    expect(error.message).toBe('Contact not found')
  })

  test('ValidationError includes field info', () => {
    const error = new ValidationError('Invalid email', 'email')
    expect(error.name).toBe('ValidationError')
    expect(error.field).toBe('email')
  })

  test('AuthError marks as authentication failure', () => {
    const error = new AuthError('Invalid API key')
    expect(error.name).toBe('AuthError')
    expect(error.statusCode).toBe(401)
  })

  test('RateLimitError includes retry info', () => {
    const error = new RateLimitError('Too many requests', 60)
    expect(error.retryAfterSeconds).toBe(60)
    expect(error.statusCode).toBe(429)
  })
})
