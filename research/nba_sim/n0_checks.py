"""N0 data checks for the NBA simulator (N0_PROTOCOL.md §2, §3). Read-only, standard library only.

python3 -I research/nba_sim/n0_checks.py --pbp play_by_play_2025.csv --box player_box_2025.csv --out report.json

Validates the source; fits nothing. v2 (2026-11-08) corrects the five validator defects Elo reproduced
in the N0 read-back (issue #65, comment 6721310919):
  1. a free-throw attempt "k of m" with k > 1 and no open trip (an orphan) is an incomplete trip;
  2. a trip still open at End Period / End Game (or at the end of the rows) is flushed as incomplete;
  3. technical free throws never become the actor or owner of a possession;
  4. after a made basket, a made last free throw or a turnover, the next possession is *pending*: it is
     counted as soon as any further row occurs in the same period, and discarded if End Period / End
     Game comes first (a basket at the buzzer gives the opponent no possession);
  5. scoring rows of an unrecognised type are reported fail-closed (by type and game), never filtered
     out before reporting; their points still count toward the reconciliation.
Every failure is reported with its game id (and trip details), with denominators, so the exclusion
union can be reconciled.
"""

import argparse
import csv
import json
import re
from collections import Counter, defaultdict

ALL_STAR = {"CHK", "KEN", "SHQ", "CAN", "LEB", "GIA", "EAST", "WEST"}  # All-Star exhibitions 2023-2025
FT = re.compile(r"^Free Throw - (?:(Flagrant|Clear Path) )?(\d) of (\d)")


def text(r):
    return r["type_text"].replace("\n", " ")


def kind(r):
    t = text(r)
    if t.startswith("Free Throw"):
        return "ft_tech" if "Technical" in t else "ft"
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


