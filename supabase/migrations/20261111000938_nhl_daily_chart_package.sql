-- Batch 1 NHL visual research. Private immutable snapshots, exact source hashes, one post per game/day.
create table private.nhl_chart_snapshots(
 id uuid primary key, game_id uuid not null references public.sports_games(id), day date not null,
 payload jsonb not null, captured_at timestamptz not null default clock_timestamp(),
 post_id uuid unique, posted_at timestamptz, unique(game_id,day)
);
alter table private.nhl_chart_snapshots enable row level security;
revoke all on private.nhl_chart_snapshots from public,anon,authenticated,service_role;

create function private.nhl_chart_capture(p_game uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare g public.sports_games; r jsonb; team jsonb; oldgame jsonb; src private.nhl_context_sources;
 b jsonb; side text; p jsonb; samples jsonb; teams jsonb:='[]'; snapshot uuid;
 now_at timestamptz:=clock_timestamp(); day_at date:=(now() at time zone 'America/New_York')::date;
 source jsonb; boxurl text; team_abbr text; report_games integer; valid_boxes integer; error_note text;
begin
 perform pg_advisory_xact_lock(hashtextextended('nhl-chart:'||p_game::text,0));
 select id into snapshot from private.nhl_chart_snapshots where game_id=p_game and day=day_at;
 if found then return snapshot;end if;
 select * into g from public.sports_games where id=p_game and sport='nhl' and start_time>now_at
  and (start_time at time zone 'America/New_York')::date=day_at
  and not coalesce((payload->>'completed')::boolean,false)
  and coalesce(payload->>'status','') !~ 'FINAL|IN_PROGRESS|CANCEL|POSTPON|SUSPEND';
 if not found then raise exception 'Upcoming scheduled NHL game today required';end if;
 select report into r from private.nhl_context_reports where game_id=p_game and recorded_at>now_at-interval '6 hours';
 if r is null or r->>'game_id'<>p_game::text or (r->>'cutoff')::timestamptz<>g.start_time
  or jsonb_array_length(r->'teams')<>2 or jsonb_array_length(r->'sources')=0 then raise exception 'Fresh verified context unavailable';end if;
 for source in select value from jsonb_array_elements(r->'sources') loop
  if source->>'url' !~ '^https://(api-web[.]nhle[.]com|www[.]rotowire[.]com)/'
   or source->>'sha256' !~ '^[a-f0-9]{64}$' or (source->>'retrieved_at')::timestamptz>now_at then raise exception 'Invalid source provenance';end if;
 end loop;
 for team in select value from jsonb_array_elements(r->'teams') loop
  samples:='[]';valid_boxes:=0;team_abbr:=team->>'abbreviation';report_games:=jsonb_array_length(team->'games');
  if report_games=0 then raise exception 'No historical team sample';end if;
  for oldgame in select value from jsonb_array_elements(team->'games') loop
   boxurl:='https://api-web.nhle.com/v1/gamecenter/'||(oldgame->>'id')||'/boxscore';
   select * into src from private.nhl_context_sources s where s.url=boxurl and exists(
    select 1 from jsonb_array_elements(r->'sources') x where x->>'url'=s.url and x->>'sha256'=s.sha256
      and (x->>'retrieved_at')::timestamptz=s.retrieved_at);
   if not found or encode(sha256(convert_to(src.body,'UTF8')),'hex')<>src.sha256 then continue;end if;
   b:=src.body::jsonb;
   if b->>'id'<>oldgame->>'id' or b->>'gameType'<>'2' or b->>'gameState' not in ('OFF','FINAL')
    or left(b->>'season',4)<>left(r->>'nhl_game_id',4) or (b->>'startTimeUTC')::timestamptz>=now_at then continue;end if;
   side:=case when b->'awayTeam'->>'abbrev'=team_abbr or (team_abbr='LA' and b->'awayTeam'->>'abbrev'='LAK') or (team_abbr='NJ' and b->'awayTeam'->>'abbrev'='NJD') or (team_abbr='SJ' and b->'awayTeam'->>'abbrev'='SJS') or (team_abbr='TB' and b->'awayTeam'->>'abbrev'='TBL') then 'awayTeam'
     when b->'homeTeam'->>'abbrev'=team_abbr or (team_abbr='LA' and b->'homeTeam'->>'abbrev'='LAK') or (team_abbr='NJ' and b->'homeTeam'->>'abbrev'='NJD') or (team_abbr='SJ' and b->'homeTeam'->>'abbrev'='SJS') or (team_abbr='TB' and b->'homeTeam'->>'abbrev'='TBL') then 'homeTeam' else null end;
   if side is null or jsonb_typeof(b->'playerByGameStats'->side->'forwards')<>'array' or jsonb_typeof(b->'playerByGameStats'->side->'defense')<>'array' then continue;end if;
   if (select coalesce(sum((v->>'goals')::integer),-1) from jsonb_array_elements((b->'playerByGameStats'->side->'forwards')||(b->'playerByGameStats'->side->'defense')) v)<>(oldgame->>'goalsFor')::integer then continue;end if;
   valid_boxes:=valid_boxes+1;
   for p in select value from jsonb_array_elements((b->'playerByGameStats'->side->'forwards')||(b->'playerByGameStats'->side->'defense')) loop
    -- An absent or malformed statistic stays null. Only an explicitly played positive TOI is exposure.
    if p->>'toi' !~ '^[0-9]{1,3}:[0-5][0-9]$' or not exists(select 1 from jsonb_array_elements(team->'roster') rr where rr->>'id'=p->>'playerId') then continue;end if;
    samples:=samples||jsonb_build_array(jsonb_build_object('id',(p->>'playerId')::integer,'name',(select rr->>'name' from jsonb_array_elements(team->'roster') rr where rr->>'id'=p->>'playerId' limit 1),
     'date',oldgame->>'date','game_id',oldgame->>'id','opponent',oldgame->>'opponent','position',p->>'position',
     'shots',case when p->>'sog' ~ '^[0-9]+$' then (p->>'sog')::integer end,
     'goals',case when p->>'goals' ~ '^[0-9]+$' then (p->>'goals')::integer end,
     'points',case when p->>'points' ~ '^[0-9]+$' and p->>'assists' ~ '^[0-9]+$' and (p->>'points')::integer=(p->>'goals')::integer+(p->>'assists')::integer then (p->>'points')::integer end,
     'blocks',case when p->>'blockedShots' ~ '^[0-9]+$' then (p->>'blockedShots')::integer end,
     'seconds',split_part(p->>'toi',':',1)::integer*60+split_part(p->>'toi',':',2)::integer,
     'shifts',case when p->>'shifts' ~ '^[0-9]+$' then (p->>'shifts')::integer end));
   end loop;
  end loop;
  teams:=teams||jsonb_build_array(team||jsonb_build_object('samples',samples,'chart_boxes_verified',valid_boxes));
 end loop;
 snapshot:=md5('nhl-charts:'||day_at::text||':'||p_game::text)::uuid;
 insert into private.nhl_chart_snapshots(id,game_id,day,payload,captured_at)
 values(snapshot,p_game,day_at,jsonb_build_object('version',1,'id',snapshot,'game_id',p_game,'day',day_at,'collected_at',now_at,
  'game',g.payload,'nhl_url',r->>'nhl_url','nhl_game_id',r->'nhl_game_id','teams',teams,'sources',r->'sources',
  'gaps',jsonb_build_array('Line combinations/injuries: use timestamped team reports; morning lineup is not final clearance.',
   'Shot maps, Corsi/Fenwick, on-ice share, 32-team matrix, iXG, entries/exits and sensor tracking: not yet integrated.',
   'No odds or puck-line value claim in this research release.')),now_at);
 return snapshot;
end $$;
revoke all on function private.nhl_chart_capture(uuid) from public,anon,authenticated,service_role;

-- Public research image projection only; immutable and available only once the post exists.
create function public.nhl_chart_snapshot(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select s.payload from private.nhl_chart_snapshots s join public.community_posts p on p.id=s.post_id
 where s.id=p_id and p.card='nhl-charts:'||s.id::text and p.legs='[]'::jsonb and p.stake is null and private.is_dealer_publisher(p.user_id)
$$;
revoke all on function public.nhl_chart_snapshot(uuid) from public;
grant execute on function public.nhl_chart_snapshot(uuid) to anon,authenticated,service_role;

-- Preserve every existing allowed card marker.
do $$declare c text;begin
 select pg_get_constraintdef(oid) into c from pg_constraint where conrelid='public.community_posts'::regclass and conname='community_posts_card_check';
 if c is null then raise exception 'Card marker constraint missing';end if;
 execute 'alter table public.community_posts drop constraint community_posts_card_check';
 execute 'alter table public.community_posts add constraint community_posts_card_check check (('||substring(c from 8 for length(c)-8)||') or card ~ ''^nhl-charts:[0-9a-f-]{36}$'')';
end $$;

create function private.nhl_charts_tick() returns jsonb language plpgsql security definer set search_path='' as $$
declare game record; item private.nhl_chart_snapshots; author uuid; post uuid; snapshot_id uuid; outcomes jsonb:='[]';now_et timestamp:=now() at time zone 'America/New_York';body text;line text;
begin
 if current_user<>'postgres' or session_user<>'postgres' then raise exception 'Server publisher required';end if;
 if now_et::time<time '08:00' then return jsonb_build_object('status','BEFORE_MORNING');end if;
 if not pg_try_advisory_xact_lock(hashtextextended('nhl-chart-tick',0)) then return jsonb_build_object('status','BUSY');end if;
 for game in select g.id,g.start_time,g.payload from public.sports_games g where sport='nhl' and (start_time at time zone 'America/New_York')::date=now_et::date order by start_time,id loop
  if coalesce(game.payload->>'status','') ~ 'FINAL|IN_PROGRESS|CANCEL|POSTPON|SUSPEND' or coalesce((game.payload->>'completed')::boolean,false) then outcomes:=outcomes||jsonb_build_array(jsonb_build_object('game',game.id,'status','NOT_SCHEDULED'));continue;end if;
  if game.start_time<=now() then outcomes:=outcomes||jsonb_build_array(jsonb_build_object('game',game.id,'status','STARTED_NO_BACKFILL'));continue;end if;
  begin
   snapshot_id:=private.nhl_chart_capture(game.id);
   outcomes:=outcomes||jsonb_build_array(jsonb_build_object('game',game.id,'status','READY','snapshot',snapshot_id));
  exception when others then outcomes:=outcomes||jsonb_build_array(jsonb_build_object('game',game.id,'status','BLOCKED','reason',left(sqlerrm,180)));end;
 end loop;
 select a.user_id into author from private.zone_automation a join public.community_profiles cp on cp.user_id=a.user_id
 where a.name='vq_dealer' and private.is_dealer_publisher(a.user_id) and private.age_eligible(a.user_id) and cp.visible and cp.avatar is not null;
 if author is null then return jsonb_build_object('status','DEALER_UNAVAILABLE','coverage',outcomes);end if;
 perform pg_advisory_xact_lock(hashtextextended(author::text,420));
 if exists(select 1 from public.community_posts where user_id=author and created_at>now()-interval '35 seconds') then return jsonb_build_object('status','WAITING','coverage',outcomes);end if;
 select s.* into item from private.nhl_chart_snapshots s join public.sports_games g on g.id=s.game_id
 where s.day=now_et::date and s.post_id is null and g.start_time>now() and not coalesce((g.payload->>'completed')::boolean,false)
 and coalesce(g.payload->>'status','') !~ 'FINAL|IN_PROGRESS|CANCEL|POSTPON|SUSPEND' order by g.start_time,s.id limit 1;
 if not found then return jsonb_build_object('status','NOTHING_READY','coverage',outcomes);end if;
 post:=md5('nhl-chart-post:'||item.id::text)::uuid;
 if exists(select 1 from public.community_posts where id=post or card='nhl-charts:'||item.id::text) then raise exception 'Existing NHL chart publication requires reconciliation';end if;
 body:='Three visual research pages: matchup and recent scoring; player shots/ice time; points and blocked shots. Collected '||(item.payload->>'collected_at')||'. Historical samples and missing fields are labeled. Goalies and PP units are source-reported snapshots, not final clearance. No selections or odds.'||E'\n'||(item.payload->>'nhl_url');
 perform set_config('request.jwt.claim.sub',author::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',author,'role','authenticated')::text,true);
 perform set_config('vq.automated_post','on',true);
 insert into public.community_posts(id,user_id,sport,kind,title,body,card,legs,stake)
 values(post,author,'nhl','talk','NHL Charts · '||(item.payload->'game'->'away'->>'short_name')||' @ '||(item.payload->'game'->'home'->>'short_name'),body,'nhl-charts:'||item.id::text,'[]',null);
 update private.nhl_chart_snapshots set post_id=post,posted_at=now() where id=item.id;
 return jsonb_build_object('status','POSTED','snapshot',item.id,'post_id',post,'coverage',outcomes);
end $$;
revoke all on function private.nhl_charts_tick() from public,anon,authenticated,service_role;
