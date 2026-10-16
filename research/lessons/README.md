# Lessons learned (NFL selection)

Dated post-game reviews of Vegas Quant's published legs: what won, what lost, and the selection rules that change as a result. They are written for both people and the research assistant (ChatGPT) that builds the daily cards.

## How to use these files

1. Read **Standing rules** below before building any card. They are the current, cumulative version.
2. Read the most recent dated files for the evidence behind each rule.
3. The [NFL bible](../nfl/README.md) still governs. These rules apply it to our actual results and never loosen it: positive expected value of at least 3%, closing-line value over short-term results, and straight bets over parlays.
4. Samples are small. A rule here is a guardrail until enough graded legs exist to measure it. Each file states its sample size.

## Standing rules (updated 2026-10-16)

| # | Rule | Why (file) |
|---|------|------------|
| R1 | **Historical clear rate must beat the price.** Over the player's last 5+ games, the share that cleared the target must exceed the price's break-even rate by at least 5 points. If the leg's own risk note shows a clear rate below break-even, do not publish it. | Engram (2026-10-16) |
| R2 | **No near-even-money props without a priced model probability.** Legs priced -149 or longer went 4-9 (-5.27u). Our wins come from alternate thresholds well below the player's median, priced -150 to -249, which went 18-1 (+8.96u). | 2026-10-16 |
| R3 | **Heavy chalk is an anchor, not a pick.** Legs at -500 or shorter went 5-0 for only +0.60u, and one loss at -900 erases nine wins. Never use one as the Pick of the Day; keep the Pick of the Day between -150 and -300. | 2026-10-16 |
| R4 | **Halftime legs: fewer and safer.** Halftime singles are 25-8 but only +0.43u on priced legs (70% hit vs 67% break-even), and halftime unders are 0-2. At halftime publish at most 3 legs, overs only, priced -150 to -249. Skip receiving overs for a team leading by 10+, and skip rushing overs that need more than 30% of the player's first-half yards in the second half. | Dobbins, Harvey (2026-10-16) |
| R5 | **Tight ends: receptions over low yardage.** Low tight-end yardage targets (15+) live on one catch: last night's two missed by 2 and cleared by 1. Receptions legs are 6-0. Prefer a tight end's receptions line, or skip. | Engram, Barner (2026-10-16) |
| R6 | **Parlays: three or four legs, every leg passes R1-R5 alone.** Parlays are 0-2, and both lost by one leg. Never add a leg just to fill a slot. The bible says to favour singles. | 2026-10-16 |
| R7 | **Re-check the price at lock.** If a leg's price drifts 15+ cents against us between publish and kickoff, drop or replace it. (Watch item, one example: Engram -240 to -220, lost.) | 2026-10-16 |
| R8 | **Every published leg needs an exact price and no duplicates.** 22 graded legs had no price, so their value can't be judged, and one James Cook pick was recorded twice. | 2026-10-16 |

## Files

- [2026-10-16 — Thursday Night Football, Seahawks @ Broncos + season review](2026-10-16.md)

## Adding a new file

Name it `YYYY-MM-DD.md` (the review date), follow the structure of the latest file, then update **Standing rules** above: add, tighten or retire a rule, and cite the file.
