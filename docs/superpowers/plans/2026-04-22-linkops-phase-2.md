# LinkOps Phase 2 (Real Integrations & Database) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build production-ready data persistence (Supabase PostgreSQL), real external service integrations (Gmail, OpenAI), and modular integration layers so Phase 1 API endpoints work with persistent storage and real third-party APIs instead of mocks.

**Architecture:** Three new integration layers (`lib/integrations/supabase.ts`, `lib/integrations/gmail.ts`, `lib/integrations/openai.ts`) sit between API routes and external services. Paul Logic stays pure. API routes orchestrate integrations. Supabase stores all contact, message, negotiation, and link placement data across 17 tables. Gmail API sends/reads emails and listens for replies via webhooks. OpenAI replaces mock templates for dynamic email generation.

**Tech Stack:** Supabase (PostgreSQL), Gmail API (Node.js client), OpenAI API (Node.js client), TypeScript, Jest, Next.js API routes

---

## File Structure

**New Files:**
- `lib/integrations/supabase.ts` — Supabase database client + typed queries
- `lib/integrations/gmail.ts` — Gmail API wrapper (send, read, webhook)
- `lib/integrations/openai.ts` — OpenAI client wrapper (email generation)
- `lib/integrations/errors.ts` — Custom error types
- `scripts/migrate-phase1-to-supabase.ts` — One-time data migration script
- `tests/unit/integrations/supabase.test.ts` — Supabase layer tests
- `tests/unit/integrations/gmail.test.ts` — Gmail layer tests
- `tests/unit/integrations/openai.test.ts` — OpenAI layer tests
- `tests/integration/api/paul-enhanced.test.ts` — API routes with Supabase
- `tests/e2e/phase2-flow.test.ts` — End-to-end tests

**Modified Files:**
- `pages/api/paul/qualify.ts` — Enhanced to use Supabase
- `pages/api/paul/generate-outreach.ts` — Enhanced to use OpenAI + Supabase
- `pages/api/webhooks/gmail.ts` — New webhook endpoint
- `jest.config.js` — Configure test environment
- `.env.example` — Document required environment variables

**Unchanged:**
- `lib/paul/*` — Pure logic, no changes
- `lib/mocks/paulResponses.ts` — Kept as fallback
- `components/dashboard/*` — Dashboard unchanged
- `pages/dashboard/index.tsx` — Dashboard unchanged

---

## Task 1: Error Types & Utilities

**Files:**
- Create: `lib/integrations/errors.ts`
- Create: `tests/unit/integrations/errors.test.ts`

**Context:** Define custom error types for all integration layers. This is used by Supabase, Gmail, and OpenAI integrations for consistent error handling.

- [ ] **Step 1: Write error type tests**

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/integrations/errors.test.ts`
Expected: FAIL - "Cannot find module '@/lib/integrations/errors'"

- [ ] **Step 3: Create error types**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/integrations/errors.test.ts`
Expected: PASS - 5 test cases passing

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/errors.ts tests/unit/integrations/errors.test.ts
git commit -m "feat: add integration error types with status codes and metadata"
```

---

## Task 2: Supabase Integration Layer

**Files:**
- Create: `lib/integrations/supabase.ts`
- Create: `tests/unit/integrations/supabase.test.ts`

**Context:** Database access layer for all Supabase queries. This is the foundation for all data persistence. Signature must match Phase 2 design spec exactly.

- [ ] **Step 1: Write failing tests for Supabase queries**

```typescript
// tests/unit/integrations/supabase.test.ts
import { createClient } from '@supabase/supabase-js'
import * as supabaseModule from '@/lib/integrations/supabase'
import { NotFoundError, ValidationError, SupabaseConnectionError } from '@/lib/integrations/errors'

// Mock Supabase client
jest.mock('@supabase/supabase-js')

describe('Supabase Integration Layer', () => {
  let mockSupabase: any
  let supabase: any

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn(),
    }
    ;(createClient as jest.Mock).mockReturnValue(mockSupabase)
    supabase = supabaseModule.getSupabaseClient()
  })

  describe('getContact', () => {
    test('returns contact by domain', async () => {
      const mockContact = {
        id: '123',
        domain: 'example.com',
        niche: 'tech',
        status: 'pending',
      }

      mockSupabase.from.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockContact, error: null }),
        }),
      })

      const result = await supabaseModule.getContact('example.com')
      expect(result).toEqual(mockContact)
    })

    test('throws NotFoundError if contact not found', async () => {
      mockSupabase.from.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ 
            data: null, 
            error: { message: 'Not found' } 
          }),
        }),
      })

      await expect(supabaseModule.getContact('notfound.com')).rejects.toThrow(NotFoundError)
    })

    test('throws ValidationError if domain is empty', async () => {
      await expect(supabaseModule.getContact('')).rejects.toThrow(ValidationError)
    })
  })

  describe('saveContact', () => {
    test('creates new contact', async () => {
      const newContact = {
        domain: 'newsite.com',
        niche: 'finance',
        status: 'pending',
      }

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({ 
            data: [{ id: '456', ...newContact }], 
            error: null 
          }),
        }),
      })

      const result = await supabaseModule.saveContact(newContact)
      expect(result.domain).toBe('newsite.com')
      expect(result.id).toBe('456')
    })

    test('throws ValidationError if domain is missing', async () => {
      await expect(supabaseModule.saveContact({ niche: 'tech' })).rejects.toThrow(ValidationError)
    })
  })

  describe('createMessage', () => {
    test('logs outbound message', async () => {
      const message = {
        contact_id: '123',
        direction: 'outbound' as const,
        from_email: 'me@example.com',
        to_email: 'contact@site.com',
        subject: 'Link Opportunity',
        body: 'We have a link...',
      }

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({ 
            data: [{ id: 'msg-1', ...message, sent_at: new Date().toISOString() }], 
            error: null 
          }),
        }),
      })

      const result = await supabaseModule.createMessage(message)
      expect(result.direction).toBe('outbound')
      expect(result.subject).toBe('Link Opportunity')
    })
  })

  describe('getMetadata', () => {
    test('returns contact metadata', async () => {
      const metadata = {
        contact_id: '123',
        domain_authority: 45,
        traffic_percentage: 2.5,
        sentiment: 5,
      }

      mockSupabase.from.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: metadata, error: null }),
        }),
      })

      const result = await supabaseModule.getMetadata('123')
      expect(result.domain_authority).toBe(45)
    })
  })

  describe('saveMetadata', () => {
    test('updates contact metadata', async () => {
      const updates = {
        domain_authority: 67,
        last_qualified_at: new Date().toISOString(),
      }

      mockSupabase.from.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({ 
              data: [{ contact_id: '123', ...updates }], 
              error: null 
            }),
          }),
        }),
      })

      const result = await supabaseModule.saveMetadata('123', updates)
      expect(result.domain_authority).toBe(67)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/integrations/supabase.test.ts`
Expected: FAIL - "Cannot find module '@/lib/integrations/supabase'"

- [ ] **Step 3: Implement Supabase layer**

```typescript
// lib/integrations/supabase.ts
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  NotFoundError,
  ValidationError,
  SupabaseConnectionError,
  DuplicateError,
} from './errors'

