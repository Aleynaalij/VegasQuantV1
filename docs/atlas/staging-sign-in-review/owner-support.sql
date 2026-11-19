-- PROPOSED / NOT EXECUTED. No Auth credentials or MFA fields are written here.
-- Invoke only with connector project_id=caynldluziwrzmvuslzg AFTER review and I1.
-- SQL cannot attest the remote project ID. The operator must pin it out-of-band.
-- Both exact owners must already exist through the reviewed Auth Admin process.
begin;
lock table auth.users,auth.sessions,vq_private_access_stage.private_development_owners,
  vq_private_access_stage.entitlements,vq_fixture.age_states,vq_fixture.entitlements
  in share row exclusive mode;
do $guard$
begin
  if (select count(*) from auth.users) <> 12
     or exists(select 1 from auth.users where email is null or email !~* '\.invalid$')
     or exists(select 1 from auth.sessions)
     or not exists(select 1 from vq_private_access_stage.private_development_settings where enabled)
     or (select count(*) from vq_private_access_stage.private_development_owners) <> 6
     or (select count(*) from vq_private_access_stage.entitlements) <> 6
     or exists(select 1 from vq_private_access_stage.private_development_owners where user_id not in
       ('b21e0096-1939-48c0-b6e3-3f369e2ee0cc','4d2d18b0-2cdc-4428-b921-09bbb596932a',
        '973a73d1-db07-46e8-abf4-cd13d312244b','5da49d4b-2e27-462b-8806-8b048f007359',
        '4fca30be-51e3-44c5-8e25-de3f39166d79','ff632fc5-c528-4b70-b7d6-12cacbed6da0'))
     or exists(select 1 from vq_private_access_stage.entitlements e where not e.active
       or not exists(select 1 from vq_private_access_stage.private_development_owners o where o.user_id=e.user_id))
     or (select count(*) from auth.users where
       (id,email) in (('0854c91b-5fcb-5261-80a5-19171dc21a39'::uuid,'mike-owner@vq-fixture.invalid'),
                      ('d68da9b8-85e0-52b0-9483-6256283f5e97'::uuid,'elo-owner@vq-fixture.invalid'))
       and email_confirmed_at is not null and role='authenticated'
       and not coalesce(is_anonymous,false) and deleted_at is null
       and (banned_until is null or banned_until<=now())) <> 2
     or exists(select 1 from vq_fixture.age_states where user_id in
       ('0854c91b-5fcb-5261-80a5-19171dc21a39','d68da9b8-85e0-52b0-9483-6256283f5e97'))
     or exists(select 1 from vq_fixture.entitlements where user_id in
       ('0854c91b-5fcb-5261-80a5-19171dc21a39','d68da9b8-85e0-52b0-9483-6256283f5e97'))
  then raise exception 'Owner support preconditions failed; stop without repairs'; end if;
end $guard$;
insert into vq_private_access_stage.private_development_owners(user_id) values
 ('0854c91b-5fcb-5261-80a5-19171dc21a39'),('d68da9b8-85e0-52b0-9483-6256283f5e97');
insert into vq_private_access_stage.entitlements(user_id,active) values
 ('0854c91b-5fcb-5261-80a5-19171dc21a39',true),('d68da9b8-85e0-52b0-9483-6256283f5e97',true);
insert into vq_fixture.age_states(user_id,verified) values
 ('0854c91b-5fcb-5261-80a5-19171dc21a39',true),('d68da9b8-85e0-52b0-9483-6256283f5e97',true);
insert into vq_fixture.entitlements(user_id,allowed,starts_at,expires_at,revoked_at)
 select id,true,transaction_timestamp()-interval '1 hour',transaction_timestamp()+interval '7 days',null
 from (values('0854c91b-5fcb-5261-80a5-19171dc21a39'::uuid),
             ('d68da9b8-85e0-52b0-9483-6256283f5e97'::uuid)) as owners(id);
commit;
