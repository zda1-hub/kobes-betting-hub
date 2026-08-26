# Pick enrichment flow

This runs only for qualifying posts from the approved public X accounts. It does
not read any Discord community and it never uses Kobe's personal Discord login.

1. The X monitor finds a possible pick and creates a private review card in
   `#pick-approvals`.
2. When enrichment is enabled, the system reads the public post and any attached
   image into structured fields: sport, event, market, selection, line, odds,
   units, and the source's stated claims.
3. The card labels that output **source extraction — not verified**. It does not
   treat a capper's claim or image as a fact.
4. An authorized odds/results provider must independently verify the current
   line, supporting facts, and later the game result.
5. Only then can Kobe review the wording, add an approved image, and choose the
   approved destination channel. The Discord bot posts after that approval; it
   does not post as Kobe.

## Turn on source extraction

In the local hidden `.env` file, add these lines without sharing the key in chat:

```text
OPENAI_API_KEY=PASTE_YOUR_OPENAI_API_KEY_HERE
OPENAI_PICK_ANALYSIS_MODEL=gpt-5-mini
ENRICHMENT_ENABLED=true
```

The initial test should use one new X pick. Its private card will show either a
structured source extraction or a clear error—nothing will be posted to any
member channel.

## Still needed before verified write-ups can be automated

- An authorized odds data provider/API key that covers the sports and markets
  being posted, especially player props.
- A results/statistics provider/API key for daily recap verification.
- Permission from each source to reuse their text or images, if their material
  is to appear in member-facing posts. Until then, the monitor and source credit
  are for internal review only.
