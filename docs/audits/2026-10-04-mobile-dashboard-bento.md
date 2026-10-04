# Mobile dashboard bento redesign — October 4, 2026

## Request and scope

Reorganize the private business dashboard so the owner can find essential information quickly, with mobile as the priority. This release changes dashboard presentation and navigation; existing authenticated data sources, billing, access checks and reporting definitions remain in place.

## Changes

- Six prominent overview cards: active subscriptions, estimated MRR, collected revenue, successful payments, website visits and checkout-to-paid conversion. Labels distinguish current membership totals from selected-date reports, and visits explicitly describe the existing 30-minute session count.
- A linked attention panel surfaces open failed invoices, paid members without VIP setup, unavailable VIP checks and today's free-pick publishing status. Clicking opens the appropriate report before scrolling to its content.
- Full information is grouped into five expandable reports: memberships/access, traffic/conversions, revenue/retention, publishing and tools. Search, status/date scope filters, VIP retry, duplicate review, creator invitations and campaign/referral tools are retained.
- Phone layouts use two-column overview cards, wrapping date buttons, readable labeled table cards and consistent 16px side gutters. Custom date inputs appear when Custom is selected. Form controls use readable mobile sizing.
- Blue, black and orange accents distinguish key totals and issues. A refresh button and MST timestamps clarify freshness. Reporting incompleteness and internal test exclusions remain available in a visibly labeled notice.
- Removed the public home stylesheet from this private page to prevent unrelated public layout rules affecting dashboard alignment. Versioned dashboard assets invalidate previous cached UI.

## Verification

- 23 automated checks passed across dashboard date filters/navigation, campaign links, public-site preparation and existing bento release contracts.
- Browser checks at 320px, 390px and 1280px showed no horizontal page overflow. At 320px both custom date controls fit inside the page; report navigation opened the intended collapsed section.
- Member search and mobile row labels were checked using synthetic demo data. The demo and screenshots are explicitly labeled and are not production metrics. No private customer fixture was saved or deployed.
- Public-site preparation includes the updated admin page, CSS and JavaScript. Deployment and signed-in production verification are recorded below after release.

## Limitations

This redesign does not fix missing historical analytics or change how the existing backend counts sessions, payments, MRR or publishing dates. Unknown overview values are displayed as unavailable rather than zero. The dashboard's existing authentication and operational action permissions remain unchanged.

## Release receipt

Pending deployment verification.
