# Membership staging database migration runbook

This procedure applies the repository's membership and audit migrations only to a separate Supabase staging project. The staging runner never reads `DATABASE_URL`, refuses a connection whose project reference differs from the declared staging project, refuses a staging reference equal to the declared production reference, defaults to a read-only plan, and requires a project-bound confirmation before writing.

Do not reuse the production Supabase project, production database password, or production service-role key. The migration runner needs a Postgres connection URL only; the staging Worker separately needs its server-side Supabase REST credential.

## 1. Create the isolated database target

Create a new Supabase project for membership staging. Record these non-secret identifiers:

- the new staging project reference from its project URL;
- the existing production project reference from the production project URL;
- a staging session-pooler connection URL with `?uselibpqcompat=true&sslmode=require`.

Copy `.env.example` to `.env.staging.local` and populate only the three staging migration fields. `.env.staging.local` is gitignored. Never paste the connection URL into a shell command, issue, or committed file.

```dotenv
STAGING_DATABASE_URL=postgresql://postgres.STAGING_PROJECT_REF:PASSWORD@POOLER_HOST:5432/postgres?uselibpqcompat=true&sslmode=require
STAGING_SUPABASE_PROJECT_REF=STAGING_PROJECT_REF
PRODUCTION_SUPABASE_PROJECT_REF=PRODUCTION_PROJECT_REF
```

The 20-character references must differ. The runner derives the real project reference from either `db.<ref>.supabase.co` or the `postgres.<ref>` pooler username and fails closed if it cannot match it. It also verifies the declared production reference against the production `SUPABASE_URL` already committed in `wrangler.jsonc`.

## 2. Review the no-write plan

```sh
npm run migrate:staging -- --plan
```

Expected evidence:

- `Verified staging target` names the new staging project reference and a sanitized database identity;
- `Migration plan` lists the pending SQL filenames;
- `Plan only; no database writes were made` is printed;
- no password or full connection URL is printed.

Stop if the displayed project reference is not the new staging project.

## 3. Apply atomically

Add this fourth line to `.env.staging.local`, substituting the exact staging reference:

```dotenv
STAGING_MIGRATION_CONFIRM=APPLY_STAGING_MIGRATIONS_TO_STAGING_PROJECT_REF
```

Then run:

```sh
npm run migrate:staging -- --apply
```

All pending migrations run inside one PostgreSQL transaction under an advisory lock. Any SQL or version-recording failure rolls the entire batch back. Already recorded migrations are skipped.

Successful acceptance evidence ends with:

```text
Acceptance checks passed: all migrations recorded, 19 tables present with RLS, no anon/authenticated grants, service_role backend grants complete.
```

Migration `007_service_role_rest_access` supplies the explicit server-only REST grants required by the Checkout Worker while keeping browser roles revoked. Migration `008_subscription_cancellation_fields` adds durable `cancel_at` persistence for current Stripe subscription shapes. Both must appear in the recorded migration set after an up-to-date staging apply.

Save the sanitized command output with the membership staging acceptance evidence. Do not save `.env.staging.local` or the connection URL in the evidence bundle.

## 4. Prove repeat safety

Run the plan again:

```sh
npm run migrate:staging -- --plan
```

Expected evidence is `Migration plan: nothing pending.` and the explicit no-write message. Before configuring the staging Worker, use the Supabase table editor or SQL editor to confirm the staging project contains `membership_customers`, `membership_subscriptions`, `stripe_webhook_events`, `membership_events`, and `api_call_events`, with no production membership rows copied into them.

## Local harness validation

This command is entirely local and does not connect to Supabase:

```sh
node --test pipeline/migrate-staging.test.js pipeline/migrations.test.js
```