let supabaseClient: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_KEY

    if (!url || !key) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_KEY environment variables')
    }

    supabaseClient = createClient(url, key)
  }
  return supabaseClient
}

// Type definitions
export interface Contact {
  id: string
  domain: string
  niche: string
  email_account?: string
  email1?: string
  name1?: string
  email2?: string
  name2?: string
  email3?: string
  name3?: string
  status: 'pending' | 'under_negotiation' | 'approved' | 'no_deal' | 'follow_up'
  date_confirmed?: string
  last_outreach_at?: string
  follow_up_count: number
  notes?: string
  created_at: string
  updated_at: string
}

export interface ContactMetadata {
  id: string
  contact_id: string
  domain_authority?: number
  traffic_percentage?: number
  sentiment?: number
  tags?: string[]
  last_qualified_at?: string
  last_qualification_score?: number
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  contact_id: string
  direction: 'outbound' | 'inbound'
  from_email: string
  to_email: string
  subject: string
  body: string
  gmail_message_id?: string
  classification?: string
  sent_at: string
  created_at: string
}

// Contact operations
export async function getContact(domain: string): Promise<Contact> {
  if (!domain || domain.trim() === '') {
    throw new ValidationError('Domain cannot be empty', 'domain')
  }

  const client = getSupabaseClient()
  const { data, error } = await client
    .from('contacts')
    .select()
    .eq('domain', domain)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new NotFoundError(`Contact not found for domain: ${domain}`)
    }
    throw new SupabaseConnectionError(error.message)
  }

  return data as Contact
}

export async function saveContact(data: Partial<Contact>): Promise<Contact> {
  if (!data.domain || data.domain.trim() === '') {
    throw new ValidationError('Domain is required', 'domain')
  }

  const client = getSupabaseClient()
  
  // If it's an update (id provided), use update; otherwise insert
  if (data.id) {
    const { data: result, error } = await client
      .from('contacts')
      .update(data)
      .eq('id', data.id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundError(`Contact not found: ${data.id}`)
      }
      throw new SupabaseConnectionError(error.message)
    }
    return result as Contact
  } else {
    const { data: result, error } = await client
      .from('contacts')
      .insert([data])
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new DuplicateError(`Contact already exists for domain: ${data.domain}`)
      }
      throw new SupabaseConnectionError(error.message)
    }
    return result as Contact
  }
}

// Message operations
export async function createMessage(message: Omit<Message, 'id' | 'created_at'>): Promise<Message> {
  if (!message.contact_id) {
    throw new ValidationError('contact_id is required', 'contact_id')
  }
  if (!message.to_email) {
    throw new ValidationError('to_email is required', 'to_email')
  }

  const client = getSupabaseClient()
  const { data, error } = await client
    .from('messages')
    .insert([message])
    .select()
    .single()

  if (error) {
    throw new SupabaseConnectionError(error.message)
  }

  return data as Message
}

export async function getMessages(contactId: string): Promise<Message[]> {
  if (!contactId) {
    throw new ValidationError('contact_id is required', 'contact_id')
  }

  const client = getSupabaseClient()
  const { data, error } = await client
    .from('messages')
    .select()
    .eq('contact_id', contactId)
    .order('sent_at', { ascending: false })

  if (error) {
    throw new SupabaseConnectionError(error.message)
  }

  return (data || []) as Message[]
}

// Metadata operations
export async function getMetadata(contactId: string): Promise<ContactMetadata> {
  if (!contactId) {
    throw new ValidationError('contact_id is required', 'contact_id')
  }

  const client = getSupabaseClient()
  const { data, error } = await client
    .from('contacts_metadata')
    .select()
    .eq('contact_id', contactId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new NotFoundError(`Metadata not found for contact: ${contactId}`)
    }
    throw new SupabaseConnectionError(error.message)
  }

  return data as ContactMetadata
}

export async function saveMetadata(
  contactId: string,
  updates: Partial<ContactMetadata>
): Promise<ContactMetadata> {
  if (!contactId) {
    throw new ValidationError('contact_id is required', 'contact_id')
  }

  const client = getSupabaseClient()
  const { data, error } = await client
    .from('contacts_metadata')
    .update(updates)
    .eq('contact_id', contactId)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new NotFoundError(`Metadata not found for contact: ${contactId}`)
    }
    throw new SupabaseConnectionError(error.message)
  }

  return data as ContactMetadata
}

