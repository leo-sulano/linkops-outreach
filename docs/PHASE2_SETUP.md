# Phase 2 Setup Guide

LinkOps Phase 2 requires real API credentials for Supabase, Gmail, and OpenAI. This guide walks through the setup process.

## Prerequisites

You need accounts/projects for:
- **Supabase** — PostgreSQL database
- **Gmail API** — Google Cloud service account
- **OpenAI API** — GPT-4o-mini access

## Setup Steps

### 1. Supabase Project

1. Go to supabase.com
2. Create a new project (free tier works fine)
3. Copy your Project URL and Anon Key from Settings → API
4. Create all 17 tables (see architecture spec in `docs/superpowers/specs/2026-04-22-linkops-phase-2-design.md` Section 2)

### 2. Gmail API Credentials

1. Go to Google Cloud Console (console.cloud.google.com)
2. Create a new project
3. Enable Gmail API
4. Create a Service Account (Credentials → Create Credentials → Service Account)
5. Download the JSON key file
6. Keep the JSON credentials safe — add to `.env.local`

### 3. OpenAI API Key

1. Sign up at openai.com
2. Go to API keys (platform.openai.com/account/api-keys)
3. Create a new API key
4. Verify you have GPT-4o-mini access or upgrade if needed

### 4. Environment Configuration

Create `.env.local` with:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
GMAIL_SERVICE_ACCOUNT={"type":"service_account","project_id":"...","private_key":"..."}
OPENAI_API_KEY=sk-...
GMAIL_WEBHOOK_SECRET=your-random-secret-string
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
```

### 5. Run Tests

```bash
npm test
```

Expected: All unit tests pass (Supabase, Gmail, OpenAI validation tests)

### 6. Run Dev Server

```bash
npm run dev
```

Navigate to http://localhost:3009/dashboard (or next available port)

## Troubleshooting

**"Missing SUPABASE_URL or SUPABASE_KEY"**
- Verify `.env.local` has exact values from Supabase dashboard
- Check file is named `.env.local` (not `.env` or `.env.example`)

**"Gmail authentication failed"**
- Verify service account JSON is valid
- Check Gmail API is enabled in GCP project
- Verify private key in JSON matches what Google provided

**"OpenAI API key invalid"**
- Key must start with `sk-`
- Check you have API credits remaining
- Test key at platform.openai.com/account/api-keys

**"Port 3009 (or other) is in use"**
- Next.js will automatically try the next available port
- Check the terminal output for actual port
- Or kill the process: `lsof -i :3009 | grep LISTEN | awk '{print $2}' | xargs kill`

## Database Schema

Phase 2 requires these Supabase tables:

**Core:**
- `contacts` — domains, emails, status
- `users` — dashboard users
- `contacts_metadata` — DA, traffic, niche scores
- `relationships` — relationship tiers
- `blacklist` — blocked domains

**Messages:**
- `messages` — email history
- `message_classifications` — reply analysis
- `templates` — saved email templates
- `automations` — scheduled rules

**Negotiation:**
- `negotiation_rounds` — price negotiation state
- `deal_outcomes` — closed deals
- `follow_ups` — reminders

**Links:**
- `link_placements` — placed links
- `link_verification_logs` — verification history
- `analytics` — traffic/ranking impact

**Admin:**
- `api_logs` — request audit trail
- `settings` — system config

See full schema in `docs/superpowers/specs/2026-04-22-linkops-phase-2-design.md` Section 2.

## API Endpoints (Phase 2)

### POST /api/paul/qualify

Qualifies a domain and saves score to database.

Request:
```json
{
  "domain": "example.com",
  "domainAuthority": 65,
  "trafficPercentile": 4.2,
  "niche": "tech"
}
```

Response:
```json
{
  "success": true,
  "domain": "example.com",
  "score": 72,
  "category": "warm",
  "contactId": "uuid"
}
```

### POST /api/paul/generate-outreach

Generates email using OpenAI and logs to messages table.

Request:
```json
{
  "domain": "example.com",
  "niche": "tech",
  "contactName": "John",
  "relationshipTier": "new",
  "priceRange": "500-1000"
}
```

Response:
```json
{
  "success": true,
  "subject": "Link Opportunity for Example",
  "body": "Generated email text...",
  "messageId": "msg-123",
  "tone": "new"
}
```

### POST /api/webhooks/gmail

Receives incoming email notifications from Gmail.

## Next Steps

**Phase 3** will add:
- Reply classification (analyze incoming emails)
- Price negotiation logic
- Link verification (weekly checks)
- n8n automation workflows

See `docs/superpowers/specs/2026-04-22-linkops-architecture.md` for full system architecture.
