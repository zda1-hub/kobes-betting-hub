# Conversion tracking inventory and release plan — October 8, 2026

## Site and existing systems

The site is static HTML/JavaScript built into a Cloudflare Worker public asset bundle by `scripts/prepare-public-site.mjs`. It is not an SPA. The checkout Worker handles Discord authorization, Stripe checkout, membership access, Supabase analytics, and the private dashboard. The publisher Worker handles free-pick and email-list forms. There is no booking or consultation system, so booking metrics are inapplicable.

Before this change, the first-party system tracked browsing sessions, pages, join views, coarse engagement and click position, offer selected, Discord verified, checkout started, Stripe payment completed, and VIP activated. Meta Pixel tracked public page views, checkout intent, and Stripe-verified purchase on the welcome page. The free-pick form also had a separate operational event log. There was no GA4/GTM/Google Ads integration, no named CTA/form events in the main dashboard, and no site tracking preference.

## Page and conversion inventory

| Pages | Conversion paths and interactions |
| --- | --- |
| `/`, `/free-pick` | VIP link, free Discord, free-pick gate, legacy email signup, free-pick VIP CTA, results/proof and explainer links |
| `/join`, `/membership` | Four paid-plan buttons (first month, starter, six month, annual), referral variant, Discord connection, referral link, manage membership |
| `/refer` | Referral program entry and Discord sign-in |
| `/proof`, `/results`, `/recaps`, `/exclusives`, `/approach`, `/faq`, `/support`, `/guides/*` | Header/footer joins, free Discord and social links, proof/details, support mailto and navigational links |
| `/cancel`, `/welcome` | Member billing/connection and feedback; welcome purchase only after verified receipt from the Worker. These are not acquisition pages. |
| Private admin/member/partner/creator pages | Excluded from public marketing tracking. |

Shared header, menu, footer, social, email, and phone links receive stable action IDs. Named paid-plan and free-pick CTAs receive specific IDs. Carousel controls and purely decorative buttons are not conversion CTAs. All event payloads omit email, name, form values, phone numbers, query strings, and private credentials.

## Architecture and event contract

`analytics.js` is the central first-party client. It maintains a 30-minute session ID, preserves original first-touch attribution in first-party storage, updates last-touch attribution, and posts sanitized interactions to `/analytics/interaction`. The Worker validates a bounded allowlist and stores interactions in the existing Supabase analytics-events table as `page_view` records with `properties.kind = interaction` and `properties.action = <event>`; this avoids changing the production database's event-name constraint. Dashboard code explicitly separates these from actual page views.

Events: `page_view`, `join_page_view`, `cta_click`, `form_view`, `form_start`, `form_submit_attempt`, `form_validation_error`, `generate_lead`, `section_view`, `scroll_depth`, plus existing server-owned `offer_selected`, `discord_verified`, `checkout_started`, `payment_completed`, `vip_activated`. `generate_lead` means the publisher returned success. It does not mean email delivery was confirmed. `payment_completed` and purchase value remain Stripe-verified server metrics; CTA clicks never count as purchases. Form and CTA events have stable `target_id`, `location`, sanitized page path, optional internal destination, anonymous session ID, and server timestamp.

First and latest touch retain source, medium, campaign, content, term, referral code, and permitted click IDs (`gclid`, `fbclid`, `msclkid`). Raw URL query strings are not retained in referrer or landing path. Attribution reaches Stripe checkout via the existing `/checkout/prepare` association and is joined to server-verified payment data in the dashboard. It is not claimed as cross-device identity.

`consent.js` now gates optional first-party and advertising measurement. The visitor can allow or decline and change the choice on `/privacy`; decline clears first-party analytics identifiers and stops further client event sends. Core checkout and forms do not depend on analytics. There is no noscript pixel bypass. Existing Meta Pixel uses its established Pixel ID and loads only after consent.

`analytics-integrations.js` supports either GTM (`KBH_GTM_ID`) or standalone GA4 (`KBH_GA4_ID`), never both loaders. Optional Google Ads ID and lead/purchase labels use `KBH_GOOGLE_ADS_ID`, `KBH_GOOGLE_ADS_LEAD_LABEL`, `KBH_GOOGLE_ADS_PURCHASE_LABEL`. Build values are public IDs, not secrets. The adapter only loads when real IDs are configured and consent is allowed. In GTM mode, configure GA4 and Google Ads tags inside the container and use the documented dataLayer events; do not add duplicate automatic page-view or purchase tags. The user has not supplied these IDs, so Google reporting is dormant. Meta CAPI is not enabled: there is no verified token/consent propagation for the Stripe webhook, so browser/server deduplication cannot be asserted.

## Dashboard and limits

The private dashboard retains date filtering, sources/campaigns, landing pages, verified revenue and funnel stages, and join-page engagement. It adds CTA and email-form activity with campaign and page filters. It does not show cost per lead or ROAS because ad spend data is not connected. It does not claim confirmed email delivery, booking completion, or qualified lead status. Traffic with declined consent is absent from client analytics, while Stripe payment totals remain independently verified.

## QA and activation

1. Build the public bundle and confirm only whitelisted files are deployed; verify no Meta `noscript` image remains.
2. On mobile and desktop, decline optional tracking and confirm no `/analytics/*`, `fbevents.js`, GTM, or gtag requests. Accept, then verify one page view and one named event for each sampled CTA. Change preference on `/privacy` and verify no further client events.
3. Submit a valid free-pick or signup form and verify `generate_lead` only after the publisher succeeds. Force a validation error and confirm it has no lead event.
4. Complete a test checkout and verify the dashboard shows a payment only after Stripe confirms it. Check a verified welcome receipt triggers browser purchase measurement once if consented.
5. If GTM ID is supplied, use GTM Preview and GA4 DebugView to inspect page/CTA/lead events. If using standalone GA4, use DebugView. Use Meta Events Manager Test Events for PageView, InitiateCheckout and Purchase. Add Google Ads conversion labels only after the corresponding conversion actions exist.
6. No external booking integration exists. If one is added later, confirmed bookings must come from a signed webhook or verified API response, not a link click.

## Implementation phases

1. Audit existing pages and instrumentation; preserve Stripe/Discord truth sources.
2. Add consent, central named interactions, clean attribution, and dormant Google adapter.
3. Extend the existing private dashboard and verify the public build, Worker tests, and live behavior after deployment.
4. Activate GA4/GTM, Google Ads, and optional Meta CAPI only after credentials, consent requirements, and test events are validated.

Reporting interpretation: the visitor funnel and conversion percentage use only measured, consented sessions. Payment totals include every Stripe-verified customer. A payment without a linked session is grouped as `unattributed`, not `direct`, and the dashboard shows that count separately. This prevents a tracking decline from falsely inflating a measured visit conversion rate.

Email-list source handling: both the gated free-pick form and legacy signup send the consented last-touch source at submission time. The publisher stores the existing `free-pick-subscriber` tag and source in D1. If optional tracking is declined, it records `direct` without creating an analytics session. The form success signal means the subscriber row was stored; email delivery is separately queued/retried and is not counted as delivered by `generate_lead`.
