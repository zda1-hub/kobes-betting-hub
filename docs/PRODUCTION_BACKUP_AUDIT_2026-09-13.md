# Production Supabase encrypted backup audit — 2026-09-13

Status: **completed and structurally verified**. This was a read-only production database operation; no production schema, row, credential, or configuration was changed.

Latest verified backup: GitHub Actions run `34775096023`, artifact `kbh-production-supabase-20260913T183537Z`, encrypted SHA-256 `eddd2515922b60e61f83ce85c1faa2c16f20e859c53ccf7cd54275239d89807e`, with a checksum-verified local copy at `/Users/z/Documents/Kobe Betting Hub Backups/34775096023/`. That run also completed the separate migration plan-only check and made no database writes.

## Evidence

- Production project: `mpajyubbnnsdpgdizvht`.
- GitHub Actions run: `34774738544`.
- Artifact: `kbh-production-supabase-20260913T182854Z`.
- Encrypted archive: `kbh-production-20260913T182854Z.dump.enc`.
- Encrypted size: approximately 1.3 MB.
- SHA-256: `df093d0f45e4e006a35722e48aa7b96c47c8c2f269f021db3f5e11420838f906`.
- GitHub artifact retention: 14 days.
- Local encrypted copy: `/Users/z/Documents/Kobe Betting Hub Backups/34774738544/kbh-production-supabase-20260913T182854Z/`.
- Encryption: AES-256-CBC with PBKDF2-HMAC-SHA256 and 600,000 iterations.
- Recovery key locations: macOS Keychain item `KBH Production Backup Encryption Key` for account `zda1-hub/kobes-betting-hub`, and encrypted GitHub Actions secret `PRODUCTION_BACKUP_KEY`. The key is not stored in Git, the artifact, logs, or this document.

## Verification performed

1. The workflow refused any database URL that did not contain the exact production project reference or require encrypted PostgreSQL transport.
2. PostgreSQL 17 created a custom-format logical archive from the PostgreSQL 17.6 Supabase server.
3. The plaintext archive passed `pg_restore --list`.
4. The archive was encrypted before artifact upload.
5. A temporary decrypted copy passed `pg_restore --list`; both temporary plaintext copies were removed by the job cleanup handler.
6. The downloaded encrypted file's SHA-256 matched the uploaded checksum.
7. The normal OpenAI reconciliation job was skipped during this manual backup run.

This proves the encrypted artifact is intact, decryptable with the retained key, and parseable as a PostgreSQL archive. A destructive full restore into production was not attempted. A later recovery drill should restore into a separate disposable database and compare schema plus selected row counts before this project claims a complete disaster-recovery exercise.

## Failed-safe attempts retained in GitHub Actions

- Run `34774557264` stopped before dump creation because the Supabase pooler-only `uselibpqcompat` query parameter is not accepted by libpq.
- Run `34774601352` stopped before dump creation because the default PostgreSQL 16 client did not match server 17.6.
- Run `34774642987` stopped while installing an unavailable PostgreSQL 17 Ubuntu package.
- Run `34774684443` repeated the package failure against the correct source revision.

No failed attempt uploaded an artifact or wrote to production. The final workflow normalizes the pooler-only parameter and uses the official PostgreSQL 17 container.
