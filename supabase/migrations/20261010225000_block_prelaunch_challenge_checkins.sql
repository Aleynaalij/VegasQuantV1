create or replace function private.check_in_challenge(p_challenge_id uuid,p_stage_number integer) returns void language plpgsql security definer set search_path='' as $function$
begin
 if exists(select 1 from public.challenges where id=p_challenge_id and status='PREP') then raise exception 'Challenge not yet open'; end if;
 if auth.uid() is null or not exists(select 1 from public.challenge_runs where user_id=auth.uid() and challenge_id=p_challenge_id) then raise exception 'Join this challenge first'; end if;
 if not exists(select 1 from public.challenge_stages s join public.challenges c on c.id=s.challenge_id where s.challenge_id=p_challenge_id and s.stage_number=p_stage_number and s.stage_number<=c.current_stage and s.status in ('OFFICIAL PLAY','WON','LOST','PUSH','PASS / PAUSED','COMPLETED')) then raise exception 'This stage is not ready to follow'; end if;
 insert into public.challenge_checkins(user_id,challenge_id,stage_number) values(auth.uid(),p_challenge_id,p_stage_number) on conflict do nothing;
end $function$;