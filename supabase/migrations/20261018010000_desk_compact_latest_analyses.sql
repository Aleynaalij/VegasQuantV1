-- Home and Records (desk_data_compact) use only the latest analysis per game and never read the
-- audit list; full version history stays on desk_data, which game pages keep using. Measured on
-- live data: every analysis version was 2.1 MB of the member response (latest per game: 422 kB)
-- and the newest 100 audit events another 0.8 MB.
do $migration$
declare original text; compact text;
begin
 original := pg_get_functiondef('public.desk_data_compact()'::regprocedure);
 compact := replace(original,
   'from public.analysis_versions t)',
   'from (select distinct on (game_id) * from public.analysis_versions order by game_id,created_at desc,version desc) t)');
 compact := replace(compact,
   'from (select * from public.audit_events order by created_at desc,id desc limit 100) t)',
   'from (select * from public.audit_events where false) t)');
 if compact = original or position('distinct on (game_id)' in compact)=0 or position('audit_events where false' in compact)=0
 then raise exception 'Unexpected desk_data_compact definition; refusing a partial rewrite'; end if;
 execute compact;
end $migration$;
