# GA4 collection restoration, October 9, 2026

Requested: check today's traffic sources and funnel. The GA4 Traffic acquisition report showed zero sessions for the prior 28 days. The production public build contained an empty GA4 measurement ID even though the configured web stream is `G-264TY91ZCT`; the stream's panel showed recent activity, but the report could not support a source breakdown.

Affected file: `scripts/prepare-public-site.mjs`. For production builds, use the site's public measurement ID as a fallback when `KBH_GA4_ID` is not supplied. Explicit environment configuration still takes precedence. Consent defaults remain denied and GA4 loads only after consent. Private pages remain excluded.

Before: a production build without the optional environment variable emitted `ga4:""`, so the marketing pages could not send GA4 data. After: the public build emits the site's ID by default. Verification and publication status are appended below.

Limitation: this restores prospective collection. It cannot backfill prior sessions or prove today's channel mix. The first-party analytics funnel remains separate.
