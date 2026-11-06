# Lobby click-to-destination inventory (LOBBY-DESTINATIONS-01 · C1)

Base: main `3d7d862`. Method: synthetic browser crawl of every visible control (signed out and signed
in, 390px and 1280px; one hop into each destination at 390px) against the local Supabase stub, plus
code inspection of each Home component for controls that only render with data. **Evidence level:
code-inspected + synthetic-tested. Nothing here is deployed- or live-verified;** production reads were
not authorized for this batch and were not performed.

Legend — **Action:** Reuse (works, keep) · Fix (concrete gap, owner fixes) · New (lobby builds it) ·
Decision (owner must decide). **Owner:** C = Claude lane, X = Codex lane, M = Mike.

Stub limits (not product defects unless stated): the stub has no games, no `community_story_clock`,
no `sports_home` for NHL/NCAAB, and returns `null` for unknown RPCs.

## Route contract (shared with X4)

| URL | Result |
|---|---|
| `/` | Neutral lobby. No sport chip selected; no NFL-only claims. |
| `/nfl` | Existing NFL desk (`DeskApp page="home"`), NFL chip selected. |
| `/nba`, `/nhl`, `/ncaab` | Unchanged sport desks. |
| `/?game=<slug>` (± other params, ± `#home-games`) | Server 308 → `/nfl?game=<slug>…#home-games`, other params kept. |
| `/#home-games` (hash only; never reaches the server) | Lobby client redirect, `replace` → `/nfl#home-games`. No Back loop. |
| `homeGamePath(slug)` | `/nfl?game=<slug>#home-games` (was `/?game=…`). |
| `/community?build`, `/community?saved` | Unchanged → `/parlays` (existing server redirect). |
| `/feed?view=…` | Unchanged (redirects to `/community`; never labelled “research”). |
| `SPORTS.nfl.home` | `/nfl`. Brand/Home links go to `/`, not to a sport. |

## 1. Shared chrome (every page)

| Control | Goes to / does | Access | Consumer expects | Current gap | Owner | Action | Acceptance |
|---|---|---|---|---|---|---|---|
| Skip to content | `#main-content` | all | jump past nav | — | C | Reuse | focus lands in main |
| Brand “VEGAS QUANT” (topbar + sidebar) | `SPORTS[sport].home` → `/` for NFL | all | the lobby | brand means “current sport home”; on NBA it goes to `/nba` | C | Fix | brand → `/` from every page |
| Breadcrumb | label only | all | where am I | matchups/game pages say “The Zone”; Home says “Sports desk” | C | Fix | “Games”/“Lobby”; Zone only for community |
| Let’s sweat (NFL, not community) | sweat panel | member | live-sweat tools | shown whenever chrome is NFL, incl. the would-be lobby | C | Fix | hidden on lobby |
| Install app | install prompt / help | all | install PWA or how-to | — (not re-verified on iOS) | C | Reuse | prompt or instructions, never dead |
| Notifications bell | `/notifications` | member | inbox | page throws `Cannot read … 'snapshot_at'` when inbox RPC returns null (synthetic) | X/notif owner | Fix (report) | null/failed inbox → error + Retry, no crash |
| Profile / Account link | `/community/<username>` or sign-in | all | my profile / sign in | — | C | Reuse | signed-out → sign-in entry |
| Sport chips NFL/NBA/NHL/College | `chipHref` (same section per sport) | all | that sport, chip selected | NFL chip = `/`; lobby would show NFL selected (Shell defaults sport to nfl) | C | Fix | no chip selected on `/`; NFL → `/nfl` |
| NHL chip hold (`NhlChipHold`) | gated chip | invite | — | special-case gate; keep behaviour | C | Reuse | unchanged |
| Story rail | viewer of last-24h posts | member | IG-style stories | stub: “Stories unavailable · Retry” (no clock RPC). Live state unknown | C (C4) | Reuse/verify | rail on lobby + community; signed-out sees no member data |
| “Open Community →” / “All caught up” | `/community` | all | the Zone | — | C | Reuse | — |
| Sidebar: Home | `home` | all | lobby | resolves to sport home | C | Fix | → `/` |
| Sidebar: VQ Slots | `/slots` | all | Slots | see §5 | C | Reuse | — |
| Sidebar: The Zone | `/community[?sport=]` | all | Zone | — | C | Reuse | — |
| Sidebar: Records (admin only) | `/history` or `/<sport>/records` | admin | records | correctly admin-gated; `/history` itself says “Records are private.” to others | C | Reuse | never shown to members |
| Sidebar: Account | `/membership` | all | account | — | C | Reuse | — |
| Sidebar card “Know your number · MINIMUM EDGE 3.0%” | text | all | — | NFL-only claim would show on the lobby | C | Fix | NFL desk only |
| Mobile tabs Home/Slots/Zone/Account | as sidebar | all | as sidebar | Home → sport home | C | Fix | Home → `/` |
| Swipe tabs (`SwipeTabs`) | chip-to-chip swipe | all | next sport | lobby must not be a swipe stop that selects NFL | C | Fix | swipe from lobby → first sport, chip state truthful |
| Footer: Methodology/About/FAQs/Support/Privacy/Terms/Responsible play | static pages | all | explanations | all 200 (see §8) | C | Reuse/Fix §8 | each resolves |

## 2. Current Home (`/` today = NFL desk) — moves to `/nfl`, lobby reuses pieces

