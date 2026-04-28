# LinkOps System Architecture

> **Project:** LinkOps — AI-powered link insertion outreach automation  
> **Date:** 2026-04-22  
> **Scope:** Complete system design covering data model, Paul Logic module, API structure, integrations, and automation orchestration

---

## Overview

LinkOps is an end-to-end link insertion outreach platform. At its core is **Paul**, a pure decision-making module (not embedded in API routes) that:
- Qualifies domains using composite scoring
- Generates personalized outreach emails
- Classifies incoming replies
- Negotiates prices using strategy engines
- Recommends deal closure

The system integrates with Gmail (inbox + send), Google Sheets (domain lists), OpenAI GPT-4o-mini (NLP), and n8n (workflow automation). All data lives in Supabase PostgreSQL. The dashboard is a React app built in Next.js showing contact status, stats, and full CRUD operations.

---

## Section 1: System Architecture Overview

**Nine-Layer Architecture:**

```
┌─────────────────────────────────────────────────────────┐
│  Frontend Layer                                         │
│  Next.js Dashboard (React) + Admin Controls             │
└─────────────────┬───────────────────────────────────────┘
                  │ HTTP/JSON
┌─────────────────▼───────────────────────────────────────┐
│  API Layer                                              │
│  Next.js API Routes (/api/contacts, /paul, /webhooks)  │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│  Paul Logic Module (Pure Decision Engine)               │
│  - Qualifier (domain scoring)                           │
│  - Generator (email + subject)                          │
│  - Classifier (reply analysis)                          │
│  - Negotiator (price strategy)                          │
│  - Validator (deal closure)                             │
└─────────────────┬───────────────────────────────────────┘
                  │
        ┌─────────┼─────────┐
        │         │         │
        ▼         ▼         ▼
┌──────────┐ ┌──────────┐ ┌──────────────┐
│ Supabase │ │ External │ │ External     │
│PostgreSQL│ │Services  │ │Services      │
│          │ │(Gmail,   │ │(OpenAI,      │
│17 tables │ │Sheets)   │ │Verification) │
└──────────┘ └──────────┘ └──────────────┘
        │         │         │
        └─────────┼─────────┘
                  │ Webhook callbacks
┌─────────────────▼───────────────────────────────────────┐
│  n8n Automation Layer                                   │
│  - Outreach scheduler                                   │
│  - Reply listener (Gmail webhook)                       │
│  - Follow-up queue                                      │
│  - Link verification (weekly)                           │
│  - Sheets sync (every 6h)                              │
└─────────────────────────────────────────────────────────┘
```

**Data Flow Example:** Dashboard user clicks "Start Outreach" on domain → API calls Paul Qualifier → Paul scores domain → API returns score → Dashboard calls Paul Generator → Paul writes email + subject → Email drafted for user review → User sends → n8n picks up send event → Waits for reply → Gmail webhook triggers → Reply classified → Dashboard shows result.

---

## Section 2: Database Schema

**17 Tables, organized by responsibility:**

### Core Tables

**`contacts`** (Main entity, 1 row per domain/publisher)
```sql
id, domain, niche, email_account, 
email1, name1, email2, name2, email3, name3,
status, date_confirmed, created_at, updated_at,
last_outreach_at, follow_up_count, notes
```
- Status: pending, under_negotiation, approved, no_deal, follow_up
- `follow_up_count`: auto-incremented; blacklist rule triggers after 3

**`messages`** (Email history)
```sql
id, contact_id, direction (outbound|inbound), 
from_email, to_email, subject, body, classification,
external_message_id (Gmail ID), sent_at, created_at
```
- Classification (inbound only): INTERESTED, MAYBE, EXPENSIVE, NOT_INTERESTED, AUTORESPOND, SPAM_SIGNAL
- Stores all communication history for audit + replay

**`negotiation_rounds`** (Price negotiation state machine)
```sql
id, contact_id, round_number (1-4), 
our_offer, their_offer, accepted_price, status,
strategy_used, message_id (which email), created_at
```
- Tracks each back-and-forth in negotiation
- `strategy_used`: "split_difference", "aggressive", "conservative", etc.

### Logic Tables

