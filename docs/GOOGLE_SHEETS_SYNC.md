# Google Sheets Sync Setup Guide

The LinkOps dashboard now syncs contact data from your Google Sheet. The Sheet is the **source of truth** — the dashboard pulls contacts from it automatically on page load and when you click **Sync Sheet**.

---

## Setup (One-Time)

### 1. Create Google Cloud Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select existing)
3. Go to **APIs & Services → Library**
4. Search for **Google Sheets API** → click **Enable**
5. Go to **APIs & Services → Credentials**
6. Click **+ Create Credentials → Service Account**
7. Fill in name, click **Create and Continue**
8. Skip "Grant this service account access" (optional), click **Continue**
9. Click **Create Key → JSON** → save the file

### 2. Extract Credentials

Open the downloaded JSON file and copy:

- `client_email` (looks like `service-account-xyz@project.iam.gserviceaccount.com`)
- `private_key` (starts with `-----BEGIN PRIVATE KEY-----`)

### 3. Add to `.env.local`

Open `.env.local` in the project root and add:

```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account_email@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_ID=your_sheet_id_here
GOOGLE_SHEET_TAB=Sheet1
```

**Finding the Sheet ID:**
- Open your Google Sheet
- Copy the ID from the URL: `https://docs.google.com/spreadsheets/d/**SHEET_ID**/edit`

**Private Key Formatting:**
- The key spans multiple lines in the JSON
- Replace actual newlines with `\n` escape sequences
- Wrap the entire key in double quotes
- Keep the `-----BEGIN` and `-----END` lines

### 4. Share the Sheet with the Service Account

1. Open your Google Sheet
2. Click **Share** (top right)
3. Paste the `client_email` from step 2
4. Give it **Viewer** access
5. Click **Share**

---

## Sheet Column Layout

Your Google Sheet should have this header row (Row 1):

| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Domain | Email | Name | Niche | Standard Price | Gambling Price | Price From Backlinker | Currency | Status | Accept Casino | Accept Betting | Sponsored | Link Term | Email 2 | Name 2 | Email 3 | Name 3 | Notes | Content Guidelines |

**Important:**
- Row 1 is always treated as headers
- Data starts from Row 2
- Empty rows are skipped
- Column order matters — data must be in this exact order
- Booleans: use `TRUE` or `FALSE` (all caps)
- Numbers: plain numbers (e.g., `500`, `2.5`)
- Status: `pending`, `confirmed`, `no_deal`, `negotiation`, or `follow_up`

**Example Row:**
```
| example.com | john@example.com | John Doe | Tech | 500 | 750 | 300 | EUR | pending | TRUE | FALSE | FALSE | 6 months | jane@example.com | Jane Smith | | | Check homepage | No gambling links |
```

---

## Usage

### Auto-Load on Page Open
When you open the dashboard (`/dashboard`), it automatically fetches contacts from your Sheet.

You'll see:
- ⏳ **Syncing...** while loading
- Contact list appears once loaded
- If sync fails, it falls back to mock data (no crash)

### Manual Sync
Click the **🔄 Sync Sheet** button in the top bar anytime to refresh from the Sheet.

---

## Troubleshooting

### "Sheet ID not configured"
- Check `.env.local` has `GOOGLE_SHEET_ID=your_id`
- Restart the dev server after changing `.env.local`

### "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY"
- Verify both env vars are set
- Check that newlines in the private key are escaped as `\n`
- Restart the dev server

### "Failed to sync contacts"
- Check that the service account email can access the Sheet (you shared it, right?)
- Verify the Sheet ID is correct
- Ensure Google Sheets API is enabled in your GCP project
- Check browser console for detailed error

### Dashboard loads but no contacts appear
- Check the Sheet has data (header row + at least 1 data row)
- Make sure columns are in the right order
- Click **Sync Sheet** button to manually retry

---

## Advanced: Change Sheet or Tab

To sync from a different Sheet or tab:

1. Update `.env.local`:
   ```bash
   GOOGLE_SHEET_ID=new_sheet_id
   GOOGLE_SHEET_TAB=YourTabName
   ```
2. Save and restart dev server
3. Dashboard will pull from the new Sheet

---

## Notes

- **Read-only**: The app only *reads* from the Sheet. Changes on the dashboard don't write back to the Sheet (yet).
- **No caching**: Each sync fetches fresh data from the Sheet.
- **Fallback**: If Sheet sync fails, the dashboard uses mock data so you can still work offline.
- **Security**: Service account credentials only have **Viewer** access to your Sheet (safe).
