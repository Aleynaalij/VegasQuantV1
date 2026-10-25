-- Owner authorization 2026-10-25: qualitative analyst Double Up, not model approval.
-- This path exempts ONLY model/edge requirements; existing official/model gates are unchanged.
create table public.nfl_analyst_double_ups (
 id uuid primary key,
 day date not null unique default (now() at time zone 'America/New_York')::date,
 title text not null check(length(title) between 1 and 90),
 candidates jsonb not null check(jsonb_typeof(candidates)='array' and jsonb_array_length(candidates) between 3 and 4),
 sportsbook text not null,
 combined_odds integer not null check(combined_odds between 100 and 100000),
 quote_observation_id uuid not null references public.source_observations,
 source_url text not null,
 observed_at timestamptz not null,
 expires_at timestamptz not null,
 review jsonb not null,
 policy_version text not null default '2026-10-25.analyst-double-up',
 created_at timestamptz not null default now()
);
create index nfl_analyst_double_up_quote on public.nfl_analyst_double_ups(quote_observation_id);
alter table public.nfl_analyst_double_ups enable row level security;
revoke all on public.nfl_analyst_double_ups from public,anon,authenticated,service_role;
grant select on public.nfl_analyst_double_ups to authenticated,service_role;
create policy analyst_double_up_read on public.nfl_analyst_double_ups for select to authenticated
 using((select private.has_membership()) and (select private.age_member_allowed()));
create trigger immutable_analyst_double_up before update or delete on public.nfl_analyst_double_ups
 for each row execute function private.immutable();
-- A single Eastern-day slot, whether the feature is a contributor ticket or analyst ticket.
alter table public.ruby_daily_features alter column submission_id drop not null;
alter table public.ruby_daily_features add column analyst_ticket_id uuid references public.nfl_analyst_double_ups;
alter table public.ruby_daily_features add constraint daily_feature_exactly_one_ticket
 check ((submission_id is not null)::integer+(analyst_ticket_id is not null)::integer=1);
create index ruby_feature_analyst_ticket on public.ruby_daily_features(analyst_ticket_id);
drop policy ruby_feature_read on public.ruby_daily_features;
create policy ruby_feature_read on public.ruby_daily_features for select to authenticated
 using(exists(select 1 from public.ruby_submissions r where r.id=submission_id)
 or exists(select 1 from public.nfl_analyst_double_ups a where a.id=analyst_ticket_id));

