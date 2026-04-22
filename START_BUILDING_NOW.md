# 🚀 LINKOPS - START BUILDING NOW

You've downloaded the files to VS Code. Here's exactly what to do next.

---

## STEP 1: Open Terminal in VS Code (2 minutes)

```bash
# Press Ctrl+` (backtick) to open terminal in VS Code

# Or: Terminal → New Terminal

# You should see something like:
# ~/linkops $
```

---

## STEP 2: Install Dependencies (3 minutes)

```bash
npm install
```

**What it does:**
- Downloads all required packages (Next.js, React, Supabase, etc.)
- Creates `node_modules` folder
- Sets up development environment

**Output should show:**
```
added 300+ packages in 2m
```

**If you get errors:**
```bash
# Make sure you have Node.js 18+ installed
node --version

# If version is too old, update from https://nodejs.org
```

---

## STEP 3: Create Environment Variables (5 minutes)

```bash
# Copy the example file
cp .env.example .env.local
```

**What this does:**
- Creates `.env.local` file with all variables you need
- `.env.local` is where your secrets go (Git ignores it)

**Next, edit `.env.local`:**

1. In VS Code, open `.env.local`
2. You'll see this:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
... etc
```

**For now**, leave them as placeholders. We'll fill them in later when you get API keys.

---

## STEP 4: Start Development Server (1 minute)

```bash
npm run dev
```

**What happens:**
- Starts Next.js dev server
- Watches for file changes
- Shows any errors real-time

**Output should show:**
```
> next dev

  ▲ Next.js 14.0.0
  - Local:        http://localhost:3000
  - Environments: .env.local

✓ Ready in 2.3s
```

**If you see errors:**
- Check `npm install` completed successfully
- Make sure no other app is using port 3000

---

## STEP 5: Open Dashboard in Browser (1 minute)

```
Visit: http://localhost:3000
```

**You should see:**
- LinkOps landing page
- "Launch Dashboard" button
- Features overview

**If you get an error:**
- Wait a few seconds for dev server to fully start
- Refresh the page
- Check terminal for error messages

---

## STEP 6: Open Dashboard

Click "Launch Dashboard" button or go to:

```
http://localhost:3000/dashboard
```

**You'll see:**
- Dashboard with 0 stats (no database yet)
- "RUN PAUL" button
- Empty contact list

**This is normal!** We haven't connected the database yet.

---

## NEXT: Get API Keys (30 minutes)

Now you need to set up 5 API integrations. Follow the SETUP_CHECKLIST.md in order:

### 1. **Supabase Database** (5 min)
- Go to https://supabase.com
- Sign up (free)
- Create new project
- Get your URL & API keys
- Add to `.env.local`

### 2. **Claude API Key** (2 min)
- Go to https://console.anthropic.com
- Create API key
- Add to `.env.local`

### 3. **Gmail API** (10 min)
- Go to https://console.cloud.google.com
- Create project
- Enable Gmail API
- Create OAuth2 credentials
- Get client ID/secret
- Add to `.env.local`

### 4. **Google Sheets API** (5 min)
- Create service account
- Download JSON
- Add to `.env.local`

### 5. **Generate Security Tokens** (1 min)
```bash
# Generate random strings for CRON_SECRET and JWT_SECRET
# Use an online random generator or:
# macOS/Linux:
openssl rand -base64 32

# Windows: Use https://generate-random.org/
```

---

## AFTER: Set Up Database (5 minutes)

1. In Supabase dashboard, go to SQL Editor
2. Copy entire contents of: `supabase/migrations/001_initial_schema.sql`
3. Paste into SQL Editor
4. Run it

**This creates:**
- `contacts` table (327 rows)
- `messages` table (all emails)
- `deals` table (closed agreements)
- Indexes and functions

---

## THEN: Test Your Setup (5 minutes)

Go back to VS Code and test:

```bash
# Open terminal (Ctrl+`)

# Test if database works
curl http://localhost:3000/api/contacts

# Should return:
# {"success":true,"data":[]}
# (empty because no contacts yet)

# Test health check
curl http://localhost:3000/api/health

# Should show:
# {"status":"healthy",...}
```

---

## NOW YOU'RE READY TO USE CLAUDE! 🧠

Open CLAUDE_PROMPT.md and follow these steps:

### Option 1: Copy Full Context
```
1. Open CLAUDE_PROMPT.md in VS Code
2. Select all (Ctrl+A)
3. Copy (Ctrl+C)
4. Open Claude in VS Code (with Claude extension)
5. Paste the entire prompt
6. Say: "This is my project context. Help me with [task]"
```

### Option 2: Use Quick Reference
```
1. Open CLAUDE_QUICK_REFERENCE.md
2. Find the template for what you need
3. Copy and fill in details
4. Paste into Claude chat
5. Get instant help!
```

### Option 3: Ask Claude About Your Code
```
1. Highlight code in VS Code
2. Click Claude icon
3. Ask: "Add error handling to this" or "Explain this function"
4. Claude gives context-aware responses!
```

---

## COMMON FIRST TASKS

### Task 1: Import Test Contacts
```bash
# Create a test contact via API
curl -X POST http://localhost:3000/api/contacts \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "domain": "example.com",
    "name": "John Doe",
    "category": "business",
    "da": 35,
    "status": "unsent"
  }'

