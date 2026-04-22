// lib/integrations/errors.ts

export class IntegrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

export class SupabaseConnectionError extends IntegrationError {
  statusCode = 503
}

export class NotFoundError extends IntegrationError {
  statusCode = 404
}

export class ValidationError extends IntegrationError {
  statusCode = 400
  field?: string

  constructor(message: string, field?: string) {
    super(message)
    this.field = field
  }
}

export class AuthError extends IntegrationError {
  statusCode = 401
}

export class SendError extends IntegrationError {
  statusCode = 400
  originalError?: Error

  constructor(message: string, originalError?: Error) {
    super(message)
    this.originalError = originalError
  }
}

export class SecurityError extends IntegrationError {
  statusCode = 401
}

export class RateLimitError extends IntegrationError {
  statusCode = 429
  retryAfterSeconds: number

  constructor(message: string, retryAfterSeconds: number = 60) {
    super(message)
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export class TimeoutError extends IntegrationError {
  statusCode = 504
}

export class DuplicateError extends IntegrationError {
  statusCode = 409
}

export class QuotaError extends IntegrationError {
  statusCode = 429
}
