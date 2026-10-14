-- A member may cancel a tail before its publication window closes. Once started,
-- retain it so both wins and losses remain in the personal record. Auth erasure
-- still cascades through auth.users as the privileged server role.
create policy retain_started_tails on public.leg_tails
as restrictive for delete to authenticated
using (exists (
  select 1 from public.published_legs p
  where p.leg_key = leg_tails.leg_key and p.expires_at > now()
));
