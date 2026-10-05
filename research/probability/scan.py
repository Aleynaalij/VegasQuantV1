"""Scan every eligible supported player in supplied future games, research only."""
import argparse
from datetime import datetime,timezone
import hashlib
import json
from pathlib import Path
import pandas as pd
import numpy as np
from engine import MARKETS,normalize,feature,weighted,evaluate_quote

def name_key(value):
    return " ".join(str(value).casefold().split())

def scan(frame,artifact,games,observations,as_of,context=None):
    frame=normalize(frame);context=context or {};now=pd.Timestamp(as_of)
    if now.tz is None:raise ValueError("Timezone-aware scan timestamp required")
    expected=hashlib.sha256(json.dumps({k:v for k,v in artifact.items() if k!="model_id"},sort_keys=True).encode()).hexdigest()
    if expected!=artifact.get("model_id"):raise ValueError("Model integrity check failed")
    cards=[];rejected=[]
    histories={};defenses={}
    for game in games:
        kickoff=pd.Timestamp(game["kickoff"])
        if kickoff.tz is None or not now<kickoff<=now+pd.Timedelta(days=7) or game.get("kickoff_tbd"):
            continue
        target=(int(game["season"]),int(game["week"]))
        past=frame[(frame.season_type=="REG") & ((frame.season<target[0]) | ((frame.season==target[0]) & (frame.week<target[1])))].sort_values(["season","week"])
        latest=past.groupby("player_id").tail(1)
        if target not in histories:
            if past.duplicated(["player_id","season","week"]).any():raise ValueError("Duplicate historical records")
            required=["player_id","recent_team","opponent_team","position","carries","rushing_yards","targets","receiving_yards"]
            if past[required].isna().any().any() or not np.isfinite(past[required[-4:]].to_numpy(dtype=float)).all():raise ValueError("Incomplete historical inputs")
            if (past[["carries","targets"]]<0).any().any():raise ValueError("Negative opportunities")
            histories[target]={key:part.to_dict("records") for key,part in past.groupby(["player_id","recent_team"])}
        aliases={"WSH":"WAS","LAR":"LA"}
        teams=[aliases.get(game[k],game[k]) for k in ["away_abbreviation","home_abbreviation"]]
        candidates=latest[latest.recent_team.isin(teams) & latest.position.isin(["RB","WR","TE"])]
        for player in candidates.to_dict("records"):
            opponent=teams[1] if player["recent_team"]==teams[0] else teams[0]
            injury_rows=[o for o in observations if o.get("game_id")==game["id"] and o.get("kind")=="injury" and
                name_key(o.get("payload",{}).get("player",""))==name_key(player["player_display_name"])]
            injury_rows.sort(key=lambda o:o.get("recorded_at") or o.get("observed_at") or "",reverse=True)
            injury_context=[dict(status=o["payload"].get("status"),source_url=o.get("source"),
                source_at=o.get("observed_at"),received_at=o.get("recorded_at")) for o in injury_rows[:1]]
            for market in MARKETS:
                if market=="rushing" and player["position"]!="RB":continue
                base=dict(player_id=player["player_id"],team=player["recent_team"],opponent=opponent,season=target[0],week=target[1],market=market,kickoff=game["kickoff"])
                try:
                    h=histories[target].get((player["player_id"],player["recent_team"]),[])
                    count,yards,minimum=MARKETS[market]
                    if len(h)<4:raise ValueError("At least four prior same-team games required")
                    if weighted([r[count] for r in h[-16:]])<minimum:raise ValueError("Workload is below validated cohort threshold")
                    dkey=(target,market,player["position"])
                    if dkey not in defenses:
                        defense=past[past.position==player["position"]].groupby(["season","week","opponent_team"])[[count,yards]].sum().reset_index()
                        defenses[dkey]=(list(defense[[count,yards]].itertuples(index=False,name=None)),
                            {team:list(part[[count,yards]].itertuples(index=False,name=None)) for team,part in defense.groupby("opponent_team")})
                    league,opponents=defenses[dkey]
                    inputs=dict(base,position=player["position"],history_through=[int(h[-1]["season"]),int(h[-1]["week"])],
                        x=feature(h,opponents.get(opponent,[]),league,player["position"],market).tolist())
                except ValueError as e:
                    cards.append(dict(game_id=game["id"],player=player["player_display_name"],market=market,status="WAIT",research_probability=None,injury_context=injury_context,blockers=[str(e)]));continue
                quotes=[]
                key="player_rush_yds" if market=="rushing" else "player_reception_yds"
                # Latest market snapshot per book supersedes old lines, including missing selections.
                snapshots={}
                for observation in observations:
                    p=observation.get("payload",{})
                    if observation.get("game_id")!=game["id"] or p.get("market")!=key:continue
                    at=pd.to_datetime(observation.get("observed_at"),utc=True,errors="coerce")
                    if pd.isna(at) or at>now:continue
                    book=p.get("book")
                    if not book:continue
                    if book not in snapshots or at>snapshots[book][0]:snapshots[book]=(at,observation)
                for at,observation in snapshots.values():
                    p=observation["payload"]
                    # Exact unique player name mapping only; ambiguity is never fuzzy-matched.
                    names=candidates[candidates.player_display_name.map(name_key)==name_key(player["player_display_name"])]
                    if len(names)!=1:
                        rejected.append(dict(game_id=game["id"],player=player["player_display_name"],reason="Ambiguous provider player name"));continue
                    matches=[o for o in p.get("outcomes",[]) if name_key(o.get("description",""))==name_key(player["player_display_name"])]
                    for outcome in matches:
                        if outcome.get("name") not in ["Over","Under"]:continue
                        q=dict(base,direction=outcome["name"].lower(),line=outcome.get("point"),odds=outcome.get("price"),sportsbook=p["book"],source_url=observation.get("source"),observed_at=at.isoformat())
                        c=context.get(player["player_id"],{})
                        q.update({k:c[k] for k in ["availability_verified","availability_source_url","role_change"] if k in c})
                        other=[o for o in matches if o.get("point")==q["line"] and o.get("name")!=outcome["name"]]
                        if len(other)==1:q["opposite_quote"]=dict(q,direction=other[0]["name"].lower(),odds=other[0]["price"])
                        quotes.append(q)
                if not quotes:
                    cards.append(dict(game_id=game["id"],player=player["player_display_name"],market=market,status="WAIT",research_probability=None,injury_context=injury_context,blockers=["No verified exact-player prop quote"]));continue
                for q in quotes:
                    try:
                        result=evaluate_quote(artifact,inputs,q,as_of)
                        if injury_context:
                            result["blockers"].append("Reported injury status requires review: "+str(injury_context[0]["status"]))
                            result["status"]="WAIT"
                        p=result["research_probability"]/(1-result["push_probability"])-.03
                        minimum_odds=(100*(1-p)/p if p<.5 else -100*p/(1-p)) if 0<p<1 else None
                        cards.append(dict(result,game_id=game["id"],player=player["player_display_name"],market=market,
                            research_minimum_odds_for_3pp=minimum_odds,
                            injury_context=injury_context,
                            entry_note="Experimental price threshold; blockers override any apparent edge."))
                    except (ValueError,TypeError,KeyError) as e:
                        cards.append(dict(game_id=game["id"],player=player["player_display_name"],market=market,status="WAIT",research_probability=None,blockers=[str(e)]))
    cards.sort(key=lambda c:(c.get("estimated_edge_pp") is None,-c.get("estimated_edge_pp",0),c["player"]))
    return dict(as_of=as_of,model_id=artifact["model_id"],status="SHADOW_ONLY",cards=cards,rejected=rejected,
        coverage=dict(cards=len(cards),priced=sum(c.get("quote") is not None for c in cards),
            unavailable=sum(c.get("research_probability") is None for c in cards)),
        official_picks_published=0,note="Full supplied slate, supported cohorts only. Rankings are research estimates; WAIT is not a recommendation.")

def main():
    p=argparse.ArgumentParser();p.add_argument("--data",nargs="+",required=True)
    for key in ["model","games","observations","output"]:p.add_argument("--"+key,required=True)
    p.add_argument("--context");p.add_argument("--journal")
    a=p.parse_args();paths=[Path(x) for x in a.data]
    frame=pd.concat([normalize(pd.read_csv(x,low_memory=False)) for x in paths],ignore_index=True)
    load=lambda f:json.loads(Path(f).read_text())
    now=datetime.now(timezone.utc).isoformat()
    result=scan(frame,load(a.model),load(a.games),load(a.observations),now,load(a.context) if a.context else None)
    sources=[dict(file=x.name,sha256=hashlib.sha256(x.read_bytes()).hexdigest()) for x in paths]
    if a.journal:
        from journal import Journal
        j=Journal(a.journal)
        try:
            for c in result["cards"]:
                if c.get("quote"):
                    c["input_sources"]=sources;c["journal_forecast_id"],_=j.forecast(c)
        finally:j.close()
    result["input_sources"]=sources
    Path(a.output).write_text(json.dumps(result,indent=2,allow_nan=False)+"\n")
    print(json.dumps(result["coverage"]))

if __name__=="__main__":main()
