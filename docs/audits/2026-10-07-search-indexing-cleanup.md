# Search Console indexing cleanup — October 7, 2026

## Request

The user received a Search Console alert for “Page with redirect” and “Excluded by ‘noindex’ tag” and asked for a fix.

## Findings

The live sitemap listed `/guides/`, which returns HTTP 307 to `/guides`. All other sitemap URLs returned HTTP 200 at their listed paths. Several indexable pages listed in the sitemap lacked a self-referencing canonical tag. The code intentionally marks private account, admin, creator, activation, and membership-management pages `noindex`; these should not appear in Google search. The screenshot does not show the specific Search Console URL examples, and this session's signed-in Google account does not have the property available, so the exact alert rows could not be matched one by one.

## Changes

- `sitemap.xml`: changed the learning hub entry to the final `/guides` URL.
- Twelve public HTML pages: added self-referencing canonical tags to the URLs already listed in the sitemap.
- `scripts/prepare-public-site.mjs`: rewrites internal `.html` links in the published public bundle to their final clean URLs, preserving query strings and fragments. This avoids generating new redirecting links.
- `scripts/search-indexing.test.mjs`: checks that sitemap entries and canonicals align and that link rewriting preserves destinations. No content, layout, pricing, or private-page robots settings changed.

## Verification and release

Targeted indexing, public build, and billing tests passed (10/10). The public build completed and Cloudflare dry-run passed. Two unrelated exclusive-directory tests currently fail against the base content because their expected directory text/marker is absent; this change does not alter that content. Live verification and deployment are pending. No Search Console validation request has been submitted.

## Limitations

Google may continue to report historical redirected `.html` URLs and intentionally private `noindex` pages; those statuses do not mean that a public page is broken. Search Console's affected URL examples are needed to confirm every row in the alert. Indexing and ranking are decided by Google and are not immediate after deployment.

## Publication follow-up — October 7, 2026 MST

PR #165 merged into `main` at `7228665`. The public-only bundle was deployed through `wrangler.site.jsonc` to Cloudflare Worker `kobes-betting-hub`, version `664d86db-ab91-47b2-b195-963f3014e768`. Live checks confirmed the sitemap lists `/guides` directly, `/guides`, `/join`, and `/exclusives` return public content with matching canonical URLs, and the live membership page links directly to `/faq` rather than `faq.html`. No checkout Worker, billing, or access integration was deployed. Search Console has not yet recrawled these changes.
