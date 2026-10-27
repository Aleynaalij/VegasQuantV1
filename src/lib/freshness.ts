export function freshness(at: string | null | undefined, now = Date.now()) {
  const timestamp = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(timestamp))
    return { label: "Time not supplied", tone: "muted", minutes: null };
  const minutes = Math.floor((now - timestamp) / 60000);
  if (minutes < -5)
    return { label: "Timestamp needs review", tone: "red", minutes };
  const age = Math.max(0, minutes);
  return {
    label:
      age < 60
        ? `${age}m ago`
        : age < 1440
          ? `${Math.floor(age / 60)}h ago`
          : `${Math.floor(age / 1440)}d ago`,
    tone: age >= 360 ? "gold" : "muted",
    minutes: age,
  };
}