**`domain_scores`** (Qualification results)
```sql
contact_id, score (0-100), category (reject|standard|warm|premium),
domain_authority, traffic_percent, niche_match, anti_spam_score,
calculated_at, expires_at
```
- Calculated once per domain; expires after 30 days (DA changes)
- Breakdown: DA (40%), Traffic (30%), Niche (20%), AntiSpam (10%)

**`publisher_relationships`** (Relationship tier tracking)
```sql
contact_id, tier (new|warm|trusted|vip), 
total_deals, total_spent, avg_response_time_hours,
last_deal_date, updated_at
```
- Tier affects Paul's negotiation strategy and tone
- VIP gets lower opening offers, more flexibility

**`negotiation_strategy`** (DA-based strategy config)
```sql
domain_authority_min, domain_authority_max,
opening_discount_percent, acceptance_discount_percent,
max_rounds, tone (aggressive|balanced|conservative),
created_at
```
- Pre-calculated strategy matrix: DA 70+ gets -20% opening, DA <30 gets -40% opening
- Paul looks up strategy based on contact's DA

### Email Tables

**`templates`** (Outreach email templates)
```sql
id, name (standard|warm|premium), 
subject_line, body_template, tone, 
variables (jsonb), created_by, created_at
```
- Templates are placeholders: {publisher_name}, {niche}, {da}, etc.
- Paul fills in variables based on contact + personalization rules

**`subject_line_tests`** (A/B testing)
```sql
id, template_id, variant (A|B), 
subject, send_count, open_count, 
open_rate, last_used_at
```
- Paul picks least-sent variant to maximize diversity

**`template_versions`** (Audit trail)
```sql
template_id, version_number, body_template, 
changed_by, changed_at, change_reason
```

### Link & Deal Tables

**`approved_deals`** (Closed deals awaiting link insertion)
```sql
id, contact_id, agreed_price, insertion_deadline,
link_instructions (jsonb), status (waiting_copy|waiting_verification|live|removed),
created_at, deal_closed_at
```
- `link_instructions`: URL list, anchor text, placement instructions
- Paul suggests 3 candidate URLs in deal closure email

**`link_verifications`** (Placement verification)
```sql
id, approved_deal_id, inserted_url, target_domain,
verification_status (live|removed|moved|error), 
found_at_url (if moved), verified_at, next_check_at
```
- Run weekly by n8n; auto-flag if removed

### Finance & Admin Tables

**`payments`** (Invoice + payment tracking)
```sql
id, approved_deal_id, amount, currency (EUR),
invoice_sent_date, paid_date, status (invoiced|paid|reconciled),
notes, created_at
```

**`blacklist`** (Rejected domains)
```sql
domain, reason (spam|after_3_followups|user_blocked|low_score),
blacklisted_at, unblacklist_by (user only)
```
- Auto-populated by Supabase trigger (3+ follow-ups → auto-blacklist)

**`sheets_sync_log`** (Import audit)
```sql
id, sync_id, status (pending|success|error), 
rows_processed, rows_created, rows_skipped,
error_details (jsonb), synced_at
```

**`paul_activity_log`** (Decision audit)
```sql
id, contact_id, action (qualify|generate_email|classify_reply|negotiate|close_deal),
input (jsonb), output (jsonb), decision_rationale,
created_at
```
- Every Paul decision logged here for transparency + debugging

---

## Section 3: Paul's Logic Flow

### Phase 1: Domain Qualification

**Input:** Domain + external data (DA, traffic, niche, spam signals)  
**Output:** Score (0-100) + category (reject/standard/warm/premium)

**Scoring Formula:**
```
score = (DA × 0.4) + (Traffic% × 0.3) + (Niche × 0.2) + (AntiSpam × 0.1)

where:
  DA = domain_authority / 100 (0-1 normalized)
  Traffic% = alexa_rank percentile (0-1)
  Niche = relevance to campaign niche (0-1, manual or TF-IDF)
  AntiSpam = 1 if not in spam blacklist, 0.5 if suspicious, 0 if spam
```

**Decision Tree:**
```
score < 40?       → REJECT (log as low-quality)
40 ≤ score < 60?  → STANDARD (template: professional, factual)
60 ≤ score < 80?  → WARM (template: friendly, appreciative)
score ≥ 80?       → PREMIUM (template: VIP, high-touch)
```

Stored in `domain_scores` table; expires after 30 days.

### Phase 2: Outreach Email Generation

**Input:** Contact + qualification score + template choice  
**Output:** Subject line + email body (drafted for review or auto-sent)

