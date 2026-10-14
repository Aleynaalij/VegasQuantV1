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

## Next stages
Pick cards (betting-slip layout), Records as a performance dashboard, the NBA desk, then retiring the legacy stylesheets (`globals.css`, `experience.css`, `sports-light.css`, `master.css`) page by page.
