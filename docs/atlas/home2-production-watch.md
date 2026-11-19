# Home/Zone 2.0 production watch checklist

Companion to the [production release plan](https://github.com/Aleynaalij/VegasQuantV1/issues/294#issuecomment-7007590586)
and [Mike's rollout decisions](https://github.com/Aleynaalij/VegasQuantV1/issues/294#issuecomment-7007643076):
dark merge → owner preview → opt-in → default on → cleanup no earlier than 2 weeks after default.
Nothing here is authorized until staging is accepted and Mike says go for step 1.

## Fixed references

| Item                            | Value                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Vercel project                  | `vegas-quant-v1` (`prj_nOLCSmAPzjc5jayXwJ2gJNYXIT9P`), team `goatq2s-projects`                             |
| Last good production before 2.0 | `dpl_8dCL41hbSPhjYebGywC5M4RRjoxk`, commit `8ea6c4a` (re-read before step 1; update if production moved)   |
| Production Supabase             | `uowearboulykfcwnuirn`: 180 migrations, latest `20261118010000`, digest `6d2d6b44f16eabc800712a9d0d4a1bed` |
| 2.0 database migrations         | **None.** The migrations digest must not change at any step                                                |

## Before each step

- [ ] Re-read the production deployment and migrations digest; record them on #294.
- [ ] Confirm which deployment Instant Rollback would return to, and that it is READY.
- [ ] Confirm the flag value the step needs (unset / `owners` / `optin` / `default`), set server-side only.
- [ ] Someone is watching for the first hour after the change (Claude, plus Mike or Elo on a phone).

## Step 1: dark merge (2.0 locked off)

- [ ] `home2-release-compare.mjs snapshot` against `https://vegasquant.app` **before** the merge deploy.
- [ ] Merge, wait for the production deployment to be READY, snapshot **after**, run `compare`: must print `IDENTICAL`.
- [ ] Vercel runtime errors for the new deployment: none new in the first hour.
- [ ] Member smoke (Mike's phone): sign in, Home, NBA Prop Finder, a research card, Zone/community, sign out.
- [ ] Hold 24 hours, then re-check runtime errors and the migrations digest.

**Roll back if:** compare shows any difference, or new runtime errors appear. Action: Vercel Instant Rollback to the recorded
deployment, then investigate.

## Step 2: owner preview (`owners`; Mike and Elo only)

- [ ] Non-allowlisted accounts and signed-out visitors still get classic Home (compare stays IDENTICAL signed-out).
- [ ] Owners see 2.0 with **real data**: Home games for every sport, research findings, Prop Finder links.
- [ ] **Dealer** (risk R2): Home Dealer section loads (`community_dealer_feed`), Zone Dealer surfaces render.
- [ ] Notifications: inbox opens, counts load, no duplicate push or email from opening 2.0.
- [ ] Age and membership boundaries: an unverified or free account sees the same denials as classic.
- [ ] Legacy links: `/?game=…` and old lay links still land on the right page.
- [ ] Supabase logs: no new errors on `desk_data_compact`, `community_dealer_feed`, research or notification RPCs.
- [ ] Elo's production journey list passes.

**Roll back if:** any boundary differs from classic, Dealer or notifications misbehave, or there are new RPC errors. Action:
unset the flag and redeploy (minutes), or Instant Rollback.

## Step 3: opt-in (`optin`; 3–7 days)

- [ ] The "Try the new Home" toggle works both ways and persists per member.
- [ ] Daily: runtime error rate and Home load success for 2.0 vs classic; 2.0 must not be worse.
- [ ] Support and feedback: no repeated complaint about a missing feature or wrong data.
- [ ] Vercel usage within the project budget alert levels.

**Advance if:** 3+ days clean, with Mike's go. **Roll back:** flag → `owners`.

## Step 4: default on (`default`; 2 weeks)

- [ ] "Back to classic" works and is remembered.
- [ ] Watch the first hour closely, then daily as in step 3.
- [ ] Track how many members switch back, and why (feedback).

**Roll back:** flag → `optin`. Cleanup (step 5) starts no earlier than 2 weeks after default-on, with gates green.

## Step 5: cleanup

Separate reviewed PR: remove classic Home, the toggle and the staging-only code from production builds. Normal revert if
needed. Never touch the database as part of cleanup.
