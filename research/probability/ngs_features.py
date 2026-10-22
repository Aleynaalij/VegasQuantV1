"""Next Gen Stats inputs for v0.4 (see ngs-v0.4-plan.md). Earlier weeks only.

For a player-game in (season, week), each input uses the player's NGS weekly rows strictly before
that week, from the same and the previous regular season, at most his latest 8 NGS weeks. Rates are
volume-weighted and shrunk toward the league mean of all earlier NGS player-weeks with 4
pseudo-weeks, then expressed as the deviation from that mean. No row means a deviation of 0, and
`ngs_coverage` records how many weeks were available.
"""
from __future__ import annotations
from bisect import bisect_left
from collections import defaultdict
import numpy as np
import pandas as pd

MAX_WEEKS = 8
PSEUDO_WEEKS = 4
# (input name, NGS column, weight column). The plan weights every receiving rate by targets and
# every rushing rate by carries.
SPEC = {
    "receiving": [("ngs_separation", "avg_separation", "targets"),
                  ("ngs_air_share", "percent_share_of_intended_air_yards", "targets"),
                  ("ngs_yac_oe", "avg_yac_above_expectation", "targets")],
    "rushing": [("ngs_ryoe", "rush_yards_over_expected_per_att", "rush_attempts"),
                ("ngs_box8", "percent_attempts_gte_eight_defenders", "rush_attempts")],
}
FEATURES = {m: [name for name, _, _ in spec] + ["ngs_coverage"] for m, spec in SPEC.items()}


class NgsIndex:
    """Per-market index of regular-season NGS player-weeks, queried as of a (season, week)."""

    def __init__(self, frames: dict[str, pd.DataFrame]):
        self.players: dict[str, dict[str, list]] = {}
        self.league: dict[str, tuple[list, np.ndarray, np.ndarray, np.ndarray]] = {}
        for market, spec in SPEC.items():
            d = frames[market]
            d = d[(d.season_type == "REG") & (d.week >= 1)].copy()
            if d.duplicated(["season", "week", "player_gsis_id"]).any():
                raise ValueError(f"Duplicate NGS {market} player-week")
            cols = [c for _, c, _ in spec]
            weights = [w for _, _, w in spec]
            d = d.dropna(subset=cols).sort_values(["season", "week"])
            keys = list(zip(d.season.astype(int), d.week.astype(int)))
            values = d[cols].to_numpy(dtype=float)
            w = np.column_stack([d[c].to_numpy(dtype=float) for c in weights])
            w = np.where(np.isfinite(w) & (w > 0), w, 0.0)
            by_player = defaultdict(list)
            for key, pid, v, ww in zip(keys, d.player_gsis_id, values, w):
                by_player[pid].append((key, v, ww))
            self.players[market] = by_player
            # Cumulative league sums in chronological order for as-of means.
            self.league[market] = (keys, np.cumsum(values * w, axis=0), np.cumsum(w, axis=0), np.arange(1, len(keys) + 1))

    def features(self, market: str, player_id: str, season: int, week: int) -> np.ndarray:
        key = (int(season), int(week))
        keys, value_sums, weight_sums, counts = self.league[market]
        n = bisect_left(keys, key)  # rows strictly before this week
        names = SPEC[market]
        if n == 0:
            return np.zeros(len(names) + 1)
        league_mean = value_sums[n - 1] / np.maximum(weight_sums[n - 1], 1e-9)
        league_weight = weight_sums[n - 1] / counts[n - 1]  # average weight of one player-week
        rows = [r for r in self.players[market].get(player_id, []) if r[0] < key and r[0][0] >= key[0] - 1][-MAX_WEEKS:]
        if not rows:
            return np.zeros(len(names) + 1)
        v = np.array([r[1] for r in rows])
        w = np.array([r[2] for r in rows])
        shrunk = ((v * w).sum(axis=0) + PSEUDO_WEEKS * league_weight * league_mean) / (w.sum(axis=0) + PSEUDO_WEEKS * league_weight)
        return np.append(shrunk - league_mean, len(rows) / MAX_WEEKS)