**Process:**
1. Paul selects template (standard/warm/premium) based on score
2. Paul chooses subject line variant (A/B test): picks least-sent variant
3. Paul calls GPT-4o-mini: "Write a cold outreach email to [publisher] about [niche], tone: [warm/standard/premium]. Variables: {publisher_name}, {niche}, {da}. End with call-to-action for price discussion."
4. GPT fills template, personalizes with contact's niche + previous deal history (if any)
5. Email scheduled: 30-90 min delay (stagger sends to avoid spam detection)
6. Logged to `messages` table (outbound)

**Personalization Rules:**
- If publisher has prior deals: mention "following up on previous partnership"
- If DA > 80: mention "premium publisher status"
- If niche = gambling/casino: adjust tone based on `accept_casino` flag
- If relationship tier = VIP: open with appreciation, lower opening discount

### Phase 3: Reply Classification

**Input:** Incoming email (from Gmail webhook)  
**Output:** Classification + confidence + next action

**Classification Classes:**
```
INTERESTED          → wants to discuss, move to negotiation
MAYBE               → interested but needs more info, queue follow-up
EXPENSIVE           → interested but price is high, suggest negotiation
NOT_INTERESTED      → declined, move to no_deal
AUTORESPOND         → auto-reply detected (out of office, etc.), ignore
SPAM_SIGNAL         → looks like spam or phishing, log and skip
```

**Process:**
1. n8n webhook receives Gmail reply, calls `/api/webhooks/gmail`
2. API calls GPT-4o-mini: "Classify this email. Is the sender INTERESTED, MAYBE, EXPENSIVE, NOT_INTERESTED, AUTORESPOND, or SPAM_SIGNAL? Context: I sent a cold outreach about [niche] link insertion. Email: [reply text]. Confidence: 0-1."
3. GPT returns classification + confidence
4. Logged to `messages` table with classification
5. Dashboard alerts user; different classifications trigger different next steps

### Phase 4: Negotiation Engine

**Input:** Reply classification = "EXPENSIVE" (or counteroffer received), contact DA + relationship tier  
**Output:** Counter-offer + message + recommendation (ACCEPT / COUNTER / DECLINE)

**Strategy Lookup:**
Paul queries `negotiation_strategy` table by DA range:
```
DA 70-100: opening -20%, acceptance -10% (premium publisher, higher leverage)
DA 50-69:  opening -30%, acceptance -15% (mid-tier)
DA 30-49:  opening -35%, acceptance -20% (smaller publisher)
DA < 30:   opening -40%, acceptance -25% (low authority, more aggressive)
```

**Negotiation Rules:**
1. Max 4 rounds per contact (prevent endless back-and-forth)
2. Split-difference counter-offer: `our_counter = (their_offer + floor) / 2`
3. If `their_offer ≥ floor`, Paul recommends ACCEPT (deal closes)
4. If `their_offer < floor` and `round < 4`, Paul counters with split-diff
5. If `round ≥ 4` and no agreement, recommend DECLINE

**Example:**
```
Floor: €250, Ceiling: €400, Their offer: €180
→ Open at: €320 (ceiling - 20%)
← Counter from them: €200
→ Split-diff counter: €275 (avg of €200 + €250)
← They accept €275
→ Deal closes at €275 (≥ floor)
```

All rounds logged to `negotiation_rounds` table.

### Phase 5: Deal Closure

**Input:** Agreement reached (agreed price ≥ floor)  
**Output:** Confirmation email + deal record + suggested insertion links

**Process:**
1. Paul sends deal confirmation email: "Thank you for agreeing to €[agreed_price]. Here's the link I'd like you to insert: [3 candidate URLs]. Please confirm insertion by [deadline]."
2. Contact status moves to APPROVED
3. Deal recorded in `approved_deals` table with insertion deadline (7-14 days from now)
4. `link_verifications` table pre-populated with URLs waiting for verification
5. n8n schedules weekly link verification task

---

## Section 4: API Structure

**`/api/contacts` (Contact Management)**

```
GET /api/contacts
  Response: { contacts: Contact[], stats: DashboardStats }
  
GET /api/contacts/[id]
  Response: { contact: Contact }

PATCH /api/contacts/[id]
  Body: { field: value }
  Response: { contact: Contact }

DELETE /api/contacts/[id]
  Response: { deleted: true, domain: string }
```

