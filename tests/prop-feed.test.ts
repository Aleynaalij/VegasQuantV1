import { test } from "node:test";
import assert from "node:assert/strict";
import { upcomingPropEvents, propObservations } from "../supabase/functions/source-sync/props";
const now=Date.parse("2026-10-05T12:00:00Z");
const game={id:"fixture",home_team:"Buffalo Bills",away_team:"New England Patriots",kickoff:"2026-10-06T17:00:00Z"};
const event={id:"test_event",home_team:game.home_team,away_team:game.away_team,commence_time:game.kickoff};
test("props use matched future games only and report truncated coverage",()=>{
  assert.equal(upcomingPropEvents([event,event], [game],now).events.length,1);
  assert.equal(upcomingPropEvents([event], [game],now,0).skipped,1);
  assert.equal(upcomingPropEvents([{...event,commence_time:"2026-10-04T17:00:00Z"}],[game],now).events.length,0);
  assert.equal(upcomingPropEvents([{...event,home_team:"wrong"}],[game],now).events.length,0);
});
test("prop ingestion retains observed time and rejects missing player or invalid prices",()=>{
  const e={...event,bookmakers:[{key:"draftkings",title:"DraftKings",last_update:"2026-10-05T11:59:00Z",markets:[{key:"player_rush_yds",outcomes:[{name:"Over",description:"Test player",point:60.5,price:-110},{name:"Under",description:"Test player",point:60.5,price:-110}]}]}]};
  const rows=propObservations(e,[game],now);assert.equal(rows.length,1);
  assert.equal(rows[0].observed_at,"2026-10-05T11:59:00Z");assert.ok(!rows[0].source.includes("apiKey"));
  e.bookmakers[0].markets[0].outcomes[0].price=0;assert.equal(propObservations(e,[game],now).length,0);
});
