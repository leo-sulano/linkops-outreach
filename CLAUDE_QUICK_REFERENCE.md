# Quick Claude Prompt Reference for LinkOps

## Copy & Paste These Into Claude Chat

---

### 🚀 STARTING WORK

```
I'm working on LinkOps - an AI-powered link insertion outreach platform.

Context: 
- Next.js 14, TypeScript, Supabase, Claude API
- Paul AI Agent (email outreach + negotiation)
- Al Content Agent (article generation)
- Vercel Cron Jobs for automation
- 3 tables: contacts, messages, deals

Help me with: [describe task]
```

---

### 🔧 ADDING NEW API ENDPOINT

```
I need to add a new API endpoint for [feature description].

Requirements:
- Endpoint: POST /api/[name]
- Input: [describe fields]
- Output: [describe response]
- Database: [which table to query/update]
- Auth: [needs cron secret?]

Please create the endpoint following LinkOps patterns.
```

---

### 🤖 CLAUDE API INTEGRATION

```
I need to call Claude API for [task description].

Context:
- It's for: Paul negotiation / Al content creation / [other]
- Input data: [what info available]
- Expected output: [what should Claude return]
- System prompt should: [specific instructions]

Please create the function in lib/claude.ts with error handling.
```

---

### 📧 GMAIL INTEGRATION

```
I need to [send email / check replies / other Gmail task].

Details:
- Gmail operation: [what to do]
- Trigger: [when should this happen]
- Template: [existing or new]
- Error handling: [important constraints]

Please write the function using gmail.ts patterns.
```

---

### 📊 DATABASE QUERY

```
I need to [query / update / insert] data in [table name].

Conditions:
- Filter by: [status, date, etc]
- Update fields: [which fields to change]
- Return: [what data needed]

Please write the query following db.ts patterns.
```

---

### 🔄 GOOGLE SHEETS SYNC

```
I need to [add field to / change columns in / update] Google Sheets sync.

Current:
- Sheets columns: A-AB (as documented)
- Contact fields synced: [list current]

New requirement:
- Add field: [new field name]
- Column position: [where in A-AB]
- Data type: [string, number, date, etc]

Please update lib/sheets.ts accordingly.
```

---

### 🎯 DEBUGGING API

```
My [endpoint name] is returning [error or unexpected behavior].

Code location: pages/api/[path].ts
Error message: [full error text]
Steps to reproduce: [what causes it]
Environment: [local or production]

Debug this and suggest fixes.
```

---

### 📈 DASHBOARD UPDATE

```
I need to update the dashboard to [show new metric / add feature / change layout].

Current:
- Component: pages/dashboard/index.tsx
- What's shown: [current stats/features]

New requirement:
- Display: [new information]
- How: [graph, number, table, etc]
- Data source: [which API endpoint]

Please write the component code.
```

---

### ✅ DATABASE MIGRATION

```
I need to [add new field / create new table / modify schema].

Current schema:
- Table: [table name]
- Current fields: [list fields]

New requirement:
- Add field: [field name and type]
- Indexes needed: [on which fields]
- Relationships: [to other tables]

Please write the SQL migration.
```

---

### 🔐 SECURITY ISSUE

```
I need to [fix security issue / review auth / add validation].

Issue: [describe problem]
Impact: [what could go wrong]
Current code: [relevant snippet or file path]

Please review and provide secure solution.
```

---

### ⚡ CRON JOB

```
I need to create/fix a cron job for [task description].

Schedule: [when should it run]
What it does: [specific operations]
Data flow: [input → process → output]
Current status: [working/broken/needs work]

Please create/fix the endpoint and update vercel.json.
```

---

### 📱 FRONTEND FEATURE

```
I need to add [UI feature / button / form / modal] to [page].

Purpose: [what user wants to do]
Action: [what happens when clicked/submitted]
Data needed: [what API to call]
Success/error: [how to show result]

Please write the React component code.
```

---

### 🧪 TESTING

```
I need to test [endpoint / feature / integration].

Test type: [unit / integration / manual]
What to test: [specific functionality]
Expected result: [what should happen]
Tools: [curl / Postman / Jest / other]

Please provide test commands or code.
```

---

### 📚 CODE REVIEW

```
Please review this code for:
- TypeScript correctness
- Error handling
- Security issues
- Performance
- LinkOps patterns

[Paste code here]
```

---

### 🚀 DEPLOYMENT PREP

```
I'm ready to deploy to production.

Checklist:
- [ ] All env vars configured
- [ ] Database migrations run
- [ ] APIs tested locally
- [ ] Cron jobs configured

Please give me the final deployment checklist and steps.
```

---

## CONTEXT TO PROVIDE

### Always Include
- What file you're in (e.g., `pages/api/paul/negotiate.ts`)
- What you're trying to do
- What's currently happening
- What should happen instead

### For Errors
- Full error message
- Stack trace if available
- Environment (local/production)
- Recent changes made

### For Features
- User action that triggers it
- Expected result
- Data sources needed
- Related endpoints

---

## EXAMPLE FULL PROMPT

```
I'm working on LinkOps in VS Code. I need to add a new field "publisher_notes" to the contacts table.

Current status:
- Field should store text notes from publishers
- Display in dashboard contact detail view
- Include in Google Sheets sync
- Should be optional (nullable)

What I've done:
- Created database column (contacts table)
- Updated Contact interface in types/index.ts

What I need:
1. Update contacts GET endpoint to return publisher_notes
2. Update contacts PATCH endpoint to accept publisher_notes
3. Add publisher_notes to Google Sheets sync (new column AC)
4. Show it in dashboard (read-only for now)

Please help me with these updates, making sure to follow LinkOps patterns.
```

---

## SHORTCUTS

### Quick API Test
```
I want to test if my endpoint works. 

Endpoint: POST /api/[name]
Sample input: [paste JSON]
Expected output: [describe response]

Give me the curl command to test.
```

### Quick Type Check
```
Does this TypeScript look right?

[paste code snippet]

Check types and lint it.
```

### Quick DB Query
```
I need to get [what data] from [table] where [conditions].

Write the Supabase query using db.ts patterns.
```

---

## MORE CONTEXT FILES

Keep these handy for reference:
- `/CLAUDE_PROMPT.md` - Full architecture & patterns
- `/API_DOCUMENTATION.md` - All endpoints & examples
- `/types/index.ts` - All TypeScript interfaces
- `/lib/db.ts` - Database query patterns
- `/lib/claude.ts` - Claude API patterns
- `/pages/api/` - Example endpoints

---

## TIPS FOR BEST RESULTS

1. **Be specific**: Say exactly which file/feature
2. **Show code**: Paste what you have, not just description
3. **Show errors**: Include full error messages
4. **Ask one thing**: Focus on single feature/fix per prompt
5. **Provide context**: Remind me of LinkOps architecture if needed
6. **Use file paths**: Reference `pages/api/` not just "the endpoint"
7. **State your goal**: What are you ultimately trying to build?

---

**Pro tip**: Copy the "STARTING WORK" prompt at the top into Claude whenever you start a new coding session. It sets the context for everything you ask!
