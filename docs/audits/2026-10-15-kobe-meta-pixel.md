# Kobe supplied Meta pixel

Request: install the Meta pixel from Kobe’s screenshot. Pixel ID 971327835061737 replaces prior ID 4640857832799621 in the existing shared tracking module. Public build injects the versioned module across public HTML. No visible layout changes or backend changes. Existing consent, private-URL, preview/staging, verified paid-purchase and event deduplication gates remain. Do not inject a second inline snippet or an unconditional noscript beacon that bypasses those gates.

Affected files: meta-pixel.js, scripts/prepare-public-site.mjs, scripts/meta-purchase-tracking.test.mjs.

Verification and deployment results appended below. Meta Events Manager receipt cannot be inferred from script deployment.

Published Cloudflare public-site version 1fa4c8cf-0b9a-4f42-830c-401df3143b41 with --keep-vars. 13 focused tests passed, including exact ID and single PageView initialization. Fresh workers.dev HTTPS requests confirmed the supplied pixel ID and updated membership script reference. Custom-domain urllib request returned 403; workers.dev verified deployed assets. First deployment received Cloudflare internal error 10500; retry succeeded. Meta Events Manager receipt is not independently verified. No UI or backend change.
