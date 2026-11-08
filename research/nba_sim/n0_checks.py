"""N0 data checks for the NBA simulator (N0_PROTOCOL.md §2, §3). Read-only, standard library only.

python3 -I research/nba_sim/n0_checks.py --pbp play_by_play_2025.csv --box player_box_2025.csv --out report.json

Validates the source; fits nothing:
  * population: regular-season game IDs, per-team counts, All-Star and NBA Cup championship exceptions;
  * points: per-team sum of scoring-play values equals the final score row and the box-score points;
  * possessions: rebuilt from the event sequence in `game_play_number` order;
  * free-throw trips: every "k of m" trip complete;
  * fail closed: events that cannot be assigned are counted by type, and games are listed.
"""
import argparse
import csv
import json
import re
from collections import Counter, defaultdict

ALL_STAR = {"CHK", "KEN", "SHQ", "CAN", "LEB", "GIA", "EAST", "WEST"}  # All-Star exhibitions 2023-2025
FT = re.compile(r"^Free Throw - (?:(Technical)|(Flagrant|Clear Path) )?(?:(\d) of (\d))?")


def kind(r):
    t = r["type_text"].replace("\n", " ")
    if t.startswith("Free Throw"):
        return "ft"
    if r["shooting_play"] == "true":
        return "fg"
    if "Turnover" in t and t != "No Turnover":
        return "to"
    if t == "Defensive Rebound":
        return "dreb"
    if t == "Offensive Rebound":
        return "oreb"
    if t in ("End Period", "End Game"):
        return "end"
    return "other"


def owner_after(r, k, team, other, nxt):
    """Team holding the ball after this event, or None if unchanged/unknown."""
    if k == "fg":
        if r["scoring_play"] != "true":
            return team  # a miss: the shooting team still "has" it until a rebound
        # A made FG passes the ball unless an and-one free throw by the same team follows.
        if nxt is not None and kind(nxt) == "ft" and nxt["team_id"] == team and " 1 of 1" in nxt["type_text"]:
            return team
        return other[team]
    if k == "ft":
        m = FT.match(r["type_text"].replace("\n", " "))
        if m and m.group(1):
            return None  # technical: possession unchanged
        retains = bool(m and m.group(2))
        if m and m.group(3) and m.group(3) == m.group(4):  # last free throw of the trip
            if retains:
                return team
            return other[team] if r["scoring_play"] == "true" else team
        return team
    if k == "to":
        return other[team]
    if k in ("dreb", "oreb"):
        return team
    return None


