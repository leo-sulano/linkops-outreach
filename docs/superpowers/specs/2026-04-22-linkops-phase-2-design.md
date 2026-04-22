# LinkOps Phase 2 (Real Integrations & Database) Design

> **Project:** LinkOps — AI-powered link insertion outreach automation  
> **Phase:** 2 - Real Integrations & Database  
> **Date:** 2026-04-22  
> **Status:** Design approved, ready for implementation planning

---

## Overview

Phase 2 transforms LinkOps from mock in-memory operations to a production-ready system with real data persistence and external service integrations. Phase 1 established Paul Logic (domain qualification and outreach generation). Phase 2 adds:

- **Supabase PostgreSQL database** with complete 17-table schema
- **Real Gmail API integration** for sending emails, reading inbox, and receiving webhook notifications for replies
- **Real OpenAI GPT-4o-mini integration** for dynamic email generation (replacing mock templates)
- **Integration layers** that cleanly separate business logic (Paul) from data access and service calls
- **Data migration** from Phase 1 test data to Supabase

**Key invariant:** Paul Logic module remains pure (no I/O). All persistence and service integration happens in new layers between API routes and Paul Logic.

---

## Section 1: Architecture Overview

### Phase 1 → Phase 2 Transformation

**Phase 1 (Current):**
```
Dashboard → API Route → Paul Logic → Mock Responses → In-Memory
```

**Phase 2 (New):**
```
Dashboard → API Route → Paul Logic → Integration Layers → Persistent Services
                                      ├─ Supabase (PostgreSQL)
                                      ├─ Gmail API (send, read, webhook)
                                      └─ OpenAI (GPT-4o-mini)
```

### Layering Strategy

**Layer 1 — Frontend (unchanged)**
- React dashboard at `/dashboard`
- Calls `/api/paul/*` endpoints
- Displays results from Supabase-backed API

**Layer 2 — API Routes (enhanced)**
- Existing routes (`/api/paul/qualify`, `/api/paul/generate-outreach`) now call integration layers
- New webhook route: `/api/webhooks/gmail` for incoming reply notifications
- New setup route: `/api/seeds/migrate-phase1` for data migration (temporary)

**Layer 3 — Integration Layers (new)**
- `lib/integrations/supabase.ts` — Database queries and mutations
- `lib/integrations/gmail.ts` — Email send, inbox read, webhook listener
- `lib/integrations/openai.ts` — Dynamic email body generation

**Layer 4 — Paul Logic (unchanged)**
- Pure decision engine: `lib/paul/qualifier.ts` and `lib/paul/generator.ts`
- No I/O, no service calls
- Consumes data from integration layers, returns decisions

**Layer 5 — Data (new)**
- Supabase PostgreSQL with 17 tables

### Data Flow Example

User clicks "Qualify" on domain "example.com" in dashboard:

```
1. Dashboard: POST /api/paul/qualify { domain: "example.com", ... }
2. API Route: Calls supabase.getContact("example.com")
3. Supabase Layer: Returns contact record with DA, traffic, niche
4. Paul Logic: qualifyDomain() computes score based on factors
5. Supabase Layer: saveScore() stores score in contacts_metadata
6. API Route: Returns { score: 85, category: "premium", ... }
7. Dashboard: Displays score and updates UI
```

---

## Section 2: Database Schema (17 Tables)

All tables use `id` (UUID primary key), `created_at` (timestamp), `updated_at` (timestamp) unless otherwise noted.

### Core Tables (5)

**`contacts`** — Main entity (1 row per domain/publisher)
- `domain` (text, unique) — e.g., "example.com"
- `niche` (text) — e.g., "tech", "finance", "casino"
- `email_account` (text) — Shared contact email or group email
- `email1`, `name1`, `email2`, `name2`, `email3`, `name3` (text) — Up to 3 contact emails/names
- `status` (enum: pending, under_negotiation, approved, no_deal, follow_up) — Current stage
- `date_confirmed` (timestamp nullable) — When deal was approved
- `last_outreach_at` (timestamp nullable) — Last email sent
- `follow_up_count` (integer, default 0) — Auto-incremented; blacklist triggers after 3
- `notes` (text nullable) — Internal notes

**`users`** — Dashboard users
- `email` (text, unique) — User email
- `name` (text) — Display name
- `role` (enum: admin, editor, viewer) — Permission level
- `preferences` (jsonb) — User settings (theme, notifications, etc.)