**`/api/dashboard` (Stats & Metrics)**

```
GET /api/dashboard?range=7d|30d|all
  Response: {
    totalDomains: number,
    averagePrice: number,
    confirmedDeals: number,
    casinoFriendly: number,
    navCounts: { pending, confirmed, followUp }
  }
```

**`/api/paul/qualify` (Domain Scoring)**

```
POST /api/paul/qualify
  Body: {
    domain, domainAuthority, trafficRank, niches, isSpam
  }
  Response: {
    score, category, recommendation,
    factors: { da, traffic, niche, antiSpam }
  }
```

**`/api/paul/generate-outreach` (Email Generation)**

```
POST /api/paul/generate-outreach
  Body: {
    contactId, template, personalization, subjectLineTest?
  }
  Response: {
    subject, body, tone, estimatedOpenRate,
    schedule: { sendAt, delayMinutes }
  }
```

**`/api/paul/classify-reply` (Reply Analysis)**

```
POST /api/paul/classify-reply
  Body: {
    messageId, fromEmail, subject, body, inReplyTo
  }
  Response: {
    classification, confidence, summary, nextAction
  }
```

**`/api/paul/negotiate` (Price Negotiation)**

```
POST /api/paul/negotiate
  Body: {
    negotiationRoundId, theirOffer, floor, ceiling
  }
  Response: {
    counter, strategy, message, maxRounds,
    roundNumber, recommendation
  }
```

**`/api/paul/close-deal` (Deal Finalization)**

```
POST /api/paul/close-deal
  Body: {
    contactId, agreedPrice, insertionDeadline
  }
  Response: {
    deal: { id, status, dealClosedAt, suggestedLinks }
  }
```

**`/api/webhooks/gmail` (Incoming Mail)**

```
POST /api/webhooks/gmail
  Body: {
    messageId, fromEmail, subject, body, timestamp, signature
  }
  Response: { stored: true, classificationQueued: true }
```

**`/api/webhooks/sheets-sync` (Google Sheets Import)**

```
POST /api/webhooks/sheets-sync
  Body: {
    rows: [{ domain, niche, emailAccount, ... }]
  }
  Response: { created: number, skipped: number, errors: [] }
```

**`/api/external/verify-link` (Link Verification)**

```
POST /api/external/verify-link
  Body: {
    dealId, insertedUrl, targetDomain
  }
  Response: {
    status, foundAt, timestamp
  }
```

All mutations trigger Supabase triggers for audit logging.

---

## Section 5: Integrations & External Services

**Gmail API**
- Outgoing: Send outreach emails, deal confirmations
- Incoming: n8n monitors labels, calls webhook on new mail
- Auth: Service account or OAuth token in Supabase secrets
- Rate limit: 250 quota units/user/day (batched respects this)

**Google Sheets**
- Source of truth for domain lists (23 columns)
- n8n syncs every 6 hours (fetches new rows, calls webhook)
- Bidirectional: system writes Status, Date Confirmed, Qualification Score back to sheet
- Prevents manual data entry; all flow through sheet

**OpenAI GPT-4o-mini**
- Email body generation (outreach template)
- Reply classification (INTERESTED / EXPENSIVE / etc.)
- Cost: ~$0.15/domain across entire journey
- Async with fallback to manual review if API fails
- Subject line generation not needed (templates pre-written, A/B test variants)

**n8n Automation**
- Outreach scheduler (30-90 min delays, stagger sends)
- Reply listener (Gmail label monitor, webhook trigger)
- Follow-up queue (7 days after first send, max 3 per contact)
- Link verification (weekly scan for broken placements)
- Sheets sync (every 6 hours, import new domains)

---

## Section 6: n8n Automation Workflows

**Workflow 1: Outreach Scheduler**

Trigger: User clicks "Start Outreach" or Paul autonomous send

1. Read contact + template from API
2. Wait 30-90 min (stagger)
3. Send via Gmail API
4. Log to messages table
5. Set Gmail label "Outreach Pending Reply"

**Workflow 2: Reply Listener**

Trigger: Gmail label "Outreach Responses" receives mail

1. Call `/api/webhooks/gmail` with full email
2. Classification queued async
3. Based on classification:
   - INTERESTED → flag for user
   - MAYBE → queue follow-up 7d
   - EXPENSIVE → flag for negotiation
   - NOT_INTERESTED → move to no_deal
   - AUTORESPOND → ignore
   - SPAM_SIGNAL → blacklist

