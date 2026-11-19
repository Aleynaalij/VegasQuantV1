// Disposable synthetic NBA source preparation, never a hosted installer.
import { readFile } from "node:fs/promises";
import { id } from "./stage-consumer-db.mjs";
export async function prepareStageNba(db) {
  await db.exec(`
      create table nba_games(id uuid primary key,away_team text,home_team text,away_abbreviation text,home_abbreviation text,tipoff timestamptz,tipoff_tbd boolean,season integer,season_type integer);
      create table nba_result_progress(game_id uuid,status text);
      create table nba_player_results(game_id uuid,athlete_id text,player text,team text,played boolean,minutes numeric,points integer,rebounds integer,assists integer,threes integer,position text,turnovers integer);
      create table nba_player_three_attempts(game_id uuid,athlete_id text,attempts integer);
      create table nba_observations(id uuid,game_id uuid,kind text,recorded_at timestamptz,observed_at timestamptz,payload jsonb);
      create table nba_player_shooting(game_id uuid,athlete_id text,fga integer,fta integer);
      create table nba_game_results(game_id uuid);
      insert into nba_games values
        ('${id(91)}','Orlando Magic','Philadelphia 76ers','ORL','PHI',now()-interval '1 day',false,2026,2),
        ('${id(92)}','Orlando Magic','Philadelphia 76ers','ORL','PHI',now()+interval '2 hours',false,2026,2),
        ('${id(93)}','Orlando Magic','Philadelphia 76ers','ORL','PHI',now()+interval '3 days',false,2026,2);
      insert into nba_result_progress values('${id(91)}','FINAL');
      insert into nba_game_results values('${id(91)}');
      insert into nba_player_results values('${id(91)}','synthetic','Synthetic Player','Philadelphia 76ers',true,30,28,8,4,3,'G',2);
      insert into nba_player_three_attempts values('${id(91)}','synthetic',7);
      insert into nba_player_shooting values('${id(91)}','synthetic',20,5);
      insert into nba_observations values('${id(94)}','${id(92)}','prop',now(),now(),'{"book":"FanDuel","market":"player_points","outcomes":[{"description":"Synthetic Player","name":"Over","point":24.5,"price":-110},{"description":"Synthetic Player","name":"Under","point":24.5,"price":-110}]}');
      do $$declare n text;begin foreach n in array array['nba_games','nba_result_progress','nba_player_results','nba_player_three_attempts','nba_observations','nba_player_shooting','nba_game_results'] loop
        execute format('alter table %I enable row level security',n);
        execute format('grant select on %I to authenticated',n);
        execute format('create policy synthetic_source on %I for select to authenticated using(true)',n);
      end loop;end$$;
    `);
  const sql = await readFile(
    "supabase/migrations/20261117120000_nba_prop_card_inputs.sql",
    "utf8",
  );
  for (const name of ["nba_player_usage", "nba_defense_vs_position"]) {
    const start = sql.indexOf(`create function public.${name}(`),
      end = sql.indexOf("$$;", start) + 3;
    await db.exec(sql.slice(start, end));
    await db.exec(
      `revoke all on function public.${name}(${name === "nba_player_usage" ? "text[]" : "integer"}) from public;grant execute on function public.${name}(${name === "nba_player_usage" ? "text[]" : "integer"}) to authenticated;`,
    );
  }
}