**`contacts_metadata`** — Extended attributes for domain scoring
- `contact_id` (UUID, FK contacts) — Reference to contact
- `domain_authority` (integer 0-100) — SEO metric
- `traffic_percentage` (decimal 0-100) — Estimated traffic share
- `sentiment` (integer -10 to 10) — Relationship sentiment score
- `tags` (text array) — Categorical tags (e.g., ["high-authority", "responsive"])
- `last_qualified_at` (timestamp) — When Paul last scored this domain
- `last_qualification_score` (integer 0-100) — Most recent Paul qualification score

**`relationships`** — Relationship tier tracking (new → warm → trusted → VIP)
- `contact_id` (UUID, FK contacts)
- `tier` (enum: new, warm, trusted, vip) — Current relationship stage
- `since` (timestamp) — When this tier was reached
- `events_count` (integer) — Touchpoints in this tier

**`blacklist`** — Blocked domains/contacts with reason
- `domain` (text, unique) — Blacklisted domain
- `reason` (text) — Why blacklisted (spam, no-response, hostile, etc.)
- `blocked_at` (timestamp)
- `blocked_by` (UUID, FK users) — Who blocked it

### Message & Communication (4)

**`messages`** — Full email history (audit trail)
- `contact_id` (UUID, FK contacts)
- `direction` (enum: outbound, inbound) — Sent by us or from contact
- `from_email` (text) — Sender email
- `to_email` (text) — Recipient email
- `subject` (text) — Email subject
- `body` (text) — Email body
- `gmail_message_id` (text nullable) — Gmail's internal ID
- `classification` (enum nullable: INTERESTED, MAYBE, EXPENSIVE, NOT_INTERESTED, AUTORESPOND, SPAM_SIGNAL) — For inbound only
- `sent_at` (timestamp) — When email was sent/received

**`message_classifications`** — Inbound reply analysis (detailed classification)
- `message_id` (UUID, FK messages)
- `classification_type` (enum) — INTERESTED, MAYBE, EXPENSIVE, NOT_INTERESTED, AUTORESPOND, SPAM_SIGNAL
- `confidence` (decimal 0-1) — Classifier confidence (0.0-1.0)
- `key_phrases` (text array) — Extracted phrases that drove classification
- `classified_at` (timestamp)
- `classified_by` (text) — "openai-gpt4" or "rule-based"

**`templates`** — Saved email templates (for drafting)
- `name` (text) — Template name (e.g., "Cold Outreach - Tech")
- `subject` (text) — Template subject with variables like {{domain}}, {{niche}}
- `body` (text) — Template body
- `variables` (text array) — List of variables used (e.g., ["domain", "niche", "name"])
- `category` (enum: standard, warm, premium) — Tone/approach
- `created_by` (UUID, FK users)

**`automations`** — Scheduled outreach rules
- `name` (text) — Rule name (e.g., "Auto follow-up after 7 days")
- `trigger` (jsonb) — Trigger condition (e.g., { "type": "status_change", "to": "pending" })
- `action` (jsonb) — Action to take (e.g., { "type": "send_email", "template_id": "..." })
- `enabled` (boolean)
- `last_run_at` (timestamp nullable)
- `next_run_at` (timestamp nullable)

### Negotiation Pipeline (3)

**`negotiation_rounds`** — Price negotiation state machine
- `contact_id` (UUID, FK contacts)
- `round_number` (integer 1-4) — Which round (max 4)
- `our_offer` (integer) — Price we offered (USD)
- `their_offer` (integer nullable) — Price they counter-offered
- `accepted_price` (integer nullable) — Final agreed price
- `status` (enum: pending, countered, accepted, rejected, expired) — Round status
- `initiated_at` (timestamp)
- `expires_at` (timestamp) — When offer expires
- `notes` (text nullable) — Negotiation notes

**`deal_outcomes`** — Final deals (closed or failed)
- `contact_id` (UUID, FK contacts)
- `final_price` (integer) — Amount paid or agreed
- `margin` (integer nullable) — Our profit margin
- `deal_status` (enum: closed, failed, paused) — Final outcome
- `link_placed_at` (timestamp nullable) — When link was actually inserted
- `closed_at` (timestamp)

