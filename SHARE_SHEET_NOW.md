# ⚠️ NEXT STEP: Share Your Google Sheet

Your credentials are now configured! But your service account needs **Viewer** access to your Sheet.

## Quick Share Instructions

1. **Open your Google Sheet:**
   https://docs.google.com/spreadsheets/d/1ysHB5YNKYNRMbHZviaSP_f9aHQbZGyiRKbaDrKjHHFI

2. **Click Share** (top right corner)

3. **Paste this email:**
   ```
   api-acces@prime-prism-494610-p1.iam.gserviceaccount.com
   ```

4. **Select "Viewer"** (read-only access - that's all it needs)

5. **Click Share** and confirm

---

## Then Test the Sync

1. **Stop the dev server** (Ctrl+C)
2. **Start it again:** `npm run dev`
3. **Open:** http://localhost:3002/dashboard
4. Your contacts should load from the Sheet automatically! 🎉

---

## If it doesn't work

Check the browser console (F12 → Console tab) for error messages. Common issues:

- **"Cannot access Sheet"** → You didn't share it with the service account email
- **"Missing credentials"** → `.env.local` has typos in the email/key
- **No contacts appear** → Sheet is empty or columns are wrong order

Need help? Check the error message in the console!