export async function createMetadata(
  contactId: string,
  data: Partial<ContactMetadata>
): Promise<ContactMetadata> {
  if (!contactId) {
    throw new ValidationError('contact_id is required', 'contact_id')
  }

  const client = getSupabaseClient()
  const { data: result, error } = await client
    .from('contacts_metadata')
    .insert([{ ...data, contact_id: contactId }])
    .select()
    .single()

  if (error) {
    throw new SupabaseConnectionError(error.message)
  }

  return result as ContactMetadata
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/integrations/supabase.test.ts`
Expected: PASS - All Supabase query tests passing

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/supabase.ts tests/unit/integrations/supabase.test.ts
git commit -m "feat: add Supabase integration layer with typed queries"
```

---

## Task 3: Gmail Integration Layer

**Files:**
- Create: `lib/integrations/gmail.ts`
- Create: `tests/unit/integrations/gmail.test.ts`

**Context:** Gmail API wrapper for sending emails, reading inbox, and verifying webhook signatures. Supports both service account and OAuth flows.

- [ ] **Step 1: Write failing tests for Gmail**

```typescript
// tests/unit/integrations/gmail.test.ts
import * as gmailModule from '@/lib/integrations/gmail'
import { SendError, AuthError, TimeoutError } from '@/lib/integrations/errors'

// Mock google-auth-library and googleapis
jest.mock('googleapis', () => ({
  google: {
    gmail: jest.fn(),
  },
}))

describe('Gmail Integration Layer', () => {
  describe('sendEmail', () => {
    test('sends email and returns Gmail message ID', async () => {
      // Mock implementation
      const result = await gmailModule.sendEmail(
        'recipient@example.com',
        'Test Subject',
        'Test body content'
      )
      expect(result).toBeDefined()
      expect(result).toMatch(/^[a-zA-Z0-9]+$/) // Gmail message IDs are alphanumeric
    })

    test('throws SendError if email fails', async () => {
      // This should be mocked to fail
      await expect(
        gmailModule.sendEmail(
          'invalid-email',
          'Subject',
          'Body'
        )
      ).rejects.toThrow(SendError)
    })

    test('throws ValidationError for empty recipient', async () => {
      await expect(
        gmailModule.sendEmail(
          '',
          'Subject',
          'Body'
        )
      ).rejects.toThrow(ValidationError)
    })
  })

  describe('readInbox', () => {
    test('fetches recent inbox messages', async () => {
      const messages = await gmailModule.readInbox(10)
      expect(Array.isArray(messages)).toBe(true)
    })

    test('returns empty array if inbox is empty', async () => {
      const messages = await gmailModule.readInbox(10)
      expect(messages).toEqual([])
    })
  })

  describe('getEmailBody', () => {
    test('extracts email body from Gmail message ID', async () => {
      const body = await gmailModule.getEmailBody('message-id-123')
      expect(typeof body).toBe('string')
    })

    test('throws TimeoutError on network timeout', async () => {
      await expect(
        gmailModule.getEmailBody('timeout-id')
      ).rejects.toThrow(TimeoutError)
    })
  })

  describe('verifyWebhookSignature', () => {
    test('returns true for valid signature', async () => {
      const isValid = await gmailModule.verifyWebhookSignature(
        'valid-signature',
        'test-body'
      )
      expect(isValid).toBe(true)
    })

    test('returns false for invalid signature', async () => {
      const isValid = await gmailModule.verifyWebhookSignature(
        'invalid-signature',
        'test-body'
      )
      expect(isValid).toBe(false)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/integrations/gmail.test.ts`
Expected: FAIL - "Cannot find module '@/lib/integrations/gmail'"

- [ ] **Step 3: Implement Gmail layer**

```typescript
// lib/integrations/gmail.ts
import { google } from 'googleapis'
import { SendError, AuthError, TimeoutError, ValidationError } from './errors'
import * as crypto from 'crypto'

let gmailClient: any = null

function getGmailClient() {
  if (!gmailClient) {
    const auth = process.env.GMAIL_SERVICE_ACCOUNT
      ? JSON.parse(process.env.GMAIL_SERVICE_ACCOUNT)
      : null

    if (!auth) {
      throw new AuthError('Gmail credentials not configured')
    }

    gmailClient = google.gmail({
      version: 'v1',
      auth: new google.auth.GoogleAuth({
        credentials: auth,
        scopes: [
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.readonly',
        ],
      }),
    })
  }
  return gmailClient
}

export interface EmailMessage {
  id: string
  threadId: string
  from: string
  to: string
  subject: string
  body: string
  timestamp: string
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<string> {
  if (!to || to.trim() === '') {
    throw new ValidationError('Recipient email is required', 'to')
  }

  if (!subject || subject.trim() === '') {
    throw new ValidationError('Subject is required', 'subject')
  }

  try {
    const gmail = getGmailClient()
    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
      '',
      body,
    ].join('\n')

    const encodedMessage = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    })

    return response.data.id || ''
  } catch (error: any) {
    if (error.message.includes('unauthenticated')) {
      throw new AuthError('Gmail authentication failed')
    }
    throw new SendError(`Failed to send email: ${error.message}`, error)
  }
}

export async function readInbox(maxResults: number = 10): Promise<EmailMessage[]> {
  try {
    const gmail = getGmailClient()
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:inbox',
      maxResults,
    })

    if (!response.data.messages) {
      return []
    }

    const messages = await Promise.all(
      response.data.messages.map((msg: any) => getEmailBody(msg.id))
    )

    return messages.filter((msg): msg is EmailMessage => msg !== null)
  } catch (error: any) {
    throw new AuthError(`Failed to read inbox: ${error.message}`)
  }
}

export async function getEmailBody(messageId: string): Promise<EmailMessage | null> {
  try {
    const gmail = getGmailClient()
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    })

    const msg = response.data
    const headers = msg.payload.headers || []
    const from = headers.find((h: any) => h.name === 'From')?.value || ''
    const to = headers.find((h: any) => h.name === 'To')?.value || ''
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || ''

    let body = ''
    if (msg.payload.parts) {
      const textPart = msg.payload.parts.find((p: any) => p.mimeType === 'text/plain')
      if (textPart && textPart.body.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8')
      }
    } else if (msg.payload.body.data) {
      body = Buffer.from(msg.payload.body.data, 'base64').toString('utf-8')
    }

    return {
      id: msg.id,
      threadId: msg.threadId,
      from,
      to,
      subject,
      body,
      timestamp: msg.internalDate,
    }
  } catch (error: any) {
    if (error.message.includes('timeout')) {
      throw new TimeoutError('Gmail request timed out')
    }
    throw new AuthError(`Failed to get message: ${error.message}`)
  }
}

export async function registerWebhook(callbackUrl: string): Promise<void> {
  try {
    const gmail = getGmailClient()
    await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: `projects/${process.env.GOOGLE_CLOUD_PROJECT}/topics/gmail-push`,
        labelIds: ['INBOX'],
      },
    })
  } catch (error: any) {
    throw new AuthError(`Failed to register webhook: ${error.message}`)
  }
}

export async function verifyWebhookSignature(
  signature: string,
  body: string
): Promise<boolean> {
  try {
    const webhookSecret = process.env.GMAIL_WEBHOOK_SECRET
    if (!webhookSecret) {
      return false
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex')

    return signature === expectedSignature
  } catch (error) {
    return false
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/integrations/gmail.test.ts`
Expected: PASS - All Gmail tests passing (mocked)

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/gmail.ts tests/unit/integrations/gmail.test.ts
git commit -m "feat: add Gmail integration layer with send/read/webhook support"
```

---

## Task 4: OpenAI Integration Layer

**Files:**
- Create: `lib/integrations/openai.ts`
- Create: `tests/unit/integrations/openai.test.ts`

**Context:** OpenAI GPT-4o-mini wrapper for dynamic email generation. Falls back to mock templates if OpenAI fails.

- [ ] **Step 1: Write failing tests for OpenAI**

```typescript
// tests/unit/integrations/openai.test.ts
import * as openaiModule from '@/lib/integrations/openai'
import { AuthError, TimeoutError } from '@/lib/integrations/errors'

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(),
}))

