# Challenge Handling Design

**Date:** 2026-06-04
**Status:** Approved

## Problem

The Selenium scraper encounters cookie consent banners, Cloudflare Turnstile checkboxes, and CAPTCHA puzzle pages during scraping. Currently:

- Cookie/banner handling is inlined in `scraper.ts` as `handlePageInteractions()` — not reusable
- Cloudflare JS challenge detection is inlined as `isBlocked()` — not reusable
- The return flag is `blocked?: boolean`, which conflates different failure modes
- Puzzle CAPTCHAs (hCaptcha, reCAPTCHA v2, sliders) are not detected at all

## Goal

- Extract all challenge logic into a dedicated `worker/challenges.ts` module
- Dismiss cookie/consent banners reliably on every page load
- Attempt Cloudflare Turnstile checkbox clicks
- Detect any remaining CAPTCHA (JS challenge, hCaptcha, reCAPTCHA, puzzle) and flag the domain for human review
- Replace `blocked?: boolean` with `captchaRequired?: boolean` throughout

## Out of Scope

- Paid CAPTCHA solving APIs (2captcha, CapSolver)
- Retry loops for multi-step challenges
- LinkedIn-specific challenge handling (`linkedin.ts` is unchanged)

---

## Module: `worker/challenges.ts`

### `dismissCookieBanners(driver: WebDriver): Promise<void>`

Two-pass approach per page load:

**Pass 1 — Known framework selectors (direct lookup, fast):**
- `#onetrust-accept-btn-handler` — OneTrust
- `#CybotCookiebotDialogBodyButtonAccept` — CookieBot
- `.cc-accept` — CC Cookie Consent
- `[data-testid="cookie-accept"]` — generic test-id pattern
- `#truste-consent-button` — TrustArc
- `button[id*="accept"]`, `button[id*="cookie"]` — loose ID patterns

**Pass 2 — Text scan fallback:**
Queries all `button, a[role="button"], input[type="submit"], input[type="button"]`.
Matches inner text (or `value` / `aria-label`) against:
```
'allow all', 'accept all', 'accept cookies', 'agree to all',
'i agree', 'agree', 'ok', 'got it', 'allow cookies', 'allow selection',
'accept', 'continue', 'confirm', 'consent', 'i accept', 'yes',
'i am human', "i'm human", 'verify you are human', 'proceed'
```
Clicks the first match, waits 1s. All element-level errors are swallowed.

---

### `handleTurnstile(driver: WebDriver): Promise<void>`

1. Find all `<iframe>` elements
2. For each frame whose `src` contains `cloudflare`, `turnstile`, or `challenge`:
   - Switch context into the frame
   - Attempt clicks on: `input[type="checkbox"]`, `.cf-turnstile-part`, `[id*="challenge"]`
   - Switch back to default content
   - Wait 3s for JS challenge resolution
3. If no matching iframe: no-op
4. Frame-level errors always restore default content before continuing

---

### `detectCaptcha(driver: WebDriver): Promise<boolean>`

Returns `true` if any of the following signals are found:

| Signal | Detection method |
|--------|-----------------|
| CF JS challenge | Body text contains: "just a moment", "checking your browser", "attention required", "enable javascript and cookies", "performing security verification", "sorry, you have been blocked" |
| CF Turnstile unresolved | `<iframe>` with `src` containing `cloudflare`/`turnstile`/`challenge` still present |
| hCaptcha | `<iframe>` with `src` containing `hcaptcha.com` |
| reCAPTCHA v2 | `<iframe>` with `src` containing `recaptcha` AND (`bframe` OR `anchor`) |
| Puzzle/CAPTCHA DOM | Elements matching `.g-recaptcha`, `#hcaptcha`, `[data-sitekey]`, `.captcha-solver` |

---

### `runChallenges(driver: WebDriver): Promise<{ captchaRequired: boolean }>`

Orchestrates in sequence:
1. `await dismissCookieBanners(driver)`
2. `await handleTurnstile(driver)`
3. `const captchaRequired = await detectCaptcha(driver)`
4. Return `{ captchaRequired }`

Called on the homepage only. Subpages call `dismissCookieBanners` directly (no Turnstile check or captcha abort needed for subpages).

---

## Changes to `scraper.ts`

- Remove `handlePageInteractions()` — replaced by `runChallenges()`
- Remove `isBlocked()` — logic moves into `detectCaptcha()`
- Remove local `acceptTexts` constant — moves to `challenges.ts`
- Update return type:
  ```ts
  // before
  ScrapeResult & { blocked?: boolean }
  // after
  ScrapeResult & { captchaRequired?: boolean }
  ```
- After `driver.get(baseUrl)` on the homepage, call `runChallenges(driver)`. If `captchaRequired`, return early with `{ html, text: '', links: [], captchaRequired: true }`
- On subpages, call `dismissCookieBanners(driver)` only (no full challenge run needed)

---

## Changes to `index.ts`

- Destructure `captchaRequired` instead of `blocked`
- Update branch:
  ```ts
  if (captchaRequired) {
    await markLeadDataCollected(..., 'Captcha Required')
    await sb.from('lead_jobs').update({ status: 'needs_review', ... })
    console.log(`[worker] ${job.domain} → captcha required`)
    return
  }
  ```
- DB `status` stays `needs_review` (unchanged)

---

## No Changes

- `worker/linkedin.ts` — not affected
- `worker/index.ts` DB schema — `needs_review` status is reused
- Google Sheets column — message text changes from `'Blocked by Cloudflare'` to `'Captcha Required'`
