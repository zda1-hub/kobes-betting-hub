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

Sources: [Arizona Department of Gaming approved operators](https://gaming.az.gov/ewfs/approved-operators-retail-locations) and [The Odds API bookmaker catalog](https://the-odds-api.com/sports-odds-data/bookmaker-apis.html).
