# Current-day Free Pick delivery recovery

The existing Render worker now checks its canonical Free Pick log every 60 seconds. Only current Pacific operating-day records with an approved publication identity and a real post reference in the configured Free Pick channel qualify. Discord receipt and the exact selection, line, and odds are checked before delivery.

Persistent, atomic checkpoints live in `/var/data/free-pick-delivery`. Both the approval button and authorized `/publish-pick` route seed the exact approved packet. A restart can recover from the canonical log/review packet without changing the wager terms or replaying earlier days.

The website gets the approved text card and generated 1080×1920 Story asset. This path deliberately does not attach the source image to the website publish endpoint: that endpoint has a separate direct-X side effect without the D1 queue ID. X instead uses one stable D1 queue ID per pick, compact wager terms, a join link when space permits, and 21+/no-guarantees disclosure. A read-only queue receipt check precedes every new request. Ambiguous `publishing` and failed receipts are held for operator review rather than blindly reposted. Published receipts survive worker restarts. The newest same-day pick remains the current website card; recovery cannot overwrite it with an earlier same-day item.

The social-package email is idempotent by pick ID. This is not proof of Instagram auto-publication. A complete recap still requires verified results; unsupported or ambiguous markets remain pending rather than receiving fabricated grades.

No historical or fixture pick is authorized for public replay. Today's production Free Pick channel was read with the live bot credential and contained only September 15 posts. First genuine current-day X publication remains an acceptance check when Kobe approves a new Free Pick.

Read-only membership verification observed the newest two-day trial linked to Discord with the actual configured VIP role present. Other recent two-day trial records were not linked at the time checked; investigate before treating them as completed memberships. No membership or billing record was mutated.

Rollback: disable Free Pick X sync and/or pause pick publication while inspecting delivery checkpoints and D1 receipts. Do not delete a D1 queue record or submit a new queue ID to resolve an ambiguous X response.