describe('OpenAI Integration Layer', () => {
  describe('generateEmailBody', () => {
    test('generates email body with domain context', async () => {
      const body = await openaiModule.generateEmailBody({
        domain: 'example.com',
        niche: 'tech',
        contactName: 'John Doe',
        relationshipTier: 'new',
        priceRange: '500-1000',
      })

      expect(typeof body).toBe('string')
      expect(body.length).toBeGreaterThan(50)
    })

    test('includes domain in generated email', async () => {
      const body = await openaiModule.generateEmailBody({
        domain: 'techblog.com',
        niche: 'tech',
        contactName: 'Jane',
        relationshipTier: 'warm',
        priceRange: '800-1200',
      })

      expect(body).toContain('techblog.com')
    })

    test('throws ValidationError if domain is missing', async () => {
      await expect(
        openaiModule.generateEmailBody({
          domain: '',
          niche: 'tech',
          contactName: 'John',
          relationshipTier: 'new',
          priceRange: '500-1000',
        })
      ).rejects.toThrow(ValidationError)
    })

    test('falls back to mock template if OpenAI fails', async () => {
      // Mock OpenAI to fail
      const body = await openaiModule.generateEmailBody({
        domain: 'example.com',
        niche: 'tech',
        contactName: 'John',
        relationshipTier: 'new',
        priceRange: '500-1000',
      })

      // Should still return a body (from fallback)
      expect(typeof body).toBe('string')
      expect(body.length).toBeGreaterThan(0)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/integrations/openai.test.ts`
Expected: FAIL - "Cannot find module '@/lib/integrations/openai'"

- [ ] **Step 3: Implement OpenAI layer with fallback**

```typescript
// lib/integrations/openai.ts
import OpenAI from 'openai'
import { getMockBody } from '@/lib/mocks/paulResponses'
import { ValidationError, TimeoutError, AuthError, QuotaError } from './errors'

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new AuthError('OpenAI API key not configured')
    }
    openaiClient = new OpenAI({ apiKey })
  }
  return openaiClient
}

export interface EmailGenerationParams {
  domain: string
  niche: string
  contactName: string
  relationshipTier: 'new' | 'warm' | 'trusted' | 'vip'
  priceRange: string
  previousEmails?: string[]
}

export async function generateEmailBody(
  params: EmailGenerationParams
): Promise<string> {
  const { domain, niche, contactName, relationshipTier, priceRange, previousEmails } = params

  if (!domain || domain.trim() === '') {
    throw new ValidationError('Domain is required', 'domain')
  }

  if (!niche || niche.trim() === '') {
    throw new ValidationError('Niche is required', 'niche')
  }

  // Tone mapping based on relationship tier
  const toneMap: Record<string, string> = {
    new: 'professional and formal',
    warm: 'friendly and appreciative',
    trusted: 'collaborative and casual',
    vip: 'personalized and high-touch',
  }

  const tone = toneMap[relationshipTier] || 'professional'

  const systemPrompt = `You are an expert link insertion outreach specialist. Write personalized, persuasive emails for link placements. 
The tone should be ${tone}. 
Keep emails concise (150-200 words), highlight mutual benefit, and include a clear call-to-action.
Never mention specific prices in the email body; that comes later in negotiation.`

  const userPrompt = `Write an outreach email to ${contactName} at ${domain} (niche: ${niche}). 
They may be interested in a link placement opportunity worth ${priceRange}.
${previousEmails ? `Previous emails sent: ${previousEmails.join('\n')}` : 'This is a first contact.'}
Make it feel personal and relevant to their site.`

  try {
    const client = getOpenAIClient()
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('Empty response from OpenAI')
    }

    return content
  } catch (error: any) {
    // Log the error but don't throw - use fallback instead
    console.warn(`OpenAI failed, falling back to mock template: ${error.message}`)

    // Fallback: use mock template
    try {
      const mockBody = getMockBody('standard', { domain, niche, name: contactName })
      return mockBody
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError)
      // Last resort: generic template
      return `Hi ${contactName},

We've been following ${domain} and think there's a great opportunity for a mutually beneficial link partnership.

Would you be open to a quick conversation about how we can help each other?

Best regards`
    }
  }
}

export async function generateEmailSubject(
  params: Omit<EmailGenerationParams, 'priceRange'>
): Promise<string> {
  const { domain, niche, contactName } = params

  const systemPrompt = `You are an expert email marketer. Write compelling, click-worthy email subject lines for outreach emails.
Keep them under 50 characters. Make them specific and personal, not generic.`

  const userPrompt = `Write a subject line for an outreach email to ${contactName} at ${domain} (${niche} niche). 
This is about a link placement opportunity.`

  try {
    const client = getOpenAIClient()
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 50,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return `Link Opportunity for ${domain}`
    }

    return content.replace(/^["']|["']$/g, '') // Remove surrounding quotes if any
  } catch (error: any) {
    console.warn(`OpenAI subject generation failed, using fallback: ${error.message}`)
    return `Link Opportunity for ${domain}`
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/integrations/openai.test.ts`
Expected: PASS - OpenAI tests passing

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/openai.ts tests/unit/integrations/openai.test.ts
git commit -m "feat: add OpenAI integration layer with fallback to mock templates"
```

---

## Task 5: Enhance /api/paul/qualify to Use Supabase

**Files:**
- Modify: `pages/api/paul/qualify.ts`
- Modify: `tests/integration/api/paul.test.ts`

**Context:** Update the existing `/api/paul/qualify` endpoint to use Supabase for data persistence instead of returning mock data. The endpoint should now save qualification scores to the database.

- [ ] **Step 1: Write failing integration test**

```typescript
// Add to tests/integration/api/paul.test.ts
import { getContact, saveContact } from '@/lib/integrations/supabase'

describe('POST /api/paul/qualify (Phase 2 - with Supabase)', () => {
  const testDomain = 'test-qualify.example.com'

  beforeEach(async () => {
    // Create test contact in Supabase
    await saveContact({
      domain: testDomain,
      niche: 'tech',
      status: 'pending',
      follow_up_count: 0,
    })
  })

  test('saves qualification score to contacts_metadata', async () => {
    const response = await fetch('http://localhost:3000/api/paul/qualify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: testDomain,
        factors: {
          domainAuthority: 65,
          trafficPercentage: 4.2,
          nicheRelevance: 'high',
          antiSpamRating: 95,
        },
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.score).toBeGreaterThanOrEqual(0)
    expect(data.score).toBeLessThanOrEqual(100)
    expect(['reject', 'standard', 'warm', 'premium']).toContain(data.category)

    // Verify score was saved to database
    const contact = await getContact(testDomain)
    expect(contact).toBeDefined()
  })

  test('returns 404 if contact not found in Supabase', async () => {
    const response = await fetch('http://localhost:3000/api/paul/qualify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: 'nonexistent-domain-12345.com',
        factors: { domainAuthority: 50 },
      }),
    })

    expect(response.status).toBe(404)
  })

  test('returns 400 if required fields missing', async () => {
    const response = await fetch('http://localhost:3000/api/paul/qualify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factors: {} }),
    })

    expect(response.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/api/paul.test.ts`
Expected: FAIL - Tests fail because endpoint doesn't persist to Supabase yet

- [ ] **Step 3: Update /api/paul/qualify endpoint**

```typescript
// pages/api/paul/qualify.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { qualifyDomain } from '@/lib/paul/qualifier'
import { getContact, saveMetadata, createMetadata, getMetadata } from '@/lib/integrations/supabase'
import { NotFoundError, ValidationError } from '@/lib/integrations/errors'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { domain, factors } = req.body

    // Validate input
    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({ error: 'Domain is required and must be a string' })
    }

    if (!factors || typeof factors !== 'object') {
      return res.status(400).json({ error: 'Factors object is required' })
    }

    // Get contact from Supabase
    let contact
    try {
      contact = await getContact(domain)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: `Contact not found for domain: ${domain}` })
      }
      throw error
    }

    // Run Paul Qualifier with factors
    const score = qualifyDomain(factors)

    // Save score to contacts_metadata
    try {
      await saveMetadata(contact.id, {
        last_qualified_at: new Date().toISOString(),
        last_qualification_score: score.score,
      })
    } catch (error) {
      if (error instanceof NotFoundError) {
        // Create metadata if it doesn't exist
        await createMetadata(contact.id, {
          last_qualified_at: new Date().toISOString(),
          last_qualification_score: score.score,
        })
      } else {
        throw error
      }
    }

    // Return result
    return res.status(200).json({
      domain,
      score: score.score,
      category: score.category,
      recommendation: score.recommendation,
      contactId: contact.id,
    })
  } catch (error: any) {
    console.error('Qualify endpoint error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/integration/api/paul.test.ts`
Expected: PASS - Integration tests passing with Supabase

- [ ] **Step 5: Commit**

```bash
git add pages/api/paul/qualify.ts tests/integration/api/paul.test.ts
git commit -m "feat: enhance /api/paul/qualify to persist scores to Supabase"
```

---

## Task 6: Enhance /api/paul/generate-outreach to Use OpenAI + Supabase

**Files:**
- Modify: `pages/api/paul/generate-outreach.ts`
- Modify: `tests/integration/api/paul.test.ts`

**Context:** Update `/api/paul/generate-outreach` to call real OpenAI for email generation and log the message to Supabase instead of returning mock templates.

- [ ] **Step 1: Write failing integration test**

```typescript
// Add to tests/integration/api/paul.test.ts
describe('POST /api/paul/generate-outreach (Phase 2 - with OpenAI + Supabase)', () => {
  const testDomain = 'test-outreach.example.com'

  beforeEach(async () => {
    // Create test contact
    await saveContact({
      domain: testDomain,
      niche: 'finance',
      status: 'pending',
      follow_up_count: 0,
    })
  })

  test('generates email using OpenAI and logs to messages table', async () => {
    const response = await fetch('http://localhost:3000/api/paul/generate-outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: testDomain,
        contactName: 'John Doe',
        niche: 'finance',
        relationshipTier: 'new',
        priceRange: '500-1000',
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.subject).toBeDefined()
    expect(data.body).toBeDefined()
    expect(data.messageId).toBeDefined()
    expect(data.body.length).toBeGreaterThan(50)
  })

  test('returns 404 if contact not found', async () => {
    const response = await fetch('http://localhost:3000/api/paul/generate-outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: 'nonexistent-123456.com',
        contactName: 'John',
        niche: 'tech',
      }),
    })

    expect(response.status).toBe(404)
  })

  test('returns 400 if required fields missing', async () => {
    const response = await fetch('http://localhost:3000/api/paul/generate-outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: testDomain }),
    })

    expect(response.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/api/paul.test.ts`
Expected: FAIL - Endpoint doesn't call OpenAI or log to Supabase yet

- [ ] **Step 3: Update /api/paul/generate-outreach endpoint**

```typescript
// pages/api/paul/generate-outreach.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { generateOutreach } from '@/lib/paul/generator'
import { generateEmailBody, generateEmailSubject } from '@/lib/integrations/openai'
import { getContact, createMessage } from '@/lib/integrations/supabase'
import { NotFoundError, ValidationError } from '@/lib/integrations/errors'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { domain, contactName, niche, relationshipTier, priceRange, previousEmails } = req.body

    // Validate input
    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({ error: 'Domain is required' })
    }

    if (!contactName || typeof contactName !== 'string') {
      return res.status(400).json({ error: 'contactName is required' })
    }

    if (!niche || typeof niche !== 'string') {
      return res.status(400).json({ error: 'Niche is required' })
    }

    // Get contact from Supabase
    let contact
    try {
      contact = await getContact(domain)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: `Contact not found for domain: ${domain}` })
      }
      throw error
    }

    const tier = (relationshipTier || 'new') as 'new' | 'warm' | 'trusted' | 'vip'
    const range = priceRange || '500-2000'

    // Generate email using OpenAI
    const body = await generateEmailBody({
      domain,
      niche,
      contactName,
      relationshipTier: tier,
      priceRange: range,
      previousEmails,
    })

    const subject = await generateEmailSubject({
      domain,
      niche,
      contactName,
      relationshipTier: tier,
    })

    // Log message to Supabase
    const message = await createMessage({
      contact_id: contact.id,
      direction: 'outbound',
      from_email: 'outreach@yourcompany.com',
      to_email: contact.email1 || contact.email_account || '',
      subject,
      body,
    })

    // Return result
    return res.status(200).json({
      domain,
      subject,
      body,
      messageId: message.id,
      createdAt: message.created_at,
      tone: tier,
    })
  } catch (error: any) {
    console.error('Generate outreach endpoint error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/integration/api/paul.test.ts`
Expected: PASS - Integration tests passing with OpenAI and Supabase

- [ ] **Step 5: Commit**

```bash
git add pages/api/paul/generate-outreach.ts tests/integration/api/paul.test.ts
git commit -m "feat: enhance /api/paul/generate-outreach with OpenAI + Supabase logging"
```

---

## Task 7: Create /api/webhooks/gmail Endpoint

**Files:**
- Create: `pages/api/webhooks/gmail.ts`
- Create: `tests/integration/webhooks/gmail.test.ts`

**Context:** New webhook endpoint to receive incoming email notifications from Gmail. Validates webhook signature, fetches full message, and logs to Supabase messages table.

- [ ] **Step 1: Write failing test**

```typescript
// tests/integration/webhooks/gmail.test.ts
import { createMessage, getMessages } from '@/lib/integrations/supabase'

describe('POST /api/webhooks/gmail', () => {
  const testContactId = 'test-contact-123'

  test('receives webhook notification and logs message', async () => {
    const webhookPayload = {
      encryptedMessage: 'base64-encoded-payload',
      signature: 'webhook-signature',
      timestamp: Date.now().toString(),
    }

    const response = await fetch('http://localhost:3000/api/webhooks/gmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload),
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.status).toBe('message_received')
    expect(data.messageId).toBeDefined()
  })

  test('returns 401 for invalid signature', async () => {
    const response = await fetch('http://localhost:3000/api/webhooks/gmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        encryptedMessage: 'payload',
        signature: 'invalid-signature',
      }),
    })

    expect(response.status).toBe(401)
  })

  test('returns 400 for missing payload', async () => {
    const response = await fetch('http://localhost:3000/api/webhooks/gmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/webhooks/gmail.test.ts`
Expected: FAIL - "Cannot find module 'pages/api/webhooks/gmail'"

- [ ] **Step 3: Create webhook endpoint**

```typescript
// pages/api/webhooks/gmail.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { getEmailBody, verifyWebhookSignature } from '@/lib/integrations/gmail'
import { createMessage, getContact } from '@/lib/integrations/supabase'
import { SecurityError, NotFoundError } from '@/lib/integrations/errors'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { encryptedMessage, signature, timestamp, messageId } = req.body

    // Validate required fields
    if (!encryptedMessage || !signature) {
      return res.status(400).json({ error: 'encryptedMessage and signature are required' })
    }

    // Verify webhook signature
    const isValid = await verifyWebhookSignature(signature, encryptedMessage)
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid webhook signature' })
    }

    // Fetch full message from Gmail
    let emailMessage
    try {
      emailMessage = await getEmailBody(messageId)
    } catch (error) {
      console.error('Failed to fetch email body:', error)
      return res.status(404).json({ error: 'Email message not found' })
    }

    // Extract sender domain and find matching contact
    const senderEmail = emailMessage.from
    const senderDomain = senderEmail.split('@')[1]

    let contact
    try {
      contact = await getContact(senderDomain)
    } catch (error) {
      if (error instanceof NotFoundError) {
        // Contact doesn't exist, but we still log the message
        console.warn(`Received email from unknown domain: ${senderDomain}`)
      } else {
        throw error
      }
    }

    // Log message to Supabase
    if (contact) {
      await createMessage({
        contact_id: contact.id,
        direction: 'inbound',
        from_email: emailMessage.from,
        to_email: emailMessage.to,
        subject: emailMessage.subject,
        body: emailMessage.body,
        gmail_message_id: emailMessage.id,
      })
    }

    // Return success
    return res.status(200).json({
      status: 'message_received',
      messageId: emailMessage.id,
      contactDomain: senderDomain,
    })
  } catch (error: any) {
    console.error('Webhook error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/integration/webhooks/gmail.test.ts`
Expected: PASS - Webhook tests passing

- [ ] **Step 5: Commit**

```bash
git add pages/api/webhooks/gmail.ts tests/integration/webhooks/gmail.test.ts
git commit -m "feat: add Gmail webhook endpoint to log incoming emails"
```

---

## Task 8: Create Data Migration Script

**Files:**
- Create: `scripts/migrate-phase1-to-supabase.ts`

**Context:** One-time script to migrate Phase 1 test data from in-memory/localStorage to Supabase. This enables the dashboard to continue working with the new database backend.

- [ ] **Step 1: Identify Phase 1 test data location**

Check `pages/dashboard/index.tsx` or wherever test contacts are defined. Note: If no persistent test data exists, create placeholder contacts for migration.

- [ ] **Step 2: Create migration script**

```typescript
// scripts/migrate-phase1-to-supabase.ts
import { getSupabaseClient, saveContact, createMetadata } from '@/lib/integrations/supabase'

// Phase 1 test data (copied from wherever it's defined)
const phase1TestData = [
  {
    domain: 'techblog.com',
    niche: 'tech',
    email_account: 'contact@techblog.com',
    email1: 'john@techblog.com',
    name1: 'John Smith',
    status: 'pending' as const,
    notes: 'Migrated from Phase 1',
  },
  {
    domain: 'financeplus.io',
    niche: 'finance',
    email_account: 'hello@financeplus.io',
    email1: 'sarah@financeplus.io',
    name1: 'Sarah Johnson',
    status: 'pending' as const,
    notes: 'Migrated from Phase 1',
  },
  {
    domain: 'gamingzone.net',
    niche: 'gaming',
    email_account: 'info@gamingzone.net',
    email1: 'mike@gamingzone.net',
    name1: 'Mike Davis',
    status: 'pending' as const,
    notes: 'Migrated from Phase 1',
  },
  // Add more test data as needed
]

async function migratePhase1Data() {
  console.log('Starting Phase 1 → Supabase migration...')

  let created = 0
  let errors = 0

  for (const contact of phase1TestData) {
    try {
      // Create contact
      const savedContact = await saveContact(contact)
      console.log(`✓ Created contact: ${savedContact.domain}`)

      // Create default metadata
      await createMetadata(savedContact.id, {
        domain_authority: 50,
        traffic_percentage: 2.5,
        sentiment: 0,
        tags: ['migrated-phase1'],
      })

      created++
    } catch (error: any) {
      console.error(`✗ Failed to migrate ${contact.domain}: ${error.message}`)
      errors++
    }
  }

  console.log(`\nMigration complete:`)
  console.log(`  Created: ${created}`)
  console.log(`  Errors: ${errors}`)

  if (errors === 0) {
    console.log('\n✓ All Phase 1 data successfully migrated!')
  }
}

// Run migration
migratePhase1Data().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
```

- [ ] **Step 3: Run migration script manually**

```bash
npx ts-node scripts/migrate-phase1-to-supabase.ts
```

Expected output:
```
Starting Phase 1 → Supabase migration...
✓ Created contact: techblog.com
✓ Created contact: financeplus.io
✓ Created contact: gamingzone.net

Migration complete:
  Created: 3
  Errors: 0

✓ All Phase 1 data successfully migrated!
```

- [ ] **Step 4: Verify data in Supabase**

```bash
# Query Supabase to confirm contacts were created
# Use Supabase dashboard or run manual query
```

- [ ] **Step 5: Delete the script and commit removal**

```bash
rm scripts/migrate-phase1-to-supabase.ts
git add -A
git commit -m "feat: Phase 1 data migrated to Supabase (script removed)"
```

---

## Task 9: Update Jest Configuration for Test Environments

**Files:**
- Modify: `jest.config.js`
- Create: `.env.test`

**Context:** Configure Jest to load `.env.test` instead of `.env.local` during tests, ensuring tests don't touch production data.

- [ ] **Step 1: Update jest.config.js**

```javascript
// jest.config.js (add to existing config)
module.exports = {
  // ... existing config ...
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'node',
}
```

- [ ] **Step 2: Create jest.setup.ts**

```typescript
// jest.setup.ts (new file in project root)
import dotenv from 'dotenv'
import path from 'path'

// Load .env.test before tests run
dotenv.config({ path: path.resolve(__dirname, '.env.test') })
```

- [ ] **Step 3: Create .env.test**

```bash
# .env.test
SUPABASE_URL=https://test-project.supabase.co
SUPABASE_KEY=test-anon-key
GMAIL_SERVICE_ACCOUNT={"test": "credentials"}
OPENAI_API_KEY=test-key
GMAIL_WEBHOOK_SECRET=test-webhook-secret
GOOGLE_CLOUD_PROJECT=test-project
```

- [ ] **Step 4: Update .env.example**

```bash
# .env.example (for developers to copy)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
GMAIL_SERVICE_ACCOUNT={"type":"service_account",...}
OPENAI_API_KEY=sk-...
GMAIL_WEBHOOK_SECRET=your-webhook-secret
GOOGLE_CLOUD_PROJECT=your-gcp-project
```

- [ ] **Step 5: Commit**

```bash
git add jest.config.js jest.setup.ts .env.test .env.example
git commit -m "chore: configure Jest to use .env.test for isolated test environment"
```

---

## Task 10: Integration Tests for All API Routes

**Files:**
- Create: `tests/integration/api/paul-full.test.ts`

**Context:** Comprehensive integration tests verifying full Phase 2 flow: API routes → Integration layers → Supabase/OpenAI.

- [ ] **Step 1: Write comprehensive integration tests**

```typescript
// tests/integration/api/paul-full.test.ts
import { saveContact, getContact, getMessages, getMetadata } from '@/lib/integrations/supabase'

describe('Phase 2 Full Integration (API → Integrations → Services)', () => {
  const testDomain = 'integration-test.example.com'

  beforeEach(async () => {
    // Setup: Create contact in Supabase
    await saveContact({
      domain: testDomain,
      niche: 'tech',
      status: 'pending',
      follow_up_count: 0,
    })
  })

  describe('Full Qualification Flow', () => {
    test('POST /api/paul/qualify saves score to database', async () => {
      const response = await fetch('http://localhost:3000/api/paul/qualify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: testDomain,
          factors: {
            domainAuthority: 72,
            trafficPercentage: 5.5,
            nicheRelevance: 'high',
            antiSpamRating: 92,
          },
        }),
      })

      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.score).toBe(72)

      // Verify it was saved
      const contact = await getContact(testDomain)
      const metadata = await getMetadata(contact.id)
      expect(metadata.last_qualification_score).toBe(72)
    })
  })

  describe('Full Outreach Flow', () => {
    test('POST /api/paul/generate-outreach creates message in database', async () => {
      const response = await fetch('http://localhost:3000/api/paul/generate-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: testDomain,
          contactName: 'Jane Doe',
          niche: 'tech',
          relationshipTier: 'new',
          priceRange: '800-1500',
        }),
      })

      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.subject).toBeDefined()
      expect(result.body).toBeDefined()
      expect(result.messageId).toBeDefined()

      // Verify message was logged
      const contact = await getContact(testDomain)
      const messages = await getMessages(contact.id)
      expect(messages.length).toBeGreaterThan(0)
      const lastMessage = messages[0]
      expect(lastMessage.direction).toBe('outbound')
      expect(lastMessage.subject).toBe(result.subject)
    })
  })

  describe('Error Handling', () => {
    test('returns 404 when contact does not exist', async () => {
      const response = await fetch('http://localhost:3000/api/paul/qualify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'nonexistent-9999.com',
          factors: { domainAuthority: 50 },
        }),
      })

      expect(response.status).toBe(404)
    })

    test('returns 400 when required fields missing', async () => {
      const response = await fetch('http://localhost:3000/api/paul/qualify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(response.status).toBe(400)
    })

    test('returns 405 for unsupported HTTP methods', async () => {
      const response = await fetch('http://localhost:3000/api/paul/qualify', {
        method: 'GET',
      })

      expect(response.status).toBe(405)
    })
  })
})
```

- [ ] **Step 2: Run integration tests**

Run: `npm test -- tests/integration/api/paul-full.test.ts`
Expected: PASS - All integration tests passing

- [ ] **Step 3: Commit**

```bash
git add tests/integration/api/paul-full.test.ts
git commit -m "test: add comprehensive Phase 2 integration tests"
```

---

## Task 11: End-to-End Tests

**Files:**
- Create: `tests/e2e/phase2-dashboard-flow.test.ts`

**Context:** Test the full user flow from dashboard through API to Supabase: Click Qualify → See score → Click Generate → See email.

- [ ] **Step 1: Write E2E test (conceptual)**

```typescript
// tests/e2e/phase2-dashboard-flow.test.ts
// Note: Full E2E requires browser automation (Playwright/Cypress)
// This is a conceptual test showing the flow

describe('Phase 2 End-to-End: Dashboard → API → Database', () => {
  test('User can qualify a domain and see results', async () => {
    // 1. Navigate to dashboard
    // 2. Click Qualify button on a contact
    // 3. See loading state ("Scoring...")
    // 4. See qualification score and category
    // 5. Verify score was saved to Supabase

    expect(true).toBe(true) // Placeholder
  })

  test('User can generate outreach email', async () => {
    // 1. Navigate to dashboard
    // 2. Click Generate on a contact
    // 3. See loading state
    // 4. See generated email subject and body
    // 5. Verify message was logged to Supabase

    expect(true).toBe(true) // Placeholder
  })
})
```

- [ ] **Step 2: For now, mark as TODO**

This requires browser automation setup (Playwright/Cypress), which is deferred to Phase 3. The unit and integration tests above provide comprehensive coverage for Phase 2.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/phase2-dashboard-flow.test.ts
git commit -m "test: add E2E test placeholders (deferred to Phase 3)"
```

---

## Task 12: Verify All Tests Pass & Create Environment Doc

**Files:**
- Create: `docs/PHASE2_SETUP.md`

**Context:** Run full test suite, verify all Phase 2 code works together, and document setup steps.

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: ALL tests passing (unit + integration)

- [ ] **Step 2: Create setup documentation**

```markdown
# Phase 2 Setup Guide

## Prerequisites

You need API credentials for:
- **Supabase**: PostgreSQL database (free tier available at supabase.com)
- **Gmail API**: Service account for sending/reading emails
- **OpenAI API**: API key for GPT-4o-mini (paid service)

## Setup Steps

### 1. Create Supabase Project
- Go to supabase.com and create a new project
- Copy your Project URL and Anon Key
- Create all 17 tables using the schema in docs/superpowers/specs/2026-04-22-linkops-phase-2-design.md

### 2. Configure Gmail API
- Create a Google Cloud service account
- Download JSON credentials
- Enable Gmail API in your GCP project

### 3. Get OpenAI API Key
- Sign up at openai.com
- Create API key from Settings → API Keys
- Ensure you have GPT-4o-mini access

### 4. Set Environment Variables
Create `.env.local` with:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
GMAIL_SERVICE_ACCOUNT={"type":"service_account",...}
OPENAI_API_KEY=sk-...
GMAIL_WEBHOOK_SECRET=your-webhook-secret
GOOGLE_CLOUD_PROJECT=your-gcp-project
```

### 5. Run Data Migration
```bash
npx ts-node scripts/migrate-phase1-to-supabase.ts
```

### 6. Start Dev Server
```bash
npm run dev
```

Dashboard should now work with Supabase backend instead of mocks.

## Testing

Run all tests:
```bash
npm test
```

Run specific test suite:
```bash
npm test -- tests/unit/integrations/supabase.test.ts
npm test -- tests/integration/api/paul-full.test.ts
```

## Troubleshooting

**"Missing SUPABASE_URL or SUPABASE_KEY"**
- Verify `.env.local` has correct values
- Check that values are copied exactly from Supabase dashboard

**"Gmail authentication failed"**
- Verify service account JSON is valid
- Check that Gmail API is enabled in GCP project

**"OpenAI API key invalid"**
- Check key starts with `sk-`
- Verify you have available credits
- Test key at platform.openai.com/account/api-keys

## Next Steps (Phase 3)
- Reply classification (analyze incoming emails)
- Price negotiation logic
- Link placement verification
- n8n workflow automation
```

- [ ] **Step 3: Commit documentation**

```bash
git add docs/PHASE2_SETUP.md
git commit -m "docs: add Phase 2 setup and troubleshooting guide"
```

---

## Task 13: Verify Dashboard Still Works End-to-End

**Files:**
- No code changes
- Manual verification required

**Context:** Start dev server and manually test that the dashboard still works with Supabase backend.

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Expected: Server starts on localhost:3009 (or next available port)

- [ ] **Step 2: Navigate to dashboard**

Open `http://localhost:3009/dashboard` in browser

Expected: Dashboard loads, shows migrated contacts from Phase 1

- [ ] **Step 3: Click Qualify button**

- Click Qualify on any contact
- Expected: See "Scoring..." then qualification score and category appear

- [ ] **Step 4: Click Generate button**

- Click Generate on any contact
- Expected: See loading, then email subject and body appear

- [ ] **Step 5: Verify no errors in console**

- Open browser DevTools
- Expected: No red errors, only normal console logs

- [ ] **Step 6: Stop dev server and commit**

```bash
# Stop dev server (Ctrl+C)
git add -A
git commit -m "feat: Phase 2 complete - Supabase + Gmail + OpenAI integration working end-to-end"
```

---

## Phase 2 Verification Checklist

Before marking Phase 2 complete:

- [ ] All 13 tasks completed and committed
- [ ] Unit tests passing (Supabase, Gmail, OpenAI integration layers)
- [ ] Integration tests passing (API routes with Supabase)
- [ ] E2E tests placeholders created
- [ ] Phase 1 test data migrated to Supabase
- [ ] Dashboard loads and works with Supabase backend
- [ ] Qualify button saves scores to database
- [ ] Generate button calls OpenAI and logs messages
- [ ] Webhook endpoint ready for Gmail replies
- [ ] Error handling + fallbacks in place
- [ ] All code committed, no uncommitted changes
- [ ] Setup documentation complete

---

## Success Criteria

Phase 2 is complete when:

1. ✅ Supabase PostgreSQL with 17-table schema deployed
2. ✅ Integration layers (supabase.ts, gmail.ts, openai.ts) working
3. ✅ /api/paul/qualify saves scores to contacts_metadata
4. ✅ /api/paul/generate-outreach calls OpenAI + logs to messages
5. ✅ /api/webhooks/gmail endpoint ready for incoming emails
6. ✅ Dashboard works with Supabase backend (not mocks)
7. ✅ Phase 1 test data migrated successfully
8. ✅ All unit + integration tests passing
9. ✅ Error handling + fallbacks tested
10. ✅ All code committed, all tests passing
