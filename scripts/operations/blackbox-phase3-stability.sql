-- Isolated validation only. Requires the Phase 3 reviewer binding fix.
begin;
alter function public.blackbox_intelligence(text,text,text,integer,boolean,text,jsonb) set schema blackbox;
alter function blackbox.blackbox_intelligence(text,text,text,integer,boolean,text,jsonb) rename to intelligence_before_stability;
revoke all on function blackbox.intelligence_before_stability(text,text,text,integer,boolean,text,jsonb) from public,anon,authenticated,service_role;

create function public.blackbox_intelligence(
  p_action text,p_task text default null,p_dependency text default null,
  p_version integer default null,p_present boolean default null,p_after text default null,
  p_review jsonb default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  payload jsonb;
  caller_role text;
  previous_review blackbox.improvement_reviews%rowtype;
begin
  -- Authenticate every operation before any private lookup. The underlying
  -- commands independently recheck the live session and the emergency switch.
  payload:=blackbox.intelligence_before_stability('page',null,null,null,null,p_after,null);
  caller_role:=payload->>'role';
  if p_action='review' then
    if caller_role<>'reviewer' then raise exception 'Access denied' using errcode='42501'; end if;
    perform 1 from blackbox.tasks where id=p_task for update;
    select * into previous_review from blackbox.improvement_reviews
      where task_id=p_task and outcome_version=p_version order by revision desc limit 1;
    if found and previous_review.actor=auth.uid() and previous_review.recommendation=p_review->>'recommendation'
      and previous_review.classification=p_review->>'classification' and previous_review.effectiveness=p_review->>'effectiveness'
      and previous_review.evidence=p_review->>'evidence' then
      return jsonb_build_object('revision',previous_review.revision,'duplicate',true);
    end if;
  elsif p_action='page' and caller_role in ('admin','reviewer') then
    return payload || jsonb_build_object('reporting',jsonb_build_object(
      'recommendationAcceptance',null,
      'reviewerAvailability',null,
      'effectiveness',coalesce((select jsonb_object_agg(effectiveness,total) from (
        select effectiveness,count(*) total from (
          select distinct on(task_id,outcome_version) effectiveness from blackbox.improvement_reviews
          order by task_id,outcome_version,revision desc
        ) latest group by effectiveness
      ) counts),'{}'),
      'rootCauses',coalesce((select jsonb_object_agg(classification,total) from (
        select classification,count(*) total from (
          select distinct on(task_id,outcome_version) classification from blackbox.improvement_reviews
          order by task_id,outcome_version,revision desc
        ) latest group by classification
      ) counts),'{}'),
      'briefingHistory',coalesce((select jsonb_agg(to_jsonb(b) order by b.day desc,b.version desc) from (
        select day,version,captured_at,jsonb_array_length(summary->'tasks') task_count,summary->>'policy' policy
        from blackbox.briefings order by day desc,version desc limit 25
      ) b),'[]')));
  elsif p_action='page' then
    return payload;
  end if;
  return blackbox.intelligence_before_stability(p_action,p_task,p_dependency,p_version,p_present,p_after,p_review);
end;
$$;
revoke all on function public.blackbox_intelligence(text,text,text,integer,boolean,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.blackbox_intelligence(text,text,text,integer,boolean,text,jsonb) to authenticated;
commit;