**Workflow 3: Follow-up Queue**

Trigger: 7 days after first send with no reply, or user triggers

1. Check follow-up count (max 3)
2. If < 3, generate follow-up (warmer tone)
3. Apply 48h delay
4. Send via Gmail

**Workflow 4: Link Verification**

Trigger: Weekly schedule

1. Query approved_deals
2. For each URL, verify live/removed/moved
3. Log to link_verifications
4. Alert user if removed

**Workflow 5: Sheets Sync**

Trigger: Every 6 hours + manual "Refresh"

1. Fetch Google Sheet
2. Diff against DB
3. Call `/api/webhooks/sheets-sync` for new rows
4. Write qualification scores back to sheet

All workflows use webhooks (no direct DB access), fully audit-logged, reversible.

---

## Section 7: Dashboard Pages & User Flows

**Page 1: /dashboard** (Domains Overview) ✅ **Built in Phase 0**

Main entry point. Shows all contacts in table with:
- Collapsed row view (7 key columns)
- Expandable rows for full edit (23 fields)
- Stats cards (total domains, avg price, confirmed, casino-friendly)
- "Start Outreach" button
- "Refresh" button (Sheets sync)

**Page 2: /dashboard/pipeline** (Status-filtered view) — Phase 1+

Kanban board: Pending → Under Negotiation → Approved → No Deal  
Drag-and-drop to move between statuses. Paul auto-updates; user can override.

**Page 3: /dashboard/deals** (Approved deals) — Phase 1+

Shows only APPROVED contacts with:
- Agreed price vs. floor/ceiling
- Negotiation rounds (audit trail)
- Link insertion status
- Payment tracking

**Page 4: /dashboard/templates** (Email template editor) — Phase 1+

Create/edit Standard, Warm, Premium templates. User defines variables + placeholders. Paul chooses template; user can override.

**Page 5: /dashboard/subjects** (A/B test analytics) — Phase 1+

Subject line performance across all outreach. Paul uses this to pick least-sent variant.

**Page 6: /dashboard/integrations** (Gmail + Sheets config) — Phase 1+

OAuth setup for Gmail, Google Sheets, OpenAI. Shows connection status + last sync times.

**Page 7: /dashboard/logs** (Activity audit) — Phase 1+

Raw log of all Paul decisions (qualify, generate, classify, negotiate, close). Filterable by contact, action type, date range. For transparency.

**Page 8: /dashboard/blacklist** (Spam & rejected) — Phase 1+

Shows rejected domains + blacklisted publishers. User can un-blacklist if needed.

**Page 9: /dashboard/settings** (System config) — Phase 1+

- Paul's personality (tone, negotiation aggression)
- Automation rules (auto-send vs. draft-for-review)
- Rate limits (max emails/day, delay between sends)
- API key rotation (Gmail, OpenAI, Sheets)

All pages use same Sidebar + TopBar layout. /dashboard is entry point.

---

## Success Criteria

✅ Complete system design documented  
✅ 17 database tables with clear responsibility separation  
✅ Paul Logic fully specified (5 decision modules)  
✅ API contract defined (8 core routes + webhooks)  
✅ External integrations mapped (Gmail, Sheets, OpenAI, n8n)  
✅ Automation workflows designed (5 core flows)  
✅ Dashboard layout planned (9 pages, 1 complete)  
✅ All decisions logged for audit trail  

---

## Next Steps

**Phase 1 Implementation:** Core Foundation (this builds)
- Domain Qualifier module + test
- Outreach Generator module + test
- Basic API routes + mocking
- Mock email system for testing
- Dashboard integration (call Paul from "Start Outreach")

**Phase 2 Implementation:** Gmail + Reply Pipeline
- Gmail API integration (send + receive)
- Reply Classifier module
- n8n webhook setup
- Reply monitoring in dashboard

**Phase 3 Implementation:** Negotiation & Deal Closure
- Negotiator module
- Deal closure flow
- Link verification setup
- Payment tracking

**Phase 4 Implementation:** Admin Pages & Polish
- Template editor
- A/B test analytics
- Settings + integrations page
- Logs + blacklist pages

---

**Document Status:** ✅ Complete, ready for implementation
