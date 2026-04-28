# Outreach Management System Spec

## Overview
Build a Next.js app deployed on Vercel using Google Sheets as DB and Resend for email outreach.

---

## Google Sheets Structure

### Sheet: Outreach
Columns:
Domain | Email | Name | Status | Last Sent | Notes

Rules:
- One row = one contact
- Status values:
  - pending
  - sent
  - replied
  - failed

---

## Frontend

### Page: /outreach
- Show only:
  - pending
  - sent

- Display:
  - Name
  - Email
  - Domain
  - Status badge

---

## Backend

### API: /api/send
- Fetch sheet
- Filter pending
- Send 5 emails per run
- Use Resend
- Update status → sent

---

## Automation
- Vercel cron every 10 minutes

---

## Requirements
- Use fetch
- Use env variables
- Clean code
- Production-ready