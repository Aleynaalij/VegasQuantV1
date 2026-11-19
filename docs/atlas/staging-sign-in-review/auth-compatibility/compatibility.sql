-- PROPOSED ONLY / NOT APPROVED / NOT EXECUTED HOSTED.
-- Target must be pinned out-of-band to caynldluziwrzmvuslzg.
-- Auth v2.198.0 looks up users with instance_id = the zero UUID, not NULL.
-- Normalize only absent Auth metadata; no password hashes, provider identities,
-- MFA, grants, sessions, UUIDs, email addresses or member/age state are changed.
begin;
lock table auth.users,auth.sessions,auth.identities,auth.mfa_factors in share row exclusive mode;
do $compat$
declare n integer;
begin
  if (select count(*) from auth.users) <> 10
     or exists(select 1 from auth.users where email is null or email !~* '\.invalid$')
     or not exists(select 1 from vq_private_access_stage.private_development_settings where enabled)
     or (select count(*) from vq_private_access_stage.private_development_owners) <> 6
     or exists(select 1 from auth.sessions)
     or (select count(*) from auth.users u join (values
       ('b21e0096-1939-48c0-b6e3-3f369e2ee0cc'::uuid,'active-verified@vq-fixture.invalid'),
       ('4d2d18b0-2cdc-4428-b921-09bbb596932a'::uuid,'entitled-unverified@vq-fixture.invalid'),
       ('973a73d1-db07-46e8-abf4-cd13d312244b'::uuid,'revoked-verified@vq-fixture.invalid'),
       ('5da49d4b-2e27-462b-8806-8b048f007359'::uuid,'expired-verified@vq-fixture.invalid'),
       ('4fca30be-51e3-44c5-8e25-de3f39166d79'::uuid,'not-started-verified@vq-fixture.invalid'),
       ('ff632fc5-c528-4b70-b7d6-12cacbed6da0'::uuid,'unentitled-verified@vq-fixture.invalid')
       ) as approved(id,email) on u.id=approved.id and u.email=approved.email
       where u.instance_id is null and coalesce(u.encrypted_password,'')='' and u.email_confirmed_at is not null
       and coalesce(u.confirmation_token,'')='' and coalesce(u.recovery_token,'')=''
       and coalesce(u.email_change_token_new,'')='' and coalesce(u.email_change,'')=''
       and not coalesce(u.is_anonymous,false) and u.deleted_at is null
       and not exists(select 1 from auth.identities i where i.user_id=u.id)
       and not exists(select 1 from auth.mfa_factors f where f.user_id=u.id)) <> 6
  then raise exception 'Compatibility preconditions failed; stop without repairs'; end if;
  update auth.users set instance_id='00000000-0000-0000-0000-000000000000'::uuid,
    confirmation_token=coalesce(confirmation_token,''), recovery_token=coalesce(recovery_token,''),
    email_change_token_new=coalesce(email_change_token_new,''), email_change=coalesce(email_change,''),
    created_at=coalesce(created_at,email_confirmed_at),updated_at=coalesce(updated_at,email_confirmed_at)
  where id in ('b21e0096-1939-48c0-b6e3-3f369e2ee0cc','4d2d18b0-2cdc-4428-b921-09bbb596932a',
    '973a73d1-db07-46e8-abf4-cd13d312244b','5da49d4b-2e27-462b-8806-8b048f007359',
    '4fca30be-51e3-44c5-8e25-de3f39166d79','ff632fc5-c528-4b70-b7d6-12cacbed6da0')
    and instance_id is null;
  get diagnostics n = row_count;
  if n<>6 then raise exception 'Compatibility affected-row mismatch'; end if;
end $compat$;
commit;
