# Orange membership card — October 10, 2026

Requested: replace the orange KBH card’s “FILM ROOM > HOT TAKES” fine print with $32.99/month and place it directly above the referral dollar bill.

Changed: assets/membership/orange-kbh-monthly.png, site.js, site.css, and root HTML asset cache versions. The orange card now contains the monthly price, links to /join, and sits immediately before the referral bill. A readable caption states renewal until canceled. Previously the card was a concept asset rather than a homepage element.

Verification: public whitelist build and Cloudflare deployment succeeded. Live browser confirmed the image loaded, the referral bill is its next sibling, /join is the destination, and the compact viewport has no document horizontal overflow. Visually checked mobile and desktop; card controls remain contained. Screenshot: outputs/audit-2026-10-10/orange-card-above-bill-live.png in the primary workspace.

Published: https://kobesbettinghub.com/. Worker version f0db3510-3df8-4ffe-a901-cf41f2f90102. No backend or billing changes. Fine print is also repeated as accessible readable text below the card. This image is a website mockup, not a print-ready physical membership card.
