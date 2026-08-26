# Kobe's Betting Hub launch checklist

This is the shared source of truth for the free-picks pilot and paid-membership launch. A task is only marked complete after it has been verified, not merely planned.

## Verified foundation

- [x] Kobe Bot application is connected to the Betting Hub Discord server.
- [x] Current local Discord bot token is valid and Kobe Bot is running locally.
- [x] Private `#pick-approvals` channel is configured.
- [x] Member-facing destination channels are allowlisted and the bot can access them: Exclusives, NFL writeups, All Football Trends, MLB writeups, Baseball Trends, and Daily Recap.
- [x] Manual pick preview/publish and recap commands are registered.
- [x] X API credentials are configured.
- [x] OpenAI API key is stored locally; API billing credits still need to be added before image analysis can run.
- [x] 37 public X sources are staged but disabled: 8 standard pick sources, 7 photo-review sources, and 22 writeup/trend sources.
- [x] No partner Discord community access or personal-account automation is used.

## Free-picks pilot

- [x] OpenAI API credits added and a live API request succeeded.
- [x] `#daily-free-play` Channel ID received: `1539061878062583848` and added as an allowlisted free-pick destination.
- [x] Kobe Bot access to `#daily-free-play` verified.
- [x] Built approval-card controls for source drafts: Post as Free Pick, Post to Paid Sport, Reject, and a saved audit decision.
- [x] A private, safety-locked approval-card button test was created from a real public CappersUSA source; its publish buttons are disabled.
- [ ] Kobe clicks Reject on the safety test card before source monitoring is enabled.
- [x] Built source-specific intake rules for text picks, photo-only candidates, and writeup/trend candidates; all remain private and disabled until tested.
- [x] Set photo/exclusive member-post format to capper name followed by one play per line, with visible unit size or dollar stake only.
- [x] Ran the first private approval-card/button test against a stored source draft.
- [x] A real public CappersUSA photo-source extraction was sent privately to `#pick-approvals` (test only; no member post).
- [x] Kobe confirmed the original capper, play, odds, and units/stake in the private photo-pick test.
- [ ] Run one real text-pick approval privately; Kobe confirms the post layout and destination.
- [ ] Start with a small, explicitly approved source group. Keep all public posting approval-first.
- [ ] Review three to five days of free-pick cost, accuracy, duplicates, and recap behavior.
- [ ] Choose the full-source activation date/time in California time and set the X monthly spending limit.

## Paid-membership launch

- [ ] Obtain written confirmation from the payment provider that the paid sports-content subscription is supported for the intended jurisdictions and business model.
- [ ] Create the paid-member Discord role and provide its Role ID.
- [ ] Lock paid channels to the paid-member role and keep `@everyone` out.
- [ ] Finalize legal business owner, support email, price, cancellation/refund policy, terms, privacy policy, responsible-gambling notice, and age/location rules.
- [ ] Create the approved processor product for the $32.99/month membership and configure the bank payout account.
- [ ] Configure live checkout, signed webhooks, Discord OAuth connection, and automated role grant/removal.
- [ ] Deploy the membership service and run a real end-to-end test purchase before public launch.
- [x] Render Background Worker is deployed and reporting Live for the current GitHub `main` release.
- [ ] Publish and deploy the newer approval-button, photo-format, and source-intake updates to GitHub/Render; do not enable source monitoring before this release is live.
- [ ] Run a small internal member cohort before opening payment links publicly.

## Daily recaps and social

- [ ] Confirm whether early recaps are manually verified or connect a results/odds data provider for automated grading.
- [ ] Configure the official Instagram account for recap publishing.
- [ ] Configure the official X account only if automatic recap posts are desired.
- [ ] Test one recap through Discord, Instagram, and X without exposing it publicly.

## Current monthly budget target

| Item | Launch cap / estimate |
| --- | ---: |
| X monitoring for 37 accounts | $75 |
| OpenAI photo analysis | $20 |
| Discord bot and channel posts | $0 |
| Website | $0 |
| Subscription/role automation | $5 |
| Domain | about $2 |
| Daily X recap posts | about $1 |
| Bot hosting while Mac stays on | $0 |
| **Fixed launch operating budget** | **about $103/month** |
| Always-on bot host later | about +$10/month |
| Payment processing | about $1.49 per $32.99 domestic-card member, after provider approval |

Paid ads, a premium odds/results provider, taxes, and legal/accounting work are not included in this budget.