def check_game(rows):
    """Possessions per team (runs of ball ownership, reset each period), points, fail-closed counts."""
    home, away = rows[0]["home_team_id"], rows[0]["away_team_id"]
    other = {home: away, away: home}
    poss = Counter()
    pts = Counter()
    unassigned = Counter()
    ft_incomplete = 0
    trip = None
    owner = None
    acting = [r for r in rows if kind(r) in ("fg", "ft", "to", "dreb", "oreb", "end")]
    for i, r in enumerate(acting):
        k, team = kind(r), r["team_id"]
        if k == "end":
            owner = None  # each period starts a fresh possession
            continue
        if team not in other:
            unassigned[r["type_text"].replace("\n", " ")] += 1
            continue
        if r["scoring_play"] == "true":
            pts[team] += int(r["score_value"] or 0)
        if k == "ft":
            m = FT.match(r["type_text"].replace("\n", " "))
            if m and m.group(3):
                n, of = int(m.group(3)), int(m.group(4))
                if n == 1:
                    if trip and len(trip[1]) < trip[2]:
                        ft_incomplete += 1
                    trip = (team, {1}, of)
                elif trip and trip[0] == team:
                    trip[1].add(n)
                if trip and n == of:
                    if len(trip[1]) < of:
                        ft_incomplete += 1
                    trip = None
        # The acting team holds the ball for offensive actions (shots, free throws, turnovers);
        # a defensive rebound is the first action of a new possession.
        actor = other[team] if k == "dreb" else team
        if actor != owner:
            poss[actor] += 1
            owner = actor
        nxt = acting[i + 1] if i + 1 < len(acting) else None
        after = owner_after(r, k, team, other, nxt)
        if after is not None and after != owner:
            poss[after] += 1
            owner = after
    return home, away, poss, pts, unassigned, ft_incomplete


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--pbp", required=True)
    p.add_argument("--box", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()

    games = defaultdict(list)
    for r in csv.DictReader(open(a.pbp, newline="")):
        if r["season_type"] == "2":
            games[r["game_id"]].append(r)
    box = defaultdict(int)
    for r in csv.DictReader(open(a.box, newline="")):
        if r.get("season_type", "2") == "2":
            try:
                box[(r["game_id"], r["team_id"])] += int(float(r["points"] or 0))
            except ValueError:
                pass

    all_star = sorted(g for g, rs in games.items() if rs[0]["home_team_abbrev"] in ALL_STAR or rs[0]["away_team_abbrev"] in ALL_STAR)
    kept = {g: sorted(rs, key=lambda r: int(r["game_play_number"])) for g, rs in games.items() if g not in all_star}
    team_games = Counter()
    for rs in kept.values():
        team_games[rs[0]["home_team_abbrev"]] += 1
        team_games[rs[0]["away_team_abbrev"]] += 1

    report = {
        "source": {"pbp": a.pbp.split("/")[-1], "box": a.box.split("/")[-1]},
        "population": {
            "season_type_2_ids": len(games),
            "all_star_excluded": all_star,
            "kept": len(kept),
            "teams": len(team_games),
            "team_game_counts": dict(Counter(team_games.values())),
            "teams_not_82": {t: c for t, c in team_games.items() if c != 82},
        },
    }
    points_ok = box_ok = 0
    poss_diff = Counter()
    unassigned_total = Counter()
    unassigned_games = []
    ft_bad_games = []
    bad_points = []
    for g, rs in kept.items():
        home, away, poss, pts, unassigned, ft_incomplete = check_game(rs)
        final = rs[-1]
        fh, fa = int(final["home_score"] or 0), int(final["away_score"] or 0)
        if pts[home] == fh and pts[away] == fa:
            points_ok += 1
        else:
            bad_points.append([g, pts[home], pts[away], fh, fa])
        if box[(g, home)] == fh and box[(g, away)] == fa:
            box_ok += 1
        poss_diff[min(abs(poss[home] - poss[away]), 5)] += 1
        if unassigned:
            unassigned_total.update(unassigned)
            unassigned_games.append(g)
        if ft_incomplete:
            ft_bad_games.append([g, ft_incomplete])
    n = len(kept)
    within2 = sum(v for d, v in poss_diff.items() if d <= 2)
    report["checks"] = {
        "scoring_sum_equals_final": {"pass": points_ok, "of": n, "failures": bad_points[:25]},
        "box_points_equal_final": {"pass": box_ok, "of": n},
        "possession_count_difference": {str(k): v for k, v in sorted(poss_diff.items())},
        "possessions_within_2": {"games": within2, "of": n, "share": round(within2 / n, 4)},
        "free_throw_trips_incomplete": {"games": len(ft_bad_games), "examples": ft_bad_games[:25]},
        "unassigned_events_by_type": dict(unassigned_total.most_common()),
        "games_with_unassigned_events": {"count": len(unassigned_games), "ids": sorted(unassigned_games)},
    }
    report["pass_rules"] = {
        "points_reconcile_every_game": points_ok == n and box_ok == n,
        "possessions_within_2_in_99pct": within2 >= 0.99 * n,
        "unassigned_scoring_games_le_1pct": len(unassigned_games) <= 0.01 * n,
    }
    json.dump(report, open(a.out, "w"), indent=1, sort_keys=True)
    print(json.dumps({"kept": n, **report["pass_rules"], "within2": report["checks"]["possessions_within_2"], "ft_incomplete_games": len(ft_bad_games), "unassigned_games": len(unassigned_games)}))


if __name__ == "__main__":
    main()