# Go to http://localhost:3000/dashboard
# You should see it in the list!
```

### Task 2: Test Paul Outreach
```bash
# Create a few test contacts first (see above)

# Then trigger outreach
curl -X POST http://localhost:3000/api/paul/send-outreach

# This will:
# - Get all 'unsent' contacts
# - Send emails (if Gmail configured)
# - Update database
```

### Task 3: Add New Feature
```
1. Open CLAUDE_QUICK_REFERENCE.md
2. Find "ADDING NEW API ENDPOINT" template
3. Fill in your details
4. Paste into Claude
5. Get complete, working code!
```

---

## TROUBLESHOOTING

### "npm install failed"
```bash
# Clear npm cache
npm cache clean --force

# Try again
npm install
```

### "Port 3000 already in use"
```bash
# Use different port
npm run dev -- -p 3001
# Visit http://localhost:3001
```

### "Cannot find module"
```bash
# Reinstall dependencies
rm -rf node_modules
npm install
```

### "Database connection error"
```bash
# Check .env.local has correct Supabase keys
# Verify database was created
# Test with: curl http://localhost:3000/api/health
```

### "Claude API not working"
```bash
# Check CLAUDE_API_KEY in .env.local
# Verify key is correct from Anthropic console
# Check billing on Anthropic account
```

---

## YOUR DEVELOPMENT WORKFLOW

From here on, this is how you build:

### 1. **Ask Claude What to Build**
   - Use CLAUDE_QUICK_REFERENCE.md templates
   - Give clear requirements
   - Claude gives you code

### 2. **Copy Claude's Code**
   - Paste into appropriate file
   - Save (auto-format with Prettier)
   - Errors show in VS Code

### 3. **Test Your Changes**
   - Dev server auto-refreshes
   - Check browser/terminal for errors
   - Test with curl if it's an API

### 4. **Ask Claude to Debug**
   - Copy error message
   - Ask Claude "what's wrong with this"
   - Claude explains and fixes it

### 5. **Deploy When Ready**
   - `git add .`
   - `git commit -m "message"`
   - `git push origin main`
   - Vercel auto-deploys!

---

## TIPS FOR SUCCESS

1. **Keep CLAUDE_PROMPT.md open** as reference while coding
2. **Use CLAUDE_QUICK_REFERENCE.md** to ask Claude questions
3. **Start small** - build one feature at a time
4. **Test with curl** before testing in browser
5. **Check documentation** before asking Claude
6. **Save often** - VS Code auto-formats on save

---

## WHAT TO BUILD FIRST

### Option A: Quick Win (Today)
1. Add 10 test contacts via API
2. See them in dashboard
3. Test the "Run Paul" button
4. Celebrate! 🎉

### Option B: Full Setup (This Week)
1. Get all 5 API keys
2. Set up database
3. Import real contacts
4. Launch first campaign
5. Monitor results

### Option C: Custom Feature (Your Choice)
1. Open CLAUDE_PROMPT.md
2. Find your feature
3. Ask Claude for code
4. Implement it
5. Test thoroughly

---

## NEXT 5 MINUTES

```bash
# 1. Make sure dev server is running
npm run dev

# 2. Visit dashboard
# Open browser: http://localhost:3000/dashboard

# 3. Test API
curl http://localhost:3000/api/health

# 4. If all works, open CLAUDE_PROMPT.md
# and ask Claude to help you with something!

# 5. You're building! 🚀
```

---

## YOU'RE READY!

You now have:
✅ Development server running  
✅ Dashboard accessible  
✅ API endpoints working  
✅ Claude context loaded  
✅ Documentation ready  

**Next step**: Get API keys and start building with Claude!

---

## Quick Reference Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Type check
npm run type-check

# Lint code
npm run lint

# Test API endpoint
curl http://localhost:3000/api/contacts

# Create test contact
curl -X POST http://localhost:3000/api/contacts \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com",...}'
```

---

## Need Help?

1. **Setup questions** → Read SETUP_CHECKLIST.md
2. **API questions** → Read API_DOCUMENTATION.md
3. **Database questions** → Check types/index.ts
4. **Coding questions** → Ask Claude using CLAUDE_PROMPT.md
5. **Deployment** → Read DEPLOYMENT.md

Everything is documented!

---

**Happy building! 🚀 Start with Step 1 above and let me know when you get stuck!**