def check_game(rows):
    """Per-game accounting. Returns a dict of possessions, points, trip problems and fail-closed counts."""
    home, away = rows[0]["home_team_id"], rows[0]["away_team_id"]
    other = {home: away, away: home}
    poss = Counter()
    pts = Counter()
    unassigned = Counter()  # scoring rows whose team is not one of the two teams
    unrecognised = Counter()  # scoring rows of a type the classifier does not know
    trips_bad = []  # incomplete free-throw trips: dicts with period, team, seen, of, reason
    trips_total = 0
    open_trip = {}  # team -> {"period", "seen": [k...], "of": m}
    owner = None  # team holding the ball
    counted = False  # whether owner's current possession has been counted

    def flush(period, reason):
        for team, trip in list(open_trip.items()):
            trips_bad.append({"period": trip["period"], "team": team, "seen": trip["seen"], "of": trip["of"], "reason": reason})
            del open_trip[team]

    def act(actor):
        nonlocal owner, counted
        if actor != owner:
            owner, counted = actor, True
            poss[actor] += 1
        elif not counted:
            counted = True
            poss[actor] += 1

    def hand_to(team):
        nonlocal owner, counted
        if team != owner:
            owner, counted = team, False  # pending: counted at the next row of this period

    for i, r in enumerate(rows):
        k, team, period = kind(r), r["team_id"], r.get("period_number", "")
        scoring = r["scoring_play"] == "true"
        if k == "end":
            flush(period, "trip open at period end")
            owner, counted = None, False
            continue
        # A handed-over possession is real once anything else happens in the period (an inbound, a
        # foul, a substitution, any action); it is dropped only when the period ends first (buzzer).
        if owner is not None and not counted:
            counted = True
            poss[owner] += 1
        if scoring:
            if team not in other:
                unassigned[text(r)] += 1
            else:
                pts[team] += int(float(r["score_value"] or 0))
                if k not in ("fg", "ft", "ft_tech"):
                    unrecognised[text(r)] += 1
        if team not in other or k in ("other", "ft_tech"):
            continue  # technical free throws never change actor or owner
        if k == "ft":
            m = FT.match(text(r))
            if not m:
                unrecognised["unparsed free throw: " + text(r)] += 1
                continue
            retains, n, of = bool(m.group(1)), int(m.group(2)), int(m.group(3))
            trip = open_trip.get(team)
            if n == 1:
                if trip:
                    trips_bad.append({"period": trip["period"], "team": team, "seen": trip["seen"], "of": trip["of"], "reason": "new trip before completion"})
                trips_total += 1
                open_trip[team] = trip = {"period": period, "seen": [1], "of": of}
            elif not trip or trip["of"] != of or trip["seen"][-1] != n - 1:
                trips_total += 1
                trips_bad.append({"period": period, "team": team, "seen": (trip["seen"] if trip else []) + [n], "of": of, "reason": "orphan or out-of-order attempt"})
                open_trip.pop(team, None)
                trip = None
            else:
                trip["seen"].append(n)
            act(team)
            if n == of:
                open_trip.pop(team, None)
                if retains:
                    hand_to(team)
                elif scoring:
                    hand_to(other[team])
                # a missed last free throw leaves the ball live until the rebound
            continue
        if k == "dreb":
            act(other[team])  # the shooting team's possession ends here
            hand_to(team)
            act(team)  # the rebound itself is the rebounder's first action
            continue
        act(team)
        if k == "fg" and scoring:
            nxt = next((x for x in rows[i + 1 :] if kind(x) not in ("other", "ft_tech")), None)
            and_one = nxt is not None and kind(nxt) == "ft" and nxt["team_id"] == team and " 1 of 1" in text(nxt)
            if not and_one:
                hand_to(other[team])
        elif k == "to":
            hand_to(other[team])
    flush("", "trip open at end of rows")
    return {
        "home": home,
        "away": away,
        "poss": poss,
        "pts": pts,
        "unassigned": unassigned,
        "unrecognised": unrecognised,
        "trips_bad": trips_bad,
        "trips_total": trips_total,
    }


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

    fails = defaultdict(list)  # failure class -> [game ids]
    detail = {"scoring_flags": [], "box_vs_final": [], "possessions_gt2": [], "ft_trips": [], "unassigned": [], "unrecognised": []}
    poss_diff = Counter()
    trips_total = 0
    for g, rs in sorted(kept.items()):
        res = check_game(rs)
        home, away = res["home"], res["away"]
        final = rs[-1]
        fh, fa = int(final["home_score"] or 0), int(final["away_score"] or 0)
        if (res["pts"][home], res["pts"][away]) != (fh, fa):
            fails["scoring_flags"].append(g)
            detail["scoring_flags"].append({"game": g, "flag_sum": [res["pts"][home], res["pts"][away]], "final_row": [fh, fa]})
        if (box[(g, home)], box[(g, away)]) != (fh, fa):
            fails["box_vs_final"].append(g)
            detail["box_vs_final"].append({"game": g, "box": [box[(g, home)], box[(g, away)]], "final_row": [fh, fa]})
        d = abs(res["poss"][home] - res["poss"][away])
        poss_diff[min(d, 5)] += 1
        if d > 2:
            fails["possessions_gt2"].append(g)
            detail["possessions_gt2"].append({"game": g, "home": res["poss"][home], "away": res["poss"][away]})
        trips_total += res["trips_total"]
        if res["trips_bad"]:
            fails["ft_trips"].append(g)
            detail["ft_trips"].append({"game": g, "trips": res["trips_bad"]})
        if res["unassigned"]:
            fails["unassigned"].append(g)
            detail["unassigned"].append({"game": g, "types": dict(res["unassigned"])})
        if res["unrecognised"]:
            fails["unrecognised"].append(g)
            detail["unrecognised"].append({"game": g, "types": dict(res["unrecognised"])})

    n = len(kept)
    within2 = sum(v for dd, v in poss_diff.items() if dd <= 2)
    union = sorted(set().union(*fails.values())) if fails else []
    reasons = {g: sorted(c for c, ids in fails.items() if g in ids) for g in union}
    bad_trips = sum(len(x["trips"]) for x in detail["ft_trips"])
    report = {
        "validator": "n0_checks v2",
        "source": {"pbp": a.pbp.split("/")[-1], "box": a.box.split("/")[-1]},
        "population": {
            "season_type_2_ids": len(games),
            "all_star_excluded": all_star,
            "kept": n,
            "teams": len(team_games),
            "team_game_counts": dict(Counter(team_games.values())),
            "teams_not_82": {t: c for t, c in team_games.items() if c != 82},
        },
        "denominators": {"games": n, "ft_trips": trips_total},
        "checks": {
            "scoring_flags_reconcile": {"pass": n - len(fails["scoring_flags"]), "of": n},
            "box_points_equal_final": {"pass": n - len(fails["box_vs_final"]), "of": n},
            "possession_count_difference": {str(k): v for k, v in sorted(poss_diff.items())},
            "possessions_within_2": {"games": within2, "of": n, "share": round(within2 / n, 4)},
            "ft_trips_incomplete": {"trips": bad_trips, "of_trips": trips_total, "games": len(fails["ft_trips"])},
            "games_with_unassigned_scoring": len(fails["unassigned"]),
            "games_with_unrecognised_scoring_types": len(fails["unrecognised"]),
        },
        "failures": {c: sorted(ids) for c, ids in fails.items()},
        "failure_detail": detail,
        "union": {"games": len(union), "share": round(len(union) / n, 4), "reasons": reasons},
    }
    json.dump(report, open(a.out, "w"), indent=1, sort_keys=True)
    print(json.dumps({"kept": n, "within2": report["checks"]["possessions_within_2"], **{c: len(ids) for c, ids in fails.items()}, "union": len(union), "ft_trips": f"{bad_trips}/{trips_total}"}))


if __name__ == "__main__":
    main()
