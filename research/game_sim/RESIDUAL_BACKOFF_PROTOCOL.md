# Residual backoff for timeout cells v0.2.21 — frozen before fit (Claude)

Base: v0.2.20 (`artifacts/v0.2.20`, a preserved failure). One change only.

## Finding (`diagnostics/cell-replay-0.2.20.txt`)
Replaying the 2022 source's own 4,938 running opportunities through the fitted v0.2.20 cells gives
an expected call rate of 0.2278 against the observed 0.2461 (about 90 of 1,215 calls lost):
- opportunities read at depth 0 conserve exactly (0.1698 vs 0.1698);
- every deeper level loses mass (depth 1: 0.2849 vs 0.3170; depth 5: 0.5009 vs 0.7544).

A thin specific cell backs off to a parent that also contains the populous siblings, which already
have their own cells. The thin, high-pressure situations (e.g. last30@h2: 0.284 vs 0.477) inherit a
diluted rate. Earlier diagnostics show the lower call rate compounds: more runoff, fewer late snaps,
fewer opportunities.

## Change
Backoff cells become **residual cells**. In both families, opportunities resolve level by level
along their unchanged lookup chain (`timeout_cells.chain`):
1. Level 0 cells hold every opportunity with that key; those with n ≥ 30 resolve.
2. At level L, a cell holds only the opportunities not resolved at an earlier level; those whose
   level-L cell has n ≥ 30 resolve.
3. This repeats through the pre-declared coarsened floors.

The sampler is unchanged: it walks the same chain and reads the first stored cell with n ≥ 30.
Because a stored deeper cell now counts exactly the opportunities that reach it, replaying the
source through the cells reproduces the observed calls exactly, wherever no `~role` cell is used.

Exception, declared: `normal@all~role` keeps its v0.2.20 definition (the eligible role's marginal
over all normal-band opportunities in which it had a timeout). A residual version would be
unsupported.

Unchanged: families, opportunity definitions, amendment A1, keys, chains, minimum 30, coarsening
order, eligibility rules, fail-closed lookups, every other engine table, the gates.

## Acceptance (unchanged)
10,000 runs, seed 1701, old OT, all nine checks at the existing tolerances, zero failed or
unsupported runs, and saved-model reload. Plus a new unit test: replaying the training
opportunities through the fitted cells conserves calls exactly, except where `~role` is used. Before
the fit, a source support audit on the residual cells must show zero unresolved opportunities.
A failure is preserved; no retuning.
