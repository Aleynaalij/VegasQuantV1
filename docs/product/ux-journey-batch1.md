# UX Batch 1: Home → research → The Zone → saved lay

Evidence for U-C1 (current journey and friction), followed by before/after for each change (U-C2 to U-C4).

**How the evidence was captured:** `scripts/ui-smoke/journey-walkthrough.mjs` runs against the synthetic stub (`scripts/ui-smoke/stub.mjs`). It covers 360, 390 and 1280 px, signed out and signed in, with the clock pinned to the stub's time (2026-10-14 02:00 UTC). Published legs are bound to the stub's sample games, and saved lays live only in memory. Nothing here used a real account, device, save, share, wager or external destination. Each run writes `journey.json`, which records every step's URL, headings, visible actions, status/alert text and sideways scroll, plus one screenshot per step.

Base: main `4140a05`.

## U-C1: the journey as it is today

| # | Step (signed in) | Route | What the member can do next |
|---|---|---|---|
| 1 | Home | `/` | Hero shows the next kickoff. **The matchup tile, "Choose player props" and "Full board · N games" all jump to the same `#home-games` anchor.** |
| 2 | Open a game row | `/` | Stat filters, "Copy all", the player list. **No link to the game's research page.** |
| 3 | Tap a player, then "Add to your lay" | `/` | The button flips to "✓ Added to your lay" in low-contrast dark-on-dark text. **"Build your lay · 1 selected" appears at the top of the list, off screen** (y = −56 at 360 px, −38 at 390 px). Nothing near the tap confirms the add or offers a next step. |
| 4 | Game research | `/matchups/<slug>` | Reachable only by URL or from the Zone/matchups list, never from Home. Offers "View all game picks →", follow buttons, "← All matchups", game news and the embedded game room. **No route to the lay in progress or to building one.** |
| 5 | Browser Back | `/` | **The game row is collapsed again and "Build your lay · 1 selected" is gone** until a game is reopened, although the draft is still in sessionStorage. |
| 6 | The Zone | `/community` | Post, feed tabs, sport filter, member cards. **No route to the member's lay in progress or saved lays.** |
| 7 | Builder | `/parlays` | The draft from Home restores correctly (1 leg). The heading reads **"Your parlay · 1 legs"** and the sticky bar reads **"1 legs selected"**. |
| 8 | Add a second leg, then save | `/parlays?saved=<id>#my-parlay-<id>` | The "Parlay saved" dialog has View My parlays / Done and an opt-in "Share to Community" (unchecked). Status: "Saved "My parlay" to My parlays." **Works well.** |
| 9 | Reopen via saved link | `/community?saved=<id>` → `/parlays?saved=<id>#my-parlay-<id>` | The redirect contract holds. The card is marked "Just saved" and scrolled into view. **Works well.** |

Signed out (all widths): opening a game row says "Sign in to see game props." with **no sign-in action beside it**; the only way in is the header "Login". Research and `/parlays` render without errors.

No step showed sideways scroll or a page error at any width.

### Friction list (ranked by how often it blocks the journey)

1. **Home → research dead end.** No link from a Home game to its research page (steps 2 and 4).
2. **The lay in progress is invisible after the tap and after Back.** The confirmation renders off screen (step 3); after Back, the row and the lay link both disappear (step 5). The draft itself is kept.
3. **Research → lay dead end.** The research page and its picks page offer no way to add a game's props or return to the lay (step 4).
4. **Zone → lay dead end.** The Zone has no route to the member's lays (step 6). Today the only routes are Home's "Build your lay" (shown only while a game row is open) and saved links.
5. **"Original publication →" links to `/records`, which is a 404.** This affects every non-candidate leg in the builder; there is no route or redirect on main or in `vercel.json`.
6. **Signed-out prop prompt has no action** (step 2, signed out).
7. **Duplicate hero links.** Three Home hero links share one anchor (step 1).
8. **Copy and contrast.** "1 legs" (step 7); the "✓ Added to your lay" pressed state is close to unreadable (step 3).
9. **Clipped sport-strip CTA.** At 360/390 px the "Start a conversation →" link is clipped by the sport strip (`community-stories.tsx`, shared navigation). Noted only: outside the claimed files.

### Deliberately not changed

- **"Lay" vs "parlay".** The page title and Home say "Your lay"; the builder's controls say "parlay". The walkthrough shows no step where the mix blocks anyone, so the terminology stays as it is (Elo: no terminology change without evidence).
- **Game news vs community discussion on the research page.** These are already separate sections ("This week's game news" vs "Game room · Let's sweat"). In the stub run a Zone win post appeared under game news, but only because the stub ignores the `game_id` filter; production filters by game.
- **Save / share / Kalshi / Gambly behavior** is unchanged. Sharing stays opt-in.

