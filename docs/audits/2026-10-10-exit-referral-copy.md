# Exit message copy — October 10, 2026

Requested change: Keep “Take a look before you go” and replace the outdated $19.99 October offer message with the standard $32.99 monthly price and $20 referral opportunity.

Affected files: `site.js`, `site.css`, and public pages loading those shared assets. Before: the previous promotion popup was removed from current JavaScript but could linger in an already-open tab; its old wording referenced October 22 and $19.99. After: exit intent shows a once-per-session dialog with $32.99/month, $20 per eligible referral, a short eligibility note, and links to membership and the referral page. No October deadline or introductory price appears. Checkout return pages do not show it. The dialog closes by button, backdrop, or Escape.

Verification: JavaScript syntax and public build checks; live verification pending. Status: local pending publication.
