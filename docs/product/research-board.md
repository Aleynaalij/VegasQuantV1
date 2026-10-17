# Research board — October 17, 2026

The NFL selection gate blocks every NFL pick until a priced model is approved (R2), and it only
accepts a pick inside the two-hour lock window (R7). Nothing published automatically, so the legs
feed sat empty between manual drops. The research board fills it with a separate, labeled tier.

**What publishes.** `.github/workflows/research-board.yml` runs `scripts/research-board/run.ts` at
:20 past every third hour.
- **Candidate legs.** It reads the week's upcoming NFL games, the latest prop snapshots from all six
  books (observed within the last seven hours), and the nflverse weekly player stats. It then keeps
  the FanDuel "N+" over lines that:
  - are priced -150 to -299;
  - have five or more prior games whose median reaches the target;
  - cleared the target at least five points more often than the price's break-even (R1);
  - pass every automatic rule in `src/lib/leg-rules.ts`;
  - meet a minimum target: 15+ rushing or receiving yards, 150+ passing yards, 3+ receptions. Smaller
    targets (a QB at 5+ rushing yards) miss only on an injury or a fluke and say nothing about the read.
- **Board limits.** One leg per player per game, at most three per game and eight per run. A
  selection already published (research or official) is never repeated.
- **Release shape.** One release per game, expiring at kickoff, titled `Research board · AWAY @ HOME`.
- **Logging.** The job prints counts only, because the repository is public.

**How it is labeled.**
- **Kind.** Candidates carry `research: true` and `analysis_kind: "RESEARCH_BOARD"`, and
  `published_legs.kind` is `RESEARCH`.
- **Cards.** They read "Research board · automated · not an official pick" and state that no
  validated model edge is claimed.
- **Records.** Research legs are graded, price-tracked, line-shopped and alert-eligible like any
  published leg. They have their own "Research board record" on History. They are excluded from
  "Profit at published prices" (SINGLE and PICK_OF_DAY only) and from weekly platform performance
  (QUALITATIVE_EDITORIAL only).

**The database check** (migration `20261017000000_research_board_tier.sql`).
- **Which releases it covers.** A release whose every candidate is a plain research leg skips the
  NFL gate and goes through `private.enforce_research_board` instead. A release with any other leg
  still goes through the full gate.
- **What it checks for each leg:**
  - an upcoming, confirmed NFL game, and a release expiry no later than kickoff;
  - a full-game N+ rushing, receiving, passing or receptions target;
  - a FanDuel price from -150 to -299 that matches a stored FanDuel observation of that exact line,
    observed at most eight hours ago;
  - five or more games with a clear rate at least five points above break-even;
  - why, risk and sources;
  - no repeat of a research or official selection.
- **Identities.** Research identities live in `private.research_identities`. They never reserve an
  official identity, so a later official pick on the same line is not blocked. Each accepted board
  is journaled in `private.nfl_selection_gate_decisions` as `research_board`.

**Official picks are unchanged.** They still require the gate, including an approved model. When a
model is approved, an automated lock-time submitter can use the same data path.
