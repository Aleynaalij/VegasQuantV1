"""Game-script inputs for v0.5 rushing (see rushing-v0.5-plan.md).

From the game's spread and total, on the player's team's side:
  team_implied_points = log((total / 2 + margin / 2) / 22)
  team_spread         = margin / 10
where margin is the team's expected margin (positive = favored). Historical rows use nflverse
schedules (`spread_line` positive = home favored, `total_line`), which are closing lines.
"""
from __future__ import annotations
import numpy as np
import pandas as pd

FEATURES = {"rushing": ["team_implied_points", "team_spread"]}


def line_features(total: float, margin: float) -> np.ndarray:
    if not (np.isfinite(total) and np.isfinite(margin)) or total <= 0:
        raise ValueError("Game spread and total required")
    implied = max(total / 2 + margin / 2, 1.0)
    return np.array([np.log(implied / 22), margin / 10])


class GameLines:
    """Regular-season lines keyed by (season, week, team)."""

    def __init__(self, schedules: pd.DataFrame):
        d = schedules[schedules.game_type == "REG"].dropna(subset=["spread_line", "total_line"])
        self.lines: dict[tuple[int, int, str], tuple[float, float, str]] = {}
        for g in d.itertuples(index=False):
            key = int(g.season), int(g.week)
            for team, opponent, margin in ((g.home_team, g.away_team, g.spread_line),
                                           (g.away_team, g.home_team, -g.spread_line)):
                if (*key, team) in self.lines:
                    raise ValueError(f"Duplicate game line for {team} {key}")
                self.lines[(*key, team)] = (float(g.total_line), float(margin), opponent)

    def features(self, market: str, team: str, opponent: str, season: int, week: int) -> np.ndarray:
        if market not in FEATURES:
            return np.zeros(0)
        line = self.lines.get((int(season), int(week), team))
        if line is None or line[2] != opponent:
            raise ValueError(f"No game line for {team} vs {opponent} {season} week {week}")
        return line_features(line[0], line[1])
