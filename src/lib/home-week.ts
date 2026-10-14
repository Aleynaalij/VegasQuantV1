/** The first scheduled update after Monday Night Football starts the new desk week. */
export function homeWeekStart(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const value = (name: string) => Number(parts.find(p => p.type === name)!.value);
  const local = new Date(Date.UTC(value("year"), value("month") - 1, value("day"), value("hour")));
  let days = (local.getUTCDay() + 5) % 7;
  if (days === 0 && local.getUTCHours() < 12) days = 7;
  local.setUTCDate(local.getUTCDate() - days);
  local.setUTCHours(12, 0, 0, 0);
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" }).formatToParts(local).find(p => p.type === "timeZoneName")!.value;
  const offset = Number(zone.replace("GMT", ""));
  return new Date(local.getTime() - offset * 3600000).toISOString();
}
export function isCurrentHomeWeek(timestamp: string | undefined, now = new Date()): boolean {
  return !!timestamp && Number.isFinite(Date.parse(timestamp)) && Date.parse(timestamp) >= Date.parse(homeWeekStart(now));
}
