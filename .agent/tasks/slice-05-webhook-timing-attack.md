---
slice: 05
title: Fix timing attack in webhook signature verification
priority: MEDIUM
effort: XS
status: pending
parallel-with: 04, 06, 07, 08
---

# Slice 05 — Webhook Timing Attack Fix

## Problem

`verifyWebhookSignature` in `lib/integrations/gmail.ts` (line 162):
```ts
return signature === expectedSignature
```

JavaScript `===` string comparison is not constant-time. An attacker can measure response time differences to brute-force the HMAC signature byte by byte.

## Fix

Replace with `crypto.timingSafeEqual()`:

```ts
import * as crypto from 'crypto'

// Replace line 162:
const sigBuf = Buffer.from(signature)
const expBuf = Buffer.from(expectedSignature)
if (sigBuf.length !== expBuf.length) return false
return crypto.timingSafeEqual(sigBuf, expBuf)
```

`crypto` is already imported in this file (line 3).

## Files to Change

- `lib/integrations/gmail.ts` lines 161–163