**`follow_ups`** — Follow-up tracking (persistent reminders)
- `contact_id` (UUID, FK contacts)
- `round_number` (integer) — Which negotiation round
- `scheduled_for` (timestamp) — When to follow up
- `status` (enum: pending, sent, completed, skipped) — Status
- `sent_at` (timestamp nullable)
- `notes` (text nullable)

### Link Tracking (3)

**`link_placements`** — Placed links (where links live on client sites)
- `contact_id` (UUID, FK contacts)
- `placement_url` (text) — URL where link is placed (e.g., "example.com/resources/page")
- `our_url` (text) — URL we requested them to link to
- `anchor_text` (text) — Link text (e.g., "casino games")
- `link_inserted` (boolean) — Confirmed link is live
- `inserted_at` (timestamp nullable) — When we verified it
- `verified_date` (timestamp nullable) — Last verification check
- `verification_method` (enum: manual, automated) — How verified
- `notes` (text nullable)

**`link_verification_logs`** — Weekly verification history (ongoing checks)
- `link_placement_id` (UUID, FK link_placements)
- `check_date` (timestamp) — When we checked
- `status` (enum: live, removed, broken, wrong_anchor) — What we found
- `screenshot_url` (text nullable) — Screenshot proof
- `http_status` (integer nullable) — HTTP response (200, 404, etc.)
- `notes` (text nullable)

**`analytics`** — Traffic/ranking impact tracking (ROI)
- `link_placement_id` (UUID, FK link_placements)
- `metric_type` (enum: traffic, ranking, referrals, revenue) — What we're measuring
- `value` (decimal) — Metric value (visits, rank position, revenue $)
- `period` (enum: daily, weekly, monthly) — Aggregation period
- `measured_at` (timestamp)

### Admin (2)

**`api_logs`** — Request audit trail (compliance/debugging)
- `endpoint` (text) — API route (e.g., "/api/paul/qualify")
- `method` (enum: get, post, put, delete)
- `status_code` (integer) — HTTP response status
- `response_time_ms` (integer) — Request duration
- `user_id` (UUID, FK users nullable) — Who made the request
- `error_message` (text nullable) — If request failed
- `created_at` (timestamp) — When request occurred

**`settings`** — System configuration (key-value)
- `key` (text, unique) — Setting name (e.g., "gmail_webhook_secret", "sync_frequency_hours")
- `value` (text) — Setting value
- `updated_at` (timestamp)
- `updated_by` (UUID, FK users nullable)

---

## Section 3: Integration Layers

Three new modules in `lib/integrations/` provide clean separation between API routes and external services.

### `lib/integrations/supabase.ts`

**Responsibility:** All database queries and mutations

**Client setup:**
```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)
```

**Key queries/mutations:**
- `getContact(domain: string): Promise<Contact>` — Fetch contact by domain
- `saveContact(data: Partial<Contact>): Promise<Contact>` — Create or update contact
- `getMessages(contactId: string): Promise<Message[]>` — Fetch message history
- `createMessage(data: MessageInput): Promise<Message>` — Log new email (outbound or inbound)
- `getMetadata(contactId: string): Promise<ContactMetadata>` — Get DA/traffic/niche scores
- `saveMetadata(contactId: string, data: MetadataInput): Promise<ContactMetadata>` — Update scores
- `saveQualificationScore(contactId: string, score: number): Promise<void>` — Store Paul's score
- `getNegotiationRound(contactId: string): Promise<NegotiationRound>` — Fetch active negotiation
- `saveNegotiationRound(contactId: string, data: NegotiationInput): Promise<NegotiationRound>` — Create/update round

**Error handling:**
- Connection failures → throw SupabaseConnectionError
- Row not found → throw NotFoundError
- Validation failures → throw ValidationError
- All errors logged to `api_logs` table

**No business logic** — only data access. Paul Logic is not embedded here.

### `lib/integrations/gmail.ts`

**Responsibility:** Gmail API interactions (send, read, webhook)

**Client setup:**
```typescript
// Option A: Service account (recommended for automation)
const gmail = google.gmail({ version: 'v1', auth: serviceAccountAuth })

// Option B: OAuth (for user-initiated sends)
const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
```

