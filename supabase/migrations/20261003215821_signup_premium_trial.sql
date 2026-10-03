create function private.signup_trial_expires_at() returns timestamptz
language sql stable security definer set search_path='' as $$
select created_at + interval '14 days' from auth.users where id=auth.uid() and not coalesce(is_anonymous,false);
$$;
revoke all on function private.signup_trial_expires_at() from public,anon,authenticated;
do $migration$
declare original text; updated text;
begin
original:=pg_get_functiondef('private.has_membership()'::regprocedure);
updated:=replace(original,'select private.is_admin() or exists','select private.is_admin() or coalesce(private.signup_trial_expires_at()>now(),false) or exists');
if updated=original then raise exception 'Membership guard changed'; end if;
execute updated;
original:=pg_get_functiondef('private.membership_status()'::regprocedure);
updated:=replace(original,'''allowed'',private.has_membership()', '''trial_expires_at'',private.signup_trial_expires_at(),''trial_active'',coalesce(private.signup_trial_expires_at()>now(),false),''allowed'',private.has_membership()');
updated:=replace(updated,'''expires_at'',greatest(','''expires_at'',greatest(case when private.signup_trial_expires_at()>now() then private.signup_trial_expires_at() end,');
if updated=original then raise exception 'Membership status changed'; end if;
execute updated;
end;
$migration$;
