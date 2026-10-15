# Winning slips background — review only

User requested small distant winning slips, using existing website assets, with empty space and unchanged foreground design. Explicitly no Cloudflare deployment. Isolated branch codex/winning-slips-background-preview adds four existing slip images as low-opacity decorative accents behind homepage content. No regenerated or edited bets, payouts or results. Main membership interactions untouched. Changes limited to index.html and winning-slips-preview.css. Revert by removing stylesheet link and backdrop markup.

Local preview and GitHub branch only; not merged to main or deployed. Rendered verification to follow.

Rendered at actual 320,390,1440 CSS px: document width equals viewport; header top zero; all four existing images load; opacity .10 mobile and .14 desktop. Join action still resolves first_month_back membership. Moved first slip lower after visual review to avoid intro copy. Screenshots in evidence/winning-slips-preview. Existing remote free-pick/results feeds may be loading in local capture; no changes to those integrations. No Cloudflare commands executed.
