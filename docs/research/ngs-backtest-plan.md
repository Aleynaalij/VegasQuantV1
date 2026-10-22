# NGS risk flags: backtest plan (written before any results)

Owner request, October 22, 2026: test whether the Next Gen Stats risk flags on research legs would
have cut losing legs before any of them becomes a standing rule. This plan is fixed before the data
is examined. Changing a threshold after seeing holdout results voids the test.

## Question

Among legs that pass our recent-form rules, does a leg carrying an NGS risk flag clear its target
less often than a leg without one?

## Flags under test (as defined in `scripts/research-board/ngs.ts`)

Each flag uses the player's last three regular-season weeks before the game (volume-weighted). It
compares them with the quartiles of all player-weeks from earlier weeks of the same season.

| Flag | Statistic | Condition |
|---|---|---|
| F1 low separation | receiving yards, receptions | avg separation below the 25th percentile |
| F2 low catch rate | receptions | catch % below the 25th percentile |
| F3 YAC over expected | receiving yards | YAC over expected above the 75th percentile |
| F4 low RYOE | rushing yards | rush yards over expected per carry below the 25th percentile |
| F5 stacked boxes | rushing yards | 8+ defender boxes above the 75th percentile |
| F6 low CPOE | passing yards | completion % over expected below the 25th percentile |

## Candidate legs (no stored prices exist before 2026 Week 6)

For every player-week, 2018 through 2025 regular seasons, built from nflverse weekly player stats:

- Targets are the same "N+" milestones as the board: at least `MIN_TARGET` and in steps of 5 yards
  (passing yards in steps of 25, receptions in steps of 1).
- A target qualifies when the player's previous five games clear it at least 4 of 5 times and the
  five-game median is above it. That is R1 at an assumed -200 price: break-even 66.7% + 5 points.
- R5 applies: tight ends only on receptions.
- Each player keeps one leg per statistic per week: the highest qualifying target.
- The outcome is whether he cleared it that week. Games he did not play are dropped.
- Leakage guard: nothing from the game's own week, or later, enters its flags, form or quartiles.

## Split and test

- Development seasons: 2018–2023. Flags may be inspected; their definitions above do not change.
- Holdout seasons: 2024–2025, evaluated once.
- A flag becomes a **rule proposal** only if, on the holdout:
  - the flagged legs' clear rate is at least 8 points below the unflagged legs' for the same statistic;
  - there are at least 150 flagged legs;
  - the 95% interval of the difference (two-proportion, Wilson-based) excludes zero.
- A proposal goes to the owner for approval and the lessons file. Nothing changes the board, the
  model gate or official picks until the owner approves it.
- Flags that fail stay as descriptive context or are removed from the risk text.

## Live check

From the publish date of NGS context onward, published research legs are graded as usual. Their
record is split by flag as a forward check: too small to decide anything by itself, but it must not
contradict the holdout.

## Work split

- **NGS-002 (Codex):** `research/ngs/backtest.py` builds the candidate-leg dataset with as-of flags
  and outcomes. It loads full NGS history from the nflverse `nextgen_stats` release and weekly stats
  from `stats_player`. Unit tests cover the leakage guard, R1/R5 qualification and the flag
  definitions matching `ngs.ts`. It writes a CSV and per-flag counts. It does not compute the decision.
- **NGS-003 (Claude):** review NGS-002 and run the pre-registered holdout evaluation. Report it on
  #65, with a rule proposal only for a flag that meets every condition above. Then add NGS
  features to the shadow model (step 3).
