# Vegas Quant Premium design system

Sportsbook-style and dark only. Defined in `src/app/premium.css`, loaded after every other stylesheet. Navigation: Home / The Zone / Community / Records / Account, with separate NFL and NBA desks (see `community-zone.md`).

## Theme
- Vegas Quant is dark only (2026-10-14). `<html>` renders with `data-theme="dark"` from the server, the Light mode and Appearance setting were removed, and old saved theme choices are cleared on load.
- Light-theme styles were deleted on 2026-10-14: every `html[data-theme="light"]` and `html:not([data-theme="dark"])` rule, the theme picker's CSS, and 245 light color declarations in the legacy files that the dark theme always overrode. Deletion was checked in the browser (computed styles of every element on 20 pages, phone and desktop, signed in and out) and by pixel-identical screenshots. Light colors that remain in legacy files are either still visible (no dark override) or only reached in hover/focus states the check could not see; remove those as each page is migrated.
- Tokens live on `html[data-theme="dark"]:root`. Change colors here, not in components.

| Token | Use |
| --- | --- |
| `--bg`, `--bg-raised` | Page and inset backgrounds |
| `--panel`, `--panel2`, `--panel3` | Card surfaces, from base to most raised |
| `--line`, `--line-strong` | Borders and dividers |
| `--text`, `--muted`, `--faint` | Text, from primary to tertiary |
| `--brand`, `--brand-hi`, `--brand-ink` | Actions, selection and links |
| `--money` | Wins, positive CLV and live/positive status only |
| `--warn` | Unverified prices, stale quotes and cautions |
| `--loss` | Losses and live-game alerts |

## Rules
- Green means money won or positive edge. Never use it for warnings; unverified prices use `--warn`.
- One primary (blue gradient) action per card. Secondary actions use the ghost style.
- Selected chips and tabs are solid (`--text` background); unselected chips are outlined.
- Numbers use tabular figures so prices and countdowns don't jitter.
- Minimum text size is 11px. All text meets WCAG AA contrast on the dark theme.

## Brand
The logo is the **prestige VQ**: an original interlocking serif VQ monogram, drawn in `BrandMark` and `public/brand/vq-mark.svg`. Cool silver `#E4EAF4`, royal blue `#4378FF`, midnight navy `#0B1220`. Installed app assets are `public/icons/vq-prestige-*.png`; legacy icon URLs also resolve to the current mark. Use the monogram for small icons and a spaced VEGAS QUANT wordmark for opening screens. Vegas Quant is a product of JourneyBuilt, LLC.

## Identity
Signed-in members with a community profile see their photo in the top bar, linking to their profile and activity. Home doesn't show the profile card to them; signed-out visitors still see the Join the community card.

## Home
`HomeBrief` (`src/components/home-brief.tsx`) leads Home: the next kickoff with team logos and a live countdown (`kickoff-countdown.tsx`), the next three games, three shortcuts and the NBA banner. New hero classes use the `vq-` prefix so legacy styles never reach them.

## Pick cards
`PickCard` opens as a betting slip: team logos and matchup, the market label and selection, an odds box with the book, and a key-numbers strip (edge, model %, market %, grade or confidence). The full slip below is unchanged.

## Records
`RecordsDashboard` leads the Ledger: record, net P/L, ROI and closing line value, a settled P/L chart and recent form. Numbers come from `lib/performance.ts`, the same source as the Performance tab.

## NBA rules
`lib/nba-rules.ts` holds the Bible's R-01 to R-40 in five groups; `/nba/rules` is the rulebook. Picks and published legs show their cited rules as chips linking to the rule.

Citations are required for NBA official picks (migration `20261014015003_nba_bible_rule_citations`):
- `games.sport` is `'nfl'` or `'nba'`; every existing game is NFL.
- `official_picks.rule_ids` is filled by a trigger from the case/risk text (`why_like`, `why_lose`) when empty, and validated against R-01..R-40.
- An NBA pick with no citation is rejected at publish time. NFL picks are unaffected.
- To publish an NBA pick, the game must be stored with `sport = 'nba'`. The admin "Add game" form doesn't set sport yet; NBA games are expected from the schedule feed.

## Legacy stylesheets
- `dark-surfaces.css` is generated from the legacy files: every element they force onto a white or cream background gets a dark surface in dark mode. Remove entries as legacy rules are retired.
- Dead CSS (selectors whose classes appear nowhere in the code) was removed from the legacy files on 2026-10-14. That cut about 950 lines and 280 selectors, and was checked by pixel-comparing 60 renders (15 pages × phone/desktop × dark/light) before and after.
- **The Zone moved (2026-10-14):** every rule for the 56 Zone-only classes (feed, selections, tickets, win slips) was moved out of the four legacy files into `src/app/zone.css`, in cascade order. 257 selectors merged into 200 rules, and the legacy files lost about 600 lines. Pixel comparison of all 60 renders showed zero changes. Grouped `:is()` rules stay in the legacy files for now, because splitting them would change specificity.
- **Records moved (2026-10-14):** 14 Records-only classes moved to `src/app/records.css` (63 selectors merged into 50 rules). Element-level comparison caught three cascade-order differences, which are pinned in the file. All 60 renders match.
- **Games view moved (2026-10-14):** 17 Games-only classes moved to `src/app/games.css` (122 selectors merged into 75 rules). Phone-size `@media` blocks are kept after the base rules they override, and phone search fields stay 16px. All 30 dark renders match. Team names now size to their card, so they fit at every width, and the game grid is one column below 900px.
- **Community and Account moved (2026-10-14):** 28 Community-only classes moved to `src/app/community.css` (217 selectors merged into 156 rules) and 11 Account-only classes to `src/app/account.css` (42 into 38). Signed-in screens were added to the pixel check (40 renders, all matching). One phone-only margin that never applied in the old cascade was dropped rather than revived. Account links and the photo hint use brand blue instead of win-green.
- **Legacy files retired (2026-10-14):** `globals.css`, `experience.css`, `sports-light.css` and `master.css` are gone. Their remaining rules were split by the components that use each class into `base.css` (font import, element defaults, keyframes), `shell.css` (navigation, buttons, forms, cards, notices, plus any rule shared by more than one area), `home.css`, `picks.css`, `research.css` and `admin.css`. These load where the legacy files did, and each keeps the original cascade order. A grouped `:is()` rule only goes to an area file when every class in it belongs to that area. Checks: computed styles of every element matched the previous build on 21 pages (phone and desktop, signed in and out), and all 42 screenshots were identical. Hover and focus states weren't compared.
- CSS load order (`src/app/layout.tsx`): base, ask-vegas, shell, home, picks, research, admin, then the page files (zone, records, games, community, account, age-verification, nba), then dark-surfaces and premium. Put new rules in the file for their area; put tokens and cross-page polish in `premium.css`.
