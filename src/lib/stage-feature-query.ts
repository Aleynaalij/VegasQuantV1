import registry from "./stage-feature-registry.json";

export const FEATURE_CONTRACT = "vq-stage-features-v1";
export type FeatureName =
  | "social"
  | "profile"
  | "desk"
  | "notifications"
  | "research";
export type FeatureCapabilities = Record<FeatureName, boolean>;
export const noFeatures: FeatureCapabilities = {
  social: false,
  profile: false,
  desk: false,
  notifications: false,
  research: false,
};
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const ident = /^[a-z][a-z0-9_]*$/;
export function featureCapabilities(
  value: unknown,
): FeatureCapabilities | null {
  if (!value || typeof value !== "object") return null;
  const v = value as {
    contract?: unknown;
    capabilities?: Record<string, unknown>;
  };
  if (
    v.contract !== FEATURE_CONTRACT ||
    !v.capabilities ||
    Object.keys(noFeatures).some((k) => typeof v.capabilities![k] !== "boolean")
  )
    return null;
  return Object.fromEntries(
    Object.keys(noFeatures).map((k) => [k, v.capabilities![k]]),
  ) as FeatureCapabilities;
}
function validArg(value: unknown, type: string): boolean {
  if (value === null) return true;
  if (type === "jsonb")
    return (
      Array.isArray(value) &&
      value.length >= 2 &&
      value.length <= 4 &&
      value.every((v) => typeof v === "string" && v.length <= 80)
    );
  if (type.endsWith("[]"))
    return (
      Array.isArray(value) &&
      value.length <= 1000 &&
      value.every((v) => validArg(v, type.slice(0, -2)))
    );
  if (type === "uuid") return typeof value === "string" && uuid.test(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "integer")
    return Number.isInteger(value) && Math.abs(Number(value)) <= 10000;
  if (type === "timestamp with time zone")
    return typeof value === "string" && Number.isFinite(Date.parse(value));
  return type === "text" && typeof value === "string" && value.length <= 2000;
}
/** Parse a bounded existing PostgREST request into data, never SQL or an upstream URL. */
export function stageFeatureQuery(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (k) =>
        ![
          "path",
          "query",
          "method",
          "accept",
          "body",
          "prefer",
          "request_id",
        ].includes(k),
    ) ||
    typeof v.path !== "string" ||
    typeof v.query !== "string" ||
    typeof v.method !== "string"
  )
    return null;
  if (
    v.accept !== null &&
    v.accept !== "application/json" &&
    v.accept !== "application/vnd.pgrst.object+json"
  )
    return null;
  const preferences =
    typeof v.prefer === "string"
      ? v.prefer
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  if (
    preferences.some(
      (p) =>
        ![
          "return=minimal",
          "return=representation",
          "resolution=ignore-duplicates",
          "resolution=merge-duplicates",
          "count=exact",
          "missing=default",
        ].includes(p),
    )
  )
    return null;
  let body: Record<string, unknown> = {};
  try {
    if (v.body !== null) body = JSON.parse(String(v.body));
  } catch {
    return null;
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    JSON.stringify(body).length > 300000
  )
    return null;
  const rpc = /^rpc\/([a-z_]+)$/.exec(v.path);
  if (rpc) {
    const rule = (
      registry.rpcs as Record<
        string,
        { args: string[]; types: string[]; group: string; write: boolean }
      >
    )[rpc[1]];
    if (
      !rule ||
      v.query !== "" ||
      v.method !== "POST" ||
      Object.keys(body).some(
        (k) =>
          !rule.args.includes(k) ||
          !validArg(body[k], rule.types[rule.args.indexOf(k)]),
      )
    )
      return null;
    if ("p_photo_path" in body && body.p_photo_path !== null) return null;
    if (
      "p_limit" in body &&
      (!Number.isInteger(body.p_limit) ||
        Number(body.p_limit) < 1 ||
        Number(body.p_limit) > 100)
    )
      return null;
    if (
      rule.write &&
      (typeof v.request_id !== "string" || !uuid.test(v.request_id))
    )
      return null;
    return {
      kind: "rpc",
      name: rpc[1],
      group: rule.group as FeatureName,
      args: body,
      write: rule.write,
      request_id: v.request_id ?? null,
    };
  }
  const rule = (
    registry.tables as Record<
      string,
      {
        columns: string[];
        write: string[];
        group: string;
        methods: string[];
        key: string[];
        upsert: boolean;
      }
    >
  )[v.path];
  if (!ident.test(v.path) || !rule || !rule.methods.includes(v.method))
    return null;
  const read = v.method === "GET";
  if (!read && (typeof v.request_id !== "string" || !uuid.test(v.request_id)))
    return null;
  if (
    Object.keys(body).some((k) => !rule.write.includes(k)) ||
    ("photo_path" in body && body.photo_path !== null)
  )
    return null;
  const params = new URLSearchParams(v.query);
  if (
    params.size > 16 ||
    [...params.keys()].some((k) => params.getAll(k).length !== 1)
  )
    return null;
  const selected = params.get("select") ?? "*";
  const columns = selected === "*" ? rule.columns : selected.split(",");
  if (!columns.length || columns.some((c) => !rule.columns.includes(c)))
    return null;
  const limit = Number(params.get("limit") ?? 1000),
    offset = Number(params.get("offset") ?? 0);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 1000 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 10000
  )
    return null;
  const filters: { column: string; op: string; value: unknown }[] = [];
  for (const [column, text] of params) {
    if (["select", "limit", "offset", "order", "on_conflict"].includes(column))
      continue;
    if (!rule.columns.includes(column) || filters.length >= 8) return null;
    if (text === "is.null") {
      filters.push({ column, op: "is", value: null });
      continue;
    }
    const m = /^(eq|in|lt|lte|gt|gte)\.(.*)$/.exec(text);
    if (!m || m[2].length > 200000) return null;
    let val: unknown = m[2];
    if (m[1] === "in") {
      if (!m[2].startsWith("(") || !m[2].endsWith(")")) return null;
      const inside = m[2].slice(1, -1);
      try {
        val = inside.startsWith('"')
          ? JSON.parse(`[${inside}]`)
          : inside.split(",");
      } catch {
        return null;
      }
      if (
        !Array.isArray(val) ||
        !val.length ||
        val.length > 1000 ||
        val.some(
          (x) => typeof x !== "string" || x.length > 2000 || /[()\x00]/.test(x),
        )
      )
        return null;
    }
    filters.push({ column, op: m[1], value: val });
  }
  const order = (params.get("order") ?? "")
    .split(",")
    .filter(Boolean)
    .map((s) => s.split("."));
  if (
    order.length > 3 ||
    order.some(
      ([c, d, n, ...rest]) =>
        !rule.columns.includes(c) ||
        (d && !["asc", "desc"].includes(d)) ||
        (n && !["nullsfirst", "nullslast"].includes(n)) ||
        rest.length,
    )
  )
    return null;
  const conflict = params.get("on_conflict");
  if (
    (conflict || preferences.some((p) => p.startsWith("resolution="))) &&
    (!rule.upsert || read)
  )
    return null;
  if (conflict && conflict !== rule.key.join(",")) return null;
  if (read && Object.keys(body).length) return null;
  if (v.method === "PATCH" && !Object.keys(body).length) return null;
  if (["PATCH", "DELETE"].includes(v.method) && !filters.length) return null;
  return {
    kind: "table",
    name: v.path,
    group: rule.group as FeatureName,
    method: v.method,
    columns,
    filters,
    order,
    limit,
    offset,
    body,
    write: !read,
    upsert: !!conflict || preferences.some((p) => p.startsWith("resolution=")),
    ignore_duplicates: preferences.includes("resolution=ignore-duplicates"),
    representation: read || preferences.includes("return=representation"),
    single: v.accept === "application/vnd.pgrst.object+json",
    request_id: v.request_id ?? null,
  };
}
