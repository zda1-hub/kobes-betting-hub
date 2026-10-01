# Arbitrage sportsbook coverage — September 26, 2026

The scanner's default now includes **all nine launched Arizona event-wagering operators that also appear in The Odds API's US sportsbook catalog**. The catalog key `espnbet` is currently labeled **theScore Bet** by the provider. One `bookmakers` request covers these nine keys, so adding the ninth does not change the per-scan bookmaker-group quota cost.

| Sportsbook | The Odds API key |
| --- | --- |
| Bally Bet | `ballybet` |
| BetMGM | `betmgm` |
| BetRivers | `betrivers` |
| Caesars | `williamhill_us` |
| DraftKings | `draftkings` |
| Fanatics | `fanatics` |
| FanDuel | `fanduel` |
| Hard Rock Bet Arizona | `hardrockbet_az` |
| theScore Bet (formerly ESPN Bet) | `espnbet` |

Arizona currently lists three additional launched operators for which this Odds API catalog has no matching US sportsbook feed: **bet365, Desert Diamond, and Plannatech/betcris**. **Circa Sports** is listed by Arizona as not launched. The scanner cannot compare prices from those absent feeds. Its default list is not a claim that any member has an account at every listed sportsbook. A price can also be absent for a particular event, sport, or market even when the sportsbook is in the catalog.

The `ARBITRAGE_BOOKMAKERS` environment setting can narrow the list to books members actually use. Do not add offshore, out-of-state, DFS, or exchange keys to member-facing arbitrage alerts merely because they appear elsewhere in the provider catalog.

As of October 1, the scanner checks NFL, college football, and MLB event feeds separately. The provider's `upcoming` shortcut returns only the next eight events across all sports, so the sport-specific requests cover more relevant games. `ARBITRAGE_SPORTS` can change that list. Each sport request uses quota; scan logs now show the requested sports and the bookmakers that actually returned prices. The default nine bookmaker keys are configured coverage, not a guarantee of live prices.

The provider also lists Fliff as `fliff` in its `us2` catalog, PrizePicks and Underdog in a DFS catalog, and Kalshi in an exchange catalog. Those products have different bet types and settlement rules, so they are not mixed into the sportsbook-to-sportsbook VIP arbitrage calculation. The provider catalog does not list a US bet365 feed. The current feed therefore cannot responsibly promise coverage for those requested brands.

Sources: [Arizona Department of Gaming approved operators](https://gaming.az.gov/ewfs/approved-operators-retail-locations) and [The Odds API bookmaker catalog](https://the-odds-api.com/sports-odds-data/bookmaker-apis.html).