**Corrections after review:**
- The "✓ Added to your lay" contrast finding is withdrawn. Captured 1.5 s after the tap, and after blur, the state is gold with dark text and readable; the U-C1 screenshot caught the 0.18 s background transition mid-way.
- An "unnamed `/records` links" reading from the inventory was also withdrawn: those links are named "Original publication →" and sit inside closed `<details>`. Their *destination* is the real defect (item 5).

## U-C2 and U-C3: what changed

The game URL contract is `/?game=<slug>#home-games` (`src/lib/journey.ts`, unit-tested in `tests/journey.test.ts`). Home opens the game named in `?game=` only if it is on the listed slate; a malformed or unknown value is ignored. While a row is open, Home writes the slug into the URL with `history.replaceState`, so browser Back returns to the same open game.

| Friction | Before | After | File |
|---|---|---|---|
| 1. Home → research | No link from a game row | Each open row starts with "Game research & game room →" (`/matchups/<slug>`). The hero matchup tile goes to the next game's research. | `home-game-list.tsx`, `home-brief.tsx` |
| 2a. Add confirmation off screen | Only "Build your lay · N selected" at the list top (y = −56 at 360 px) | The same link also appears directly under "✓ Added to your lay". Selection errors ("Choose one target per player and stat…") show there too, not off screen. | `home-game-list.tsx`, `home.css` |
| 2b. Back from research loses context | Row collapsed, lay link hidden | Back lands on `/?game=<slug>` with the row open. "Build your lay · N selected" shows on load whenever a draft exists, without opening a game. | `home-game-list.tsx` |
| 3. Research → lay | No route | "Props & your lay →" sits beside "View all game picks →" and opens this game on Home, in view. | `matchup-intelligence.tsx` |
| 4. Zone → lay | No route | A signed-in line under the composer: "My lays · saved and in progress →" (`/parlays`). Signed-out members see the existing join card unchanged. | `community-feed.tsx` |
| 5. `/records` 404 | "Original publication →" went to a missing route | Official legs go to `/matchups/game/<game id>`, a new server redirect to that game's "All game picks" page (every published selection with its original price, case and risk). An unknown or malformed id goes to `/matchups`. Candidate legs keep `/feed#release-<id>`. | `parlay-workshop.tsx`, `src/app/matchups/game/[id]/page.tsx` |
| 6. Signed-out prop prompt | "Sign in to see game props." with no action | Followed by "Sign in →" (`/membership`, the same entry as the header Login) | `home-game-list.tsx` |
| 7. Duplicate hero links | Three links to `#home-games` | The tile goes to research and "Choose player props" opens the next game's row; "Full board · N games" still goes to the slate | `home-brief.tsx` |
| 8. "1 legs" | "Your parlay · 1 legs", "1 legs selected" | "1 leg" / "1 leg selected"; plural otherwise | `parlay-workshop.tsx` |
| — | "Draft storage is unavailable. Open the lay builder in The Zone." | "…Open Your lay to build it there." (the builder is at `/parlays`) | `home-game-list.tsx` |

**Preserved:**
- Multiple game rows can still be open at once.
- Stat filters, Copy all, Save leg / I'm tailing, Gambly and the prop details are unchanged.
- The draft format (`vq-parlay-draft:<uid>`) and the builder's revalidation of restored keys are unchanged.
- The saved-link contract `/community?saved=<id>` → `/parlays?saved=<id>#my-parlay-<id>` is unchanged.
- Save stays private, and Share stays opt-in.
- "Lay" and "parlay" wording is unchanged.

**Not done (outside claims):** the clipped sport-strip "Start a conversation →" (`community-stories.tsx`, shared navigation).

## U-C4: self-test

- **Walkthrough:** `journey-walkthrough.mjs` reports zero findings and zero page errors at 360, 390 and 1280 px, signed in and out. It exits 1 on any finding.
- **Negative control:** `UI_SMOKE_NEGATIVE=drop-game` keeps `?game=` out of the URL, and the run must report the lost game on Back.
- **Overflow:** none at 320, 360 or 390 px on `/`, `/community`, `/parlays` or `/matchups/<slug>`. The Zone composer row keeps its original widths (an earlier placement of "My lays" inside that row squeezed the sport selector to 18 px at 320 px and was moved out).
