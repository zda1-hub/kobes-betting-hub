# Optional BALLDONTLIE league switches — November 16, 2026

Request: prepare NHL, MLB, EPL, MLS, and UCL behind per-league paid-data
switches, all off by default, without subscribing or making provider calls.

Affected files: `cloudflare/trends-bdl-optional.js`,
`cloudflare/trends-bdl-optional.test.mjs`, `cloudflare/bettinghub-publisher.js`,
`wrangler.publisher.jsonc`, and `docs/trends-optional-bdl-sports.md`.

Before: no optional BALLDONTLIE source adapter or per-league flag in the
publisher Worker. After: authenticated source-read routes share a provider
interface and fail closed until both the league flag and its Wrangler secret
exist. No scheduler or publisher calls these routes. NBA, NFL, college, and
existing Odds API behavior remain unchanged.

Verification: official BALLDONTLIE docs checked for league-specific base paths;
101 Trends tests passed, including five-league zero-call tests and the private
Worker route test. Wrangler dry-run bundled the Worker and showed all five
flags set to `false`. No real paid API call was made.

Limit: enabling a source is not the same as validating league-specific game
logs, current prices, injuries, TEST cards, or live auto-posts. Each league
needs those checks and its own purchased entitlement before publication.