**Key methods:**
- `sendEmail(to: string, subject: string, body: string): Promise<GmailMessageId>` — Send email, return Gmail message ID
- `readInbox(maxResults: number): Promise<EmailMessage[]>` — Fetch recent inbox messages
- `getEmailBody(messageId: string): Promise<string>` — Extract full email body
- `registerWebhook(callbackUrl: string): Promise<void>` — Register webhook with Gmail (one-time setup)
- `verifyWebhookSignature(signature: string, body: string): Promise<boolean>` — Validate incoming webhook

**Webhook flow:**
1. Gmail sends POST to `/api/webhooks/gmail` with encrypted message notification
2. Route verifies webhook signature using `verifyWebhookSignature()`
3. Route calls `getEmailBody()` to fetch full message from Gmail
4. Route saves message to `messages` table via Supabase layer
5. Route returns 200 OK

**Error handling:**
- Invalid email → throw ValidationError (caught by API route)
- Auth failures (invalid token) → throw AuthError (log to console, user sees 401)
- Gmail quota exceeded → throw QuotaError (retry with exponential backoff)
- Webhook signature invalid → throw SecurityError (return 401)

### `lib/integrations/openai.ts`

**Responsibility:** OpenAI GPT-4o-mini API calls for dynamic email generation

**Client setup:**
```typescript
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})
```

**Key method:**
- `generateEmailBody(params: EmailGenerationParams): Promise<string>` — Generate email body
  - Input: `{ domain, niche, contactName, relationshipTier, priceRange, previousEmails? }`
  - Output: Generated email body text
  - System prompt: "You are an expert link insertion outreach specialist. Write personalized, persuasive emails that..."
  - Uses relationship tier to adjust tone (new=formal, vip=personal)

**Fallback strategy:**
- If OpenAI fails, fall back to Phase 1 mock templates (keep `lib/mocks/paulResponses.ts` as fallback)
- Log warning "OpenAI failed, using mock template" to console
- Return mock template body to frontend

**Error handling:**
- Invalid API key → throw AuthError (check credentials)
- Quota exceeded → use fallback template
- Network timeout → throw TimeoutError (retry 3x with exponential backoff)
- Rate limited → throw RateLimitError (wait before retry)

---

## Section 4: API Route Changes

### Enhanced Routes

**`/api/paul/qualify` (POST)**

**Before (Phase 1):**
```
Input: { domain, factors }
→ Paul Qualifier
→ Mock response
→ Output: score, category
```

**After (Phase 2):**
```
Input: { domain, factors }
→ supabase.getContact(domain)
→ Paul Qualifier
→ supabase.saveMetadata() to contacts_metadata
→ Output: score, category, contact history, previous negotiations
```

**Enhanced response includes:**
- `score: number` (0-100)
- `category: string` (reject, standard, warm, premium)
- `contact: Contact` (full contact record from Supabase)
- `metadata: ContactMetadata` (DA, traffic, sentiment)
- `lastOutreachAt: timestamp` (when we last emailed)
- `followUpCount: number` (how many follow-ups sent)

**Database writes:**
- Updates `contacts_metadata.last_qualified_at`
- Updates `contacts_metadata.last_qualification_score`

---

**`/api/paul/generate-outreach` (POST)**

**Before (Phase 1):**
```
Input: { domain, category, tone, contactName }
→ Paul Generator (with mock templates)
→ Output: subject, body
```

**After (Phase 2):**
```
Input: { domain, category, tone, contactName, relationshipTier }
→ openai.generateEmailBody() [or fallback to mock if OpenAI fails]
→ Paul Generator (validates + structures)
→ supabase.createMessage() [log outbound message]
→ Output: subject, body, messageId, createdAt
```

**Enhanced response includes:**
- `subject: string`
- `body: string`
- `messageId: string` (unique ID for tracking)
- `createdAt: timestamp` (when drafted)
- `tone: string` (which tone was used)

**Database writes:**
- Inserts into `messages` table (outbound, direction="outbound")
- Sets `gmail_message_id` to null (will populate if user sends via API)

---

### New Webhook Route

**`/api/webhooks/gmail` (POST)**

**Purpose:** Receive incoming reply notifications from Gmail

**Flow:**
1. Gmail sends encrypted notification containing message ID
2. Verify webhook signature: `gmail.verifyWebhookSignature(signature, body)`
3. Extract message ID and fetch full message: `gmail.getEmailBody(messageId)`
4. Parse sender email and body
5. Call `supabase.createMessage()` to log inbound message
6. Return 200 OK to Gmail
7. (Phase 3: Trigger classification workflow)

