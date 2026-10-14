# Vegas Quant Premium design system

Sportsbook-style, dark-first. Defined in `src/app/premium.css`, loaded after every legacy stylesheet.

## Theme
- Dark is the default everywhere. On 2026-10-14 every saved choice was reset to dark (the storage key moved to `vq-theme-v2`). Members can still switch to Light in Account → Appearance, and that choice is remembered. The first-login "Choose your look" pop-up is retired.
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
- Minimum text size is 11px. All text meets WCAG AA contrast in both themes.

## Brand
The logo is the **Diamond Q**: a playing-card diamond (Vegas) cut into a Q (Quant), with a money-green tail (the edge). It is drawn once in `BrandMark` and in `public/brand/vq-mark.svg`. App icons are `public/icons/vq-diamond-*.png`. Colors: navy `#101a33` tile, diamond `#2f6bff` / facet `#5a8bff`, tail `#1ed883`.

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
- Next pages: matchups/game board, Home community, Account. Use the same method: find the classes used only by that page's components, move them, merge, then pixel-compare.
