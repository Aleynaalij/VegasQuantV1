-- Run from an independently controlled exporter against staging only.
select jsonb_build_object('project','apwndmcsjxzjxnpxfywo','tasks',coalesce(jsonb_agg(
  to_jsonb(t) || jsonb_build_object(
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by version) from blackbox.events e where e.task_id=t.id),'[]'::jsonb),
    'outcomes',coalesce((select jsonb_agg(to_jsonb(m) order by version) from blackbox.memory m where m.task_id=t.id),'[]'::jsonb)
  ) order by t.id
),'[]'::jsonb)) as snapshot from blackbox.tasks t;
