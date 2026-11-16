# Optional BALLDONTLIE sport adapters

The publisher Worker contains disabled BALLDONTLIE adapters for NHL, MLB, EPL,
MLS, and UCL. They share the same provider interface: `status()` and
`read(resource, query)`. The private `/api/trends/bdl/{sport}/{resource}` route
supports `status`, `schedule`, `players`, `gameStats`, and `injuries` using
league-specific official endpoints. It requires `TRENDS_QUEUE_SECRET` and does
not expose an API key. No scheduler calls these adapters and they do not publish
cards. A disabled adapter cannot make a BALLDONTLIE request even if a key exists.

To enable one league after its plan and data rights are approved, set only that
league's Wrangler secret on the publisher Worker, set its matching flag
from `false` to `true`, and deploy the publisher Worker:

| League | Wrangler secret | Config flag |
| --- | --- | --- |
| NHL | `BDL_NHL_API_KEY` | `TRENDS_BDL_NHL_ENABLED` |
| MLB | `BDL_MLB_API_KEY` | `TRENDS_BDL_MLB_ENABLED` |
| EPL | `BDL_EPL_API_KEY` | `TRENDS_BDL_EPL_ENABLED` |
| MLS | `BDL_MLS_API_KEY` | `TRENDS_BDL_MLS_ENABLED` |
| UCL | `BDL_UCL_API_KEY` | `TRENDS_BDL_UCL_ENABLED` |

For example, run `npx wrangler secret put BDL_NHL_API_KEY --config
wrangler.publisher.jsonc` and set `TRENDS_BDL_NHL_ENABLED` to `true` in the
publisher config. Do not put the key in the config or repository. Set the
equivalent secret and flag for each additional league. Leave all other flags
off. The staging environment has independent flags and secrets.

This switch activates authenticated source access only. Producing Trends cards
still requires league-specific finalized-log normalization, current-market and
availability checks, source comparison, TEST delivery, and explicit live
publisher enablement. A key does not purchase or grant a league entitlement.
BALLDONTLIE lists subscriptions per league; some requested endpoints require
GOAT rather than ALL-STAR, especially soccer player match stats and NHL injury
data. Verify the exact entitlement before enabling a league.

Official references: [BALLDONTLIE league documentation](https://www.balldontlie.io/docs),
[NHL](https://nhl.balldontlie.io/), [MLB](https://mlb.balldontlie.io/),
[EPL](https://epl.balldontlie.io/), [MLS](https://mls.balldontlie.io/),
[UCL](https://ucl.balldontlie.io/).
