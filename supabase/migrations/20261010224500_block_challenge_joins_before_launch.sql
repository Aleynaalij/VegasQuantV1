create or replace function private.set_challenge_run(p_challenge_id uuid,p_mode text,p_count_me boolean) returns jsonb language plpgsql security definer set search_path='' as $function$
declare r public.challenge_runs;
begin
 if auth.uid() is null then raise exception 'Sign in to join'; end if;
 if not exists(select 1 from auth.users where id=auth.uid() and (banned_until is null or banned_until<=now())) then raise exception 'Account unavailable'; end if;
 if not exists(select 1 from public.challenges where id=p_challenge_id) then raise exception 'Challenge not found'; end if;
 if exists(select 1 from public.challenges where id=p_challenge_id and status='PREP') then raise exception 'Challenge not yet open'; end if;
 insert into public.challenge_runs(user_id,challenge_id,mode,count_me) values(auth.uid(),p_challenge_id,p_mode,p_count_me)
 on conflict(user_id,challenge_id) do update set mode=excluded.mode,count_me=excluded.count_me,updated_at=now() returning * into r;
 return to_jsonb(r);
end $function$;