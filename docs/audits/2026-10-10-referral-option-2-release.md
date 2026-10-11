# Approved referral option 2 — October 10, 2026

User selected option 2 from eight rendered concepts. Implement the supplied dollar bill first, floating black “Connect Discord & get my link” action, “Earn $20” and short VIP eligibility hint, with centered Program Rules at the bottom. Preserve the actual shared header, ticker, footer and existing account/billing/payout integrations.

## Changes

- `refer.html`: replaced long hero and CASH REWARD/numbered card with bill-led approved layout; rules collapse into a native accessible disclosure. Expanded terms retain active/legacy/complimentary VIP, US/age eligibility, qualifying $32.99 purchase/renewal/no-trial, verification/seven-day hold, exclusions, Stripe and taxes. Collapsed terms still show eligible paid referrals and the seven-day hold. No additional referral form.
- `referral.css`: scoped selected composition, intrinsic black action/20px icon, balanced inset, responsive 680px cap, deliberate bill/button overlap, centered headings and rules. Keep existing shared font/shell. Smooth chevron and native intrinsic-size disclosure enhancement with reduced-motion/fallback support.
- `referral-production.js`: on a valid returned code, hide onboarding hero and focus/show link-ready panel. Personal link, copy, auth URL cleanup, Stripe onboarding and setup status behavior retained. Copy confirmation resets to “Copy my link.” No backend eligibility or payout changes.
- `scripts/referral-presentation.test.mjs`: local guard, valid and invalid callbacks, copy content, payout auth routing, URL cleanup and setup complete/refresh messages. Other existing secure-onboarding/payout tests run unchanged.

## Verification

Populated browser at exact 320, 390 and 1440 CSS widths: no page overflow; header first and top zero; bill loaded; login text+arrow fit parent using Range bounds, icon 20px, action height 52px. Opened/closed rules at all widths. Callback fixture showed correct link-ready state and removed onboarding at all widths, correct link and cleaned callback hash; no real account/payment connection. Fixture worker origin is example.invalid and public promotion disabled to match /refer; excluded by public whitelist. Focus moves to informational heading without an action-style outline; interactive controls retain visible focus.

Relevant targeted tests: 51 pass, zero failures. No real OAuth authorization or payout executed. Preview protects real referral controls. Evidence: `outputs/referral-option-2-release/` with logged-out, expanded, callback and measurements. Release/live checks appended below.

## Published

Cloudflare public-only version `3a519772-24a4-4cbd-95c5-11b2829cb768`; only refer.html/referral.css/referral-production.js uploaded. Live button entered discord.com OAuth; no authorization/payout was submitted. Live header/order, action fit, closed rules and preview-notice suppression passed. Live-origin 75% zoom required physical viewport 240/293/1080 for CSS widths 320/391/1440; exact local 390 checked separately. Temporary viewport reset. Existing native rules opened/closed with Enter, without overflow; intrinsic-size support confirmed in test browser, reduced motion guarded. No backend workers changed.