| Control | Goes to / does | Access | Gap | Owner | Action |
|---|---|---|---|---|---|
| Home heading “Vegas Quant · Sports research…” + “Home →” button | `/` (self-link) | all | self-link on Home is dead weight | C | Fix (drop on `/nfl`) |
| VQ Tonight: game rows | `g.href` per sport | all | per-sport failures shown (“NHL, NCAAB games could not load. Retry”) — good | C | Reuse on lobby |
| VQ Tonight: Retry | refetch | all | — | C | Reuse |
| VQ Tonight: “Your lays” card | `/parlays` | all | label must match X2 terms | C/X | Reuse, relabel per X2 |
| VQ Tonight: “The Zone” card | `/community` | all | — | C | Reuse |
| VQ Tonight: membership link | `/membership` | signed out | — | C | Reuse |
| Track record card (`HomeRecordCard`) | totals; “Full record →” `/history` for admins only | all (when record visible) | correctly gated: members/visitors get totals, never the admin link | C | Reuse on lobby |
| Contributor composer (`RubyHub composerOnly`) | submit lay | contributors | contributor-only; keep off the neutral lobby hero | C | Reuse on `/nfl`; decide lobby placement |
| Next kickoff (`HomeBrief`) | `/matchups/<slug>`, `homeGamePath`, `#home-games` | all | NFL-only; fine on `/nfl` | C | Reuse on `/nfl` |
| Hero “Explore the NFL slate” | `#home-games` | all | fine on `/nfl`; on lobby must point to `/nfl#home-games` | C | Fix |
| Live scores (`LiveNow`) | `/matchups/<slug>` | all | — | C | Reuse |
| Game props (`HomeGameList`) | `/matchups/<slug>`, `/parlays`, `/membership` | all | reads `?game=` — must keep working at `/nfl` | C | Fix (route) |
| VIP leaderboard (`RubyHub leaderboardOnly`) | `/community?view=vip`, lay links | all | — | C | Reuse |
| Admin “Private Data Intelligence →” | `/admin/intelligence` | admin | — | C | Reuse (admin only) |

## 3. Sports / games / research destinations

| Destination | Finding (synthetic) | Owner | Action |
|---|---|---|---|
| `/nba` | “No NBA games this week.” empty state renders | C | Reuse |
| `/nhl`, `/ncaab` | stuck on “Loading the slate… Loading games…” when the slate RPC returns null; no failed/empty distinction for a malformed/null answer | C | Fix (loading vs empty vs failed distinct) |
| `/matchups` | search, week, slot filters, sort, upcoming toggle render; **h1 “THE ZONE · GAMES”** conflicts with Zone = member talk | C | Fix (terminology) |
| `/matchups/<slug>`, `/games/<slug>` | game workspace; not exercised without data | C | Not run (needs game fixture) |
| `/feed` | redirects to `/community` (no query kept) | C | Reuse; never label as research |
| Sport `…/records` | 200 with headings | C | Reuse (check access copy §8) |
| `/nba/rules` | rulebook renders | C | Reuse |

## 4. Builder / saved (Codex lane — X1–X3)

| Destination | Finding | Owner | Action |
|---|---|---|---|
| `/parlays` | h1 “Your lay”; lobby/VQ Tonight call it “Your lays”, footer copy elsewhere “My lays”/“parlays” | X | Fix (X2 labels) |
| `/saved` | “Saved for the sweat.” published-leg board with filters (ALL/SINGLE/PICK OF DAY/HAIL MARY/OFFICIAL/RESEARCH) | X/C | Decision: is `/saved` linked from anywhere a member sees? (no chrome link found) |
| `VqStamp` “VQ APPROVED” | heuristic badge | X | Fix (X2) |

## 5. VQ Slots (`/slots`)

Sport buttons NFL/NBA/NHL/NCAAB, lever, “SPIN 8 LEGS”, refresh board render. Source pool/availability
copy not yet reviewed against #139. Owner C · Action: review copy (no broad-coverage or payout claims).

## 6. The Zone / social

| Destination | Finding | Owner | Action |
|---|---|---|---|
| `/community` signed out | Zone entry renders (24 controls) | C | Reuse |
| `/community` signed in | feed, composer, reactions, lay rows (46 controls) | C | Reuse (reactions/comments/share merged #213/#214) |
| `/community?view=vip` | VIP view renders | C | Reuse |
| `/community/<username>` | signed out “Meet the community”; signed in profile | C | Reuse |

## 7. Notifications / account

| Destination | Finding | Owner | Action |
|---|---|---|---|
| `/notifications` signed in | filters, mark-all, refresh, preferences, empty state render; **crash in console when inbox RPC returns null** (stub) | notif owner | Fix (report to owner; no backend change) |
| `/membership` signed out | “JOIN THE DESK.” plans | C | Reuse (fixture-only checkout tests) |
| `/membership` signed in | “YOUR ACCOUNT.” (47 controls) | C | Reuse |
| `/account` | 404 (not linked anywhere) | — | none |

## 8. Records / help / legal

| Page | Finding | Owner | Action |
|---|---|---|---|
| `/history`, `/performance` | “Records are private.” for non-admins; only a Back link. No member-facing link found (card and sidebar are admin-gated) | C | Reuse |
| `/methodology`, `/about`, `/faq`, `/privacy`, `/terms`, `/responsible-play` | all 200 with content | C | Copy review for Zone/Community terminology |
| `/support` | 200 | M | **Decision:** monitored support contact still missing — no address/intake invented |

## Owner decisions (so far)

1. **Support contact** — no monitored address/intake exists; page must not imply one.
2. **`/saved`** — keep as a member destination (and link it), or leave unlinked?
3. **Contributor composer** — on the lobby, or only on `/nfl` and the Zone?

## Status

C1 inventory: **draft complete for Home + chrome + one hop**; per-game/matchup detail rows need a game
fixture (not run). Route contract posted to #65 for X4.
