export type NotificationRow = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  actor_name: string;
  actor_avatar: string | null;
  type: string;
  content_id: string | null;
  message: string;
  priority: "critical" | "high" | "medium" | "low";
  deep_link: string;
  event_count: number;
  actor_names: string[];
  created_at: string;
  updated_at: string;
  read_at: string | null;
  viewed_at: string | null;
};
export type NotificationPreferences = {
  user_id: string;
  disabled_types: string[];
  push_enabled: boolean;
  email_enabled: boolean;
  sound_enabled: boolean;
  haptics_enabled: boolean;
  batch_minutes: number;
  timezone: string;
  quiet_enabled: boolean;
  quiet_start: number;
  quiet_end: number;
};
export function notificationText(n: NotificationRow) {
  if (!n.actor_id) return n.message;
  if (n.event_count > 1) {
    const names = n.actor_names.filter(Boolean);
    const who =
      names.join(", ") +
      (n.event_count > names.length
        ? ` and ${n.event_count - names.length} others`
        : "");
    if (n.type === "like") return `${who} liked your post.`;
    if (n.type === "follow") return `${who} started following you.`;
    if (n.type === "share") return `${who} shared your post link.`;
    if (n.type === "comment_reaction") return `${who} reacted to your comment.`;
    return `${n.actor_name}${names.length > 1 ? " and others" : ""} · ${n.event_count} ${n.type === "comment" ? "comments" : n.type === "reply" ? "replies" : "updates"}. ${n.message}`;
  }
  return `${n.actor_name} ${n.message}`;
}
export function notificationLink(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/notifications";
  try {
    const u = new URL(value, "https://vegasquant.app");
    return u.origin === "https://vegasquant.app" &&
      /^\/(community|notifications|membership|account|messages|feed)(\/|$)/.test(
        u.pathname,
      )
      ? u.pathname + u.search + u.hash
      : "/notifications";
  } catch {
    return "/notifications";
  }
}
export function notificationPushPayload(job: {
  notification_id: string;
  priority: string;
  deep_link: string;
  type: string;
}) {
  return {
    type: "social",
    notification_id: job.notification_id,
    priority: job.priority,
    url: notificationLink(job.deep_link),
    announcement:
      job.priority === "critical"
        ? "You have an important account or message notification. Open Vegas Quant to review."
        : "New community activity. Open Vegas Quant to see your notifications.",
  };
}
export const defaultNotificationPreferences = (
  user_id: string,
): NotificationPreferences => ({
  user_id,
  disabled_types: [],
  push_enabled: false,
  email_enabled: false,
  sound_enabled: false,
  haptics_enabled: false,
  batch_minutes: 5,
  timezone: "America/New_York",
  quiet_enabled: false,
  quiet_start: 22,
  quiet_end: 8,
});
