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
