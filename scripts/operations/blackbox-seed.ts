import { draftAutopilotTasks } from "../../src/lib/autopilot-tasks";
import { readPreviewPublicationIntelligence } from "../../src/lib/nba-publication-intelligence-preview";
import type { SupabaseClient } from "@supabase/supabase-js";

// Generate reviewed SQL for the staging connector. This script has no network client.
async function main() {
  const { fixtures } = await readPreviewPublicationIntelligence(
    {} as SupabaseClient,
  );
  const tasks = draftAutopilotTasks([...fixtures, ...fixtures]);
  const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  for (const task of tasks) {
    console.log(
      `insert into blackbox.tasks(id, proposal) values (${literal(task.id)}, ${literal(JSON.stringify(task))}::jsonb) on conflict (id) do nothing;`,
    );
  }
}
void main();