**Request:**
```
POST /api/webhooks/gmail
Body: { encryptedMessage, signature, timestamp }
```

**Response:**
```
200 OK
{ status: "message_received", messageId: "...", contactDomain: "..." }
```

**Error handling:**
- Invalid signature → 401 Unauthorized
- Message not found in Gmail → 404 Not Found
- Database error → 500 Internal Server Error (log to console)

---

### New Setup Route (Temporary)

**`/api/seeds/migrate-phase1` (POST)**

**Purpose:** One-time migration of Phase 1 test data to Supabase

**Flow:**
1. Extract Phase 1 test contacts from hardcoded/localStorage
2. For each contact:
   - Create row in `contacts` table
   - Create empty row in `contacts_metadata`
   - Create empty follow-up records
3. Log results: "10 contacts migrated, 0 errors"
4. Return migration summary

**Response:**
```json
{
  "success": true,
  "contactsMigrated": 10,
  "errors": [],
  "message": "Phase 1 data successfully migrated to Supabase"
}
```

**Important:** Delete this route after one-time use. Do not commit to production. Use only during initial Phase 2 setup.

---

## Section 5: Data Migration & Testing

### Phase 1 → Phase 2 Data Migration

**Current state:** Phase 1 dashboard has ~10 sample contacts (in-memory or localStorage)

**Migration script:** `scripts/migrate-phase1-to-supabase.ts`

