import { supabase } from "./supabase";
/** ilike pattern matching the topic exactly, ignoring case (follow matching is case-insensitive). */
export const topicPattern = (topic: string) => topic.replace(/[\\%_]/g, (c) => `\\${c}`);
// Follow/unfollow shared by Home, matchup pages and Account; listeners refresh on "vq-follows-changed".
export async function setFollow(
  uid: string,
  kind: "team" | "player",
  topic: string,
  on: boolean,
) {
  const r = on
    ? await supabase.from("topic_follows").insert({ user_id: uid, kind, topic })
    : await supabase
        .from("topic_follows")
        .delete()
        .eq("user_id", uid)
        .eq("kind", kind)
        .ilike("topic", topicPattern(topic));
  // Already following (unique violation) is the state we wanted.
  if (r.error && r.error.code !== "23505") throw Error("Could not update follow.");
  window.dispatchEvent(new Event("vq-follows-changed"));
}
