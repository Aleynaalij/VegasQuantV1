# Vegas Quant — The 5-Spot Challenge

Mobile-first public NFL research desk and protected publishing application. Next.js 16, TypeScript, Supabase Auth/Postgres/Realtime, and Vercel.

**Vegas Quant Ultra is the analyst. This application never generates picks, probabilities, odds, injuries, or betting recommendations.**

## Initial state

Challenge #1 starts with **$20**, targets approximately **$640**, and has no official wager. The owner supplied the initial Steelers @ Browns fixture for October 1, 2026 at 8:15 PM ET. No independent schedule or market verification is implied.

Stages: Thursday night; one Sunday 1 PM game; one Sunday 4 PM game; Sunday night; Monday night. A pass **pauses** the challenge until an administrator explicitly resumes it. It never triggers a replacement wager.

## Run

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run build
```

The dedicated Supabase project's public URL and publishable key are included in `src/lib/supabase.ts`. These are intentionally public credentials. Optional environment overrides are documented in `.env.example`. **No service-role key, admin token, or private API key is required by this app.** Database policies and explicit admin authorization enforce publishing access.

## Pages

- `/` — live challenge, market context, actual bankroll chart, illustrative ladder, decision gate.
- `/games/[slug]` — full handicap, market snapshots, immutable analysis versions, official plays.
- `/history` — permanent ledger, filters, CSV export, ROI/CLV/process summaries.
- `/admin` — email/password authentication and approved-admin publishing forms.
- `/picks/[id]/share` — screenshot-friendly pick card and PNG download.

## Deploy on Vercel

Import `Aleynaalij/VegasQuantV1`, framework **Next.js**, root directory **/**. The checked-in publishable connection enables public reads without secret configuration. For another database, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and apply the migrations.

Configure Supabase Auth's Site URL and allowed redirect URL to the production origin and `/admin`. An administrator can approve a registered account by inserting its verified Auth user ID into `private.admin_users` through the trusted Supabase management connection. Ordinary registrations have **zero publishing privileges**. Never grant admin based on editable user metadata.

## Accounting and history

- All currency is stored as integer cents; each settled profit is rounded once to cents.
- $20 at -110 produces $18.18 profit and $38.18 new challenge balance.
- Publishing reserves the intended stake; balance shows settled equity. The reserve transaction is informational (zero balance change). There can be only one official play per stage and one open challenge leg.
- Actual entry confirmation is separate from the recommendation. Actual entry odds drive settlement. An unconfirmed execution has no CLV and cannot settle.
- No deposits or top-ups exist within a challenge. Stakes cannot exceed available challenge funds. Long-term standalone picks are separate from challenge balances.
- Public price CLV is `(entry decimal odds / closing decimal odds − 1) × 100` only for identical lines. Line CLV measures points gained, with direction-aware totals/props. NFL key 3/7 crossings are flagged.
- The stated analyst edge is preserved exactly, with a database minimum of 3%. It is **not** silently replaced by a recomputed value from rounded probabilities.
- Analysis, market snapshots, official picks, entries, closes, results, reviews, transactions, and audit events are append-only. Analysis updates and process-review updates create new records.
- Published official picks include the game, analysis, and market information known at publication. No retroactive recommendation edits are available.
- Settlements are atomic and unique per pick. Request IDs make publication retries idempotent.
- Results use confirmed sportsbook grading and final scores supplied by the owner; this app does not infer sportsbook prop settlement from the score.
- Public pages update through Supabase Realtime, with a 30-second/focus fallback. Server-rendered pages use uncached reads.

## Publishing and the Work-chat handoff

See `docs/PUBLISHING.md`. Missing official fields must be requested, not guessed. Do not paste confidential data into public analysis text. Future corrections must be explicit appended records; never edit a losing pick out of history.

## Verification

`npm test` covers cents/odds math, rollover, key numbers, comparable CLV, directionality, and empty statistics. `supabase/tests/invariants.sql` exercises publishing, threshold rejection, pause/resume, overdraft protection, immutability, authorization, and duplicate settlement using synthetic data inside a transaction that is rolled back. It must run through a trusted database connection, not the public client.

RLS is enabled on every table, public tables have SELECT-only grants, and private administrator data is inaccessible to clients. Privileged publishing functions are outside the exposed schema, with explicit allowlist authorization and a fixed empty search path.

**Entertainment challenge. No wager is guaranteed. A stage may be passed when no qualifying edge exists.**