**Steps:**
1. Load Phase 1 test data (from wherever it's stored)
2. Connect to Supabase using credentials from `.env.local`
3. For each contact:
   - Insert into `contacts` table (domain, niche, emails, status, etc.)
   - Insert into `contacts_metadata` with placeholder values (DA=50, traffic=5%, etc.)
   - Insert into `relationships` table (tier="new", since=now)
4. Log results: "X contacts created, Y errors, Z skipped"
5. Validate: Query Supabase to confirm all inserts succeeded

**Run manually:**
```bash
npx ts-node scripts/migrate-phase1-to-supabase.ts
```

**Then delete the script** (don't commit to production)

---

### Testing Strategy

**Unit tests:** Each integration layer tested independently

- `tests/unit/integrations/supabase.test.ts` — Mock Supabase, test queries
- `tests/unit/integrations/gmail.test.ts` — Mock Gmail API, test send/read/webhook
- `tests/unit/integrations/openai.test.ts` — Mock OpenAI API, test generation

**Integration tests:** API routes tested with real integration layers

- `tests/integration/api/paul.test.ts` — Enhanced with database assertions
  - Test: POST /api/paul/qualify → verify score is saved to `contacts_metadata`
  - Test: POST /api/paul/generate-outreach → verify message is logged to `messages` table
  - Test: POST /api/webhooks/gmail → verify inbound message is created

**End-to-end tests:** Dashboard → API → Supabase flow

- `tests/e2e/qualify-and-generate.test.ts` — Full user flow
  - Click Qualify button → API calls Supabase → Paul scores → score displayed
  - Click Generate → API calls OpenAI → email generated → message logged

---

### Test Environments

**`.env.local`** (your production credentials, ignored by git)
```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_KEY=YOUR-ANON-KEY
GMAIL_SERVICE_ACCOUNT={"..."}
OPENAI_API_KEY=sk-...
```

**`.env.test`** (test project credentials, can be committed)
```
SUPABASE_URL=https://TEST-PROJECT.supabase.co
SUPABASE_KEY=TEST-ANON-KEY
GMAIL_SERVICE_ACCOUNT={"test": "credentials"}
OPENAI_API_KEY=test-key
```

**Jest config:** When running tests, load `.env.test` instead of `.env.local`

```typescript
beforeAll(() => {
  process.env = { ...process.env, ...loadEnv('.env.test') }
})
```

**Seed test data:** Before each test suite, reset Supabase and seed with known data

```typescript
beforeEach(async () => {
  await supabase.from('contacts').delete().neq('id', '00000000') // Clear all
  await seedTestData(supabase) // Insert fresh test data
})
```

---

## Section 6: Error Handling & Fallback

### Integration Layer Errors

**Supabase errors:**
- Connection failure → throw `SupabaseConnectionError` → API returns 503
- Row not found → throw `NotFoundError` → API returns 404
- Validation error (e.g., invalid domain) → throw `ValidationError` → API returns 400
- Unique constraint violation → throw `DuplicateError` → API returns 409
- Quota limit → throw `QuotaError` → API returns 429

**Gmail errors:**
- Invalid auth token → throw `AuthError` → API returns 401
- Message send failed → throw `SendError` → API returns 400 with Gmail error details
- Webhook signature invalid → throw `SecurityError` → return 401 to Gmail
- Rate limited → throw `RateLimitError` → API returns 429 with Retry-After header
- Network timeout → throw `TimeoutError` → API returns 504, retry with exponential backoff

**OpenAI errors:**
- Invalid API key → throw `AuthError` → API returns 500 (check credentials)
- Quota exceeded → don't throw, use fallback mock template instead
- Network timeout → throw `TimeoutError` → retry 3x, then fallback if all fail
- Rate limited → throw `RateLimitError` → API returns 429

### Fallback Strategy

**OpenAI failures:** Fall back to Phase 1 mock templates
- Keep `lib/mocks/paulResponses.ts` in codebase
- If OpenAI call fails, call `getMockBody()` instead
- Log warning "OpenAI failed, using mock template"
- Return mock template body to frontend

**Supabase failures:** Return error to frontend, don't crash dashboard
- Dashboard shows: "Unable to save to database. Please try again."
- Log full error server-side for debugging

**Gmail failures:** Allow dashboard to work without email sending
- If sending fails, show: "Email was drafted but failed to send. Check credentials."
- Don't block qualification or generation

### Rollback Plan

**If Phase 2 has critical bugs:**
1. Revert to Phase 1 branch (all code on separate git branch)
2. API routes fall back to using mocks
3. Data in Supabase remains (can be cleared and re-seeded if corrupted)

**Supabase data recovery:**
- Supabase has automatic backups
- Can restore from snapshot if data corruption occurs
- Delete and re-seed from migration script if needed

---

## Phase 2 Checklist

- [ ] Supabase project created + 17-table schema deployed
- [ ] `.env.local` configured with Supabase, Gmail, OpenAI credentials
- [ ] Integration layers implemented (`supabase.ts`, `gmail.ts`, `openai.ts`)
- [ ] API routes enhanced to use integration layers
- [ ] Migration script creates and tests
- [ ] Unit tests for each integration layer
- [ ] Integration tests for API routes with database assertions
- [ ] End-to-end tests validate full flow
- [ ] Dashboard still works with new Supabase backend
- [ ] Error handling + fallback templates in place
- [ ] Phase 1 → Phase 2 data migration completes
- [ ] All tests passing
- [ ] Committed and ready for Phase 3

---

## Files to Create/Modify

**New:**
- `lib/integrations/supabase.ts`
- `lib/integrations/gmail.ts`
- `lib/integrations/openai.ts`
- `scripts/migrate-phase1-to-supabase.ts`
- `tests/unit/integrations/supabase.test.ts`
- `tests/unit/integrations/gmail.test.ts`
- `tests/unit/integrations/openai.test.ts`

**Modify:**
- `pages/api/paul/qualify.ts`
- `pages/api/paul/generate-outreach.ts`
- `pages/api/webhooks/gmail.ts` (create webhook endpoint)
- `.env.local` (add credentials)
- `jest.config.js` (configure test environment loading)

**Keep (Phase 1):**
- `lib/paul/*` (unchanged)
- `lib/mocks/paulResponses.ts` (fallback templates)
- `components/dashboard/*` (unchanged)

---

## Success Criteria

Phase 2 is complete when:

1. ✅ All 17 tables created in Supabase + schema validated
2. ✅ Integration layers working (database queries, API calls, webhooks)
3. ✅ `/api/paul/qualify` saves scores to `contacts_metadata`
4. ✅ `/api/paul/generate-outreach` logs messages to `messages` table
5. ✅ `/api/webhooks/gmail` receives and logs incoming emails
6. ✅ Dashboard still displays contacts and works with Supabase backend
7. ✅ Phase 1 test data migrated to Supabase successfully
8. ✅ All unit + integration + e2e tests passing
9. ✅ Error handling + fallbacks in place and tested
10. ✅ All code committed, no uncommitted changes

---
