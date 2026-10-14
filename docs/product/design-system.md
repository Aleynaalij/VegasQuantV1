# Vegas Quant Premium design system

Sportsbook-style, dark-first. Defined in `src/app/premium.css`, loaded after every legacy stylesheet.

## Theme
- Dark is the default for anyone who has not chosen a theme. People who picked Light keep it (`vq-theme-v1` in local storage).
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

## Home
`HomeBrief` (`src/components/home-brief.tsx`) leads Home: the next kickoff with team logos and a live countdown (`kickoff-countdown.tsx`), the next three games, three shortcuts and the NBA banner. New hero classes use the `vq-` prefix so legacy styles never reach them.

## Pick cards
`PickCard` opens as a betting slip: team logos and matchup, the market label and selection, an odds box with the book, and a key-numbers strip (edge, model %, market %, grade or confidence). The full slip below is unchanged.

## Records
`RecordsDashboard` leads the Ledger: record, net P/L, ROI and closing line value, a settled P/L chart and recent form. Numbers come from `lib/performance.ts`, the same source as the Performance tab.

## NBA rules
`lib/nba-rules.ts` holds the Bible's R-01 to R-40 in five groups; `/nba/rules` is the rulebook. Any pick or published leg whose case or risk text cites a rule ID (for example "PASS · R-20") shows it as a chip linking to the rule. No database change is needed; to make citations mandatory for NBA picks, add a `rule_ids` column later.

## Legacy stylesheets
- `dark-surfaces.css` is generated from the legacy files: every element they force onto a white or cream background gets a dark surface in dark mode. Remove entries as legacy rules are retired.
- Dead CSS (selectors whose classes appear nowhere in the code) was removed from the legacy files on 2026-10-14. That cut about 950 lines and 280 selectors, and was checked by pixel-comparing 60 renders (15 pages × phone/desktop × dark/light) before and after.
- Next: move each page's remaining legacy rules into token-based styles, then delete the legacy files.