create function private.publish_analyst_double_up(p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 ticket_id uuid:=(p->>'id')::uuid; existing public.nfl_analyst_double_ups;
 q public.source_observations; rules jsonb; c jsonb; s jsonb; source jsonb;
 errors jsonb; targets jsonb:='[]'; keys text[]:='{}'; identity text;
 generated timestamptz:=private.nfl_gate_time(p#>>'{review,generated_at}');
 cutoff timestamptz:=private.nfl_gate_time(p#>>'{review,historical_cutoff}');
 earliest timestamptz; kickoff timestamptz; observed timestamptz; required text;
 recipient record;
begin
 if coalesce(auth.role(),'')<>'service_role' and not (coalesce(private.is_admin(),false) and private.age_member_allowed()) then
  raise exception 'Verified admin or research service required'; end if;
 if octet_length(p::text)>250000 or ticket_id is null then raise exception 'Invalid analyst ticket';end if;
 perform pg_advisory_xact_lock(hashtextextended((now() at time zone 'America/New_York')::date::text,825));
 select * into existing from public.nfl_analyst_double_ups where id=ticket_id;
 if found then
  if existing.title=p->>'title' and existing.candidates=p->'candidates' and existing.review=p->'review'
   and existing.sportsbook=p->>'sportsbook' and existing.combined_odds=(p->>'combined_odds')::integer
   and existing.quote_observation_id=(p->>'quote_observation_id')::uuid then return existing.id;end if;
  raise exception 'Ticket identifier already used';
 end if;
 if exists(select 1 from public.ruby_daily_features where day=(now() at time zone 'America/New_York')::date) then
  raise exception 'Today’s Double Up is already featured; preserve the original';end if;
 if generated is null or generated>now() or generated<now()-interval '15 minutes' or cutoff is null or cutoff>generated then
  raise exception 'Fresh generated time and historical cutoff required';end if;
 foreach required in array array['correlation_review','failure_scenarios','market_context','material_unknowns'] loop
  if length(btrim(coalesce(p#>>array['review',required],''))) not between 1 and 4000 then raise exception 'Missing or oversized review: %',required;end if;
 end loop;
 if jsonb_typeof(p->'candidates') is distinct from 'array' or jsonb_array_length(p->'candidates') not between 3 and 4 then
  raise exception 'Three or four supported pregame legs required; never force a count';end if;
 select r.rules into rules from private.nfl_selection_rule_versions r where effective_at<=now() order by effective_at desc,version desc limit 1;
 for c in select value from jsonb_array_elements(p->'candidates') loop
  s:=c->'selection_gate';
  if c->>'book' is distinct from p->>'sportsbook' or s->>'phase' is distinct from 'pregame' then raise exception 'Same-book pregame NFL legs required';end if;
  if c ?| array['model_probability','edge','ev','confidence','official','pick_of_day']
   or s ?| array['model_id','model_probability','edge','ev','confidence','forecast_source_url','validated'] then
   raise exception 'Analyst picks cannot claim model approval, numeric edge or official/POD status';end if;
  -- Reuse all current history, role, TE, quote identity/freshness and lock checks.
  -- Drop exactly the missing-approved-model requirement; fail closed on any other error.
  select coalesce(jsonb_agg(e),'[]') into errors from jsonb_array_elements_text(private.nfl_selection_errors(c,rules,now())) e
   where e<>'BIBLE/R2: approved priced model evidence required; SHADOW_ONLY and historical clear rates cannot establish edge';
  if jsonb_array_length(errors)>0 then raise exception using message='ANALYST_DOUBLE_UP_BLOCKED',detail=errors::text;end if;
  identity:=private.nfl_gate_identity((c->>'game_id')::uuid,c->>'name',c->>'market');
  if identity=any(keys) then raise exception 'Duplicate ticket leg';end if;keys:=array_append(keys,identity);
  select g.kickoff into kickoff from public.games g where g.id=(c->>'game_id')::uuid;
  earliest:=least(earliest,kickoff);
  targets:=targets||jsonb_build_array(jsonb_build_object('game_id',c->>'game_id','name',c->>'name','market',c->>'market','odds',c->'odds'));
  foreach required in array array['role_source_url','availability_source_url','history_source_url'] loop
   if not exists(select 1 from jsonb_array_elements(p#>'{review,sources}') x where x->>'url'=s->>required) then
    raise exception 'Reviewed source missing for %',required;end if;
  end loop;
 end loop;
 if jsonb_typeof(p#>'{review,sources}') is distinct from 'array' or jsonb_array_length(p#>'{review,sources}') not between 1 and 80 then raise exception 'Source provenance required';end if;
 for source in select value from jsonb_array_elements(p#>'{review,sources}') loop
  observed:=private.nfl_gate_time(source->>'retrieved_at');
  if coalesce(source->>'url','') !~ '^https://[^[:space:]]+$' or coalesce(source->>'sha256','') !~ '^[a-f0-9]{64}$'
   or observed is null or observed>cutoff then raise exception 'HTTPS source, SHA256 and retrieval before cutoff required';end if;
 end loop;
 select * into q from public.source_observations where id=(p->>'quote_observation_id')::uuid;
 observed:=private.nfl_gate_time(q.payload->>'provider_updated_at');
 if q.id is null or q.kind<>'odds' or q.payload->>'market' is distinct from 'parlay'
  or q.payload->>'book' is distinct from p->>'sportsbook' or q.payload->'legs' is distinct from targets
  or private.nfl_gate_number(q.payload->'price') is distinct from private.nfl_gate_number(p->'combined_odds')
  or coalesce(q.payload->>'price_basis','')<>'sportsbook_complete_slip'
  or coalesce(q.payload->>'source_sha256','') !~ '^[a-f0-9]{64}$'
  or observed is null or observed>generated or observed<now()-interval '15 minutes'
  or q.recorded_at>cutoff or q.source !~ '^https://[^[:space:]]+$'
  or q.game_id::text<>p#>>'{candidates,0,game_id}' then
  raise exception 'Fresh immutable complete sportsbook slip quote required; never multiply individual leg prices';end if;
 insert into public.nfl_analyst_double_ups(id,title,candidates,sportsbook,combined_odds,quote_observation_id,source_url,observed_at,expires_at,review)
 values(ticket_id,btrim(p->>'title'),p->'candidates',p->>'sportsbook',(p->>'combined_odds')::integer,q.id,q.source,observed,earliest,p->'review');
 insert into public.ruby_daily_features(analyst_ticket_id,verified_odds,sportsbook,source_url,observed_at,verified_by)
 values(ticket_id,(p->>'combined_odds')::integer,p->>'sportsbook',q.source,observed,auth.uid());
 for recipient in select id from auth.users where email_confirmed_at is not null and private.age_eligible(id)
  and not exists(select 1 from private.community_restrictions where user_id=id) loop
  perform private.emit_notification(recipient.id,null,'contributor','analyst-double-up:'||ticket_id::text,ticket_id,null,null,
   'Today’s Double Up is ready · analyst pick · '||(p->>'sportsbook')||' +'||(p->>'combined_odds'),
   '/feed?double_up='||ticket_id::text||'#analyst-'||ticket_id::text);
 end loop;
 return ticket_id;
end $$;
create function public.publish_analyst_double_up(p jsonb) returns uuid
 language sql security invoker set search_path='' as $$select private.publish_analyst_double_up(p)$$;
revoke all on function private.publish_analyst_double_up(jsonb),public.publish_analyst_double_up(jsonb) from public,anon,authenticated,service_role;
grant execute on function private.publish_analyst_double_up(jsonb),public.publish_analyst_double_up(jsonb) to authenticated,service_role;
