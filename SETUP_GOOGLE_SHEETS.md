# 🚀 Google Sheets Setup Checklist

Your dashboard is now ready to sync with your Google Sheet!

**Your Sheet:** https://docs.google.com/spreadsheets/d/1ysHB5YNKYNRMbHZviaSP_f9aHQbZGyiRKbaDrKjHHFI/edit

---

## ✅ Step 1: Create Google Service Account (5 min)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a **new project** or select existing
3. Go to **APIs & Services → Library**
4. Search for `Google Sheets API` → click **Enable**
5. Go to **APIs & Services → Credentials**
6. Click **+ Create Credentials → Service Account**
7. Fill in name (e.g., "LinkOps Dashboard"), click **Create and Continue**
8. Skip "Grant this service account access", click **Continue**, then **Create**
9. Open the created service account → **Keys** tab
10. Click **+ Add Key → Create new key → JSON**
11. Save the JSON file (you'll need it next)

---

## ✅ Step 2: Extract Credentials from JSON File

Open the JSON file you just downloaded. Find and copy:

```json
"client_email": "service-account-xyz@project.iam.gserviceaccount.com",
"private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvAI...\n-----END PRIVATE KEY-----\n"
```

---

## ✅ Step 3: Add to `.env.local`

In your project root, open or create `.env.local` and add these lines:

```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL=YOUR_CLIENT_EMAIL_HERE
GOOGLE_PRIVATE_KEY="YOUR_PRIVATE_KEY_HERE"
GOOGLE_SHEET_ID=1ysHB5YNKYNRMbHZviaSP_f9aHQbZGyiRKbaDrKjHHFI
GOOGLE_SHEET_TAB=Sheet1
```

**Important formatting for `GOOGLE_PRIVATE_KEY`:**
- The key spans multiple lines in the JSON file
- Keep the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines
- Replace line breaks with `\n` (the JSON already does this)
- Wrap the entire value in double quotes

**Example:**
```bash
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQE\nFAASCBKcwggSjAgEAAoIBAQC7Vj...\n-----END PRIVATE KEY-----\n"
```

---

## ✅ Step 4: Share Your Sheet with the Service Account

1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1ysHB5YNKYNRMbHZviaSP_f9aHQbZGyiRKbaDrKjHHFI
2. Click **Share** (top right)
3. Paste the `client_email` from Step 2
4. Select **Viewer** (read-only access)
5. Click **Share**

---

## ✅ Step 5: Restart Dev Server & Test

1. **Save `.env.local`**
2. **Stop the dev server** (Ctrl+C)
3. **Start it again:** `npm run dev`
4. **Open dashboard:** http://localhost:3002/dashboard
5. You should see your Sheet contacts loaded automatically! ✨

---

## What Happens Next

✅ Dashboard auto-loads contacts from your Sheet on page open  
✅ Click **🔄 Sync Sheet** button to refresh manually anytime  
✅ Shows "⏳ Syncing..." while fetching  
✅ Falls back to mock data if sync fails (no crash)  

---

## Your Sheet Column Mapping

The app maps your Sheet columns like this:

| Column | Field | Expected Format |
|--------|-------|-----------------|
| A | Domain | text (e.g., example.com) |
| B | Niche | text |
| C | Price from Backlinker - In Euro | number |
| D | Email 1 | email |
| E | Name | text |
| F | Email 2 | email (optional) |
| G | Name | text (optional) |
| H | Email 3 | email (optional) |
| I | Name | text (optional) |
| J | Status | pending, confirmed, no_deal, negotiation, follow_up |
| K | Email Account | email |
| L | Currency | EUR, USD, etc. |
| M | Standard Price | number |
| N | Gambling Price | number |
| O | Negotiated Price (Gambling) | number (optional) |
| P | Accept Casino | TRUE or FALSE |
| Q | Accept Betting | TRUE or FALSE |
| R | Sponsored | TRUE or FALSE |
| S | Link Term | text |
| T | Date Confirmed | date or empty |
| U | Notes | text |
| V | Content Guidelines | text |
| W | Reply | yes, no, pending |

---

## Troubleshooting

### "Sheet ID not configured"
→ Check `.env.local` has `GOOGLE_SHEET_ID` line  
→ Restart dev server

### "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY"
→ Verify both lines exist in `.env.local`  
→ Check no typos in variable names  
→ Restart dev server

### "Failed to sync from Sheet"
→ Verify service account email can access the Sheet (did you share it?)  
→ Check Google Sheets API is enabled in your GCP project  
→ Look at browser console (F12 → Console tab) for detailed error

### Dashboard loads but no contacts appear
→ Check your Sheet has data in Row 2+  
→ Verify columns are in the right order (A-W)  
→ Click **Sync Sheet** button to manually retry

---

## Done! 🎉

Once you complete these 5 steps, your dashboard will pull live contact data from your Google Sheet every time you open it or click **Sync Sheet**.

**Questions?** Check `docs/GOOGLE_SHEETS_SYNC.md` for more details.
