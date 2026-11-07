"""Section 3 wiring: the team layer adjusts only the stage-2 play table of the pinned base.

`TeamSampler` overrides the base `Sampler.play_table` hook. Context selection, support thresholds,
budget filtering, timeout decisions, stop durations, runoffs and warning-censored resampling all
use the base tables unchanged; only the weights passed to the one play draw move. The draw itself
is the same single `rng.choices` call, so no RNG call is added or removed. With every coefficient
zero the hook returns the base table object (the base path).
"""
from ..model import Sampler
from .mapping import adjust


def factory(coefficients):
    """sampler_factory for batch.game: coefficients = {'home': {...}, 'away': {...}} (possession side)."""
    zero = all(v == 0 for side in coefficients.values() for v in side.values())

    cache = {}  # adjusted tables depend only on (context, possession, keys) within one game

    def make(model, seed, tables=None):
        return Sampler(model, seed, tables) if zero else TeamSampler(model, seed, tables, coefficients, cache)
    return make


class TeamSampler(Sampler):
    def __init__(self, model, seed, tables=None, coefficients=None, cache=None):
        super().__init__(model, seed, tables)
        self.coefficients = coefficients or {}
        self._cache = {} if cache is None else cache

    def play_table(self, s, ctx, table):
        if s.phase != 'scrimmage':
            return table
        c = self.coefficients.get(s.possession)
        if not c or all(v == 0 for v in c.values()):
            return table
        key = (ctx, s.possession, tuple(table[0]))
        hit = self._cache.get(key)
        if hit is None:
            entries = dict(zip(table[0], table[1]))
            log = []
            new, counts = adjust(entries, self.model['templates'], **c, context=ctx, log=log)
            weights = [new[k] for k in table[0]]
            # v0.3.1: keep each dropped tilt's side, context and target shift as evidence.
            evidence = [f"team:evidence:{x['status']}|{s.possession}|{x['context']}|{x['target_shift']:.6f}" for x in log]
            hit = (table[0], weights, sum(weights)), counts, evidence
            self._cache[key] = hit
        # Reported through the per-game fallbacks as team:* (no RNG involved).
        self.fallbacks['team:adjusted_draws'] += 1
        for k, v in hit[1].items():
            self.fallbacks[f'team:{k}'] += v
        for k in hit[2]:
            self.fallbacks[k] += 1
        return hit[0]
