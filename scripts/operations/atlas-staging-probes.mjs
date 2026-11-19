#!/usr/bin/env node
/**
 * ATLAS staging isolation probes for the protected `atlas-private-access` deployment.
 *
 * Read-only by construction: GETs, and POSTs with an empty body and no signature or dispatch
 * header, so every guarded route must refuse before doing any work. No sign-in, no cookies other
 * than Vercel's own protection cookie, no database client.
 *
 *   node scripts/operations/atlas-staging-probes.mjs --url https://<deployment>.vercel.app
 *     [--share-url <Vercel shareable link>]   # temporary viewer access, no project setting change
 *     [--json out.json]
 *
 * Phase 1 (always): without any Vercel access, every path must return Vercel's protection
 *   response, never app content.
 * Phase 2 (with --share-url, or VQ_PROBE_BYPASS from Vercel "Protection Bypass for Automation"):
 *   guarded routes refuse with the expected status, and the shipped HTML/JS names only the
 *   staging Supabase project and carries no production endpoint or secret.
 * Exit code 1 if any check fails.
 */

export const STAGE_REF = "caynldluziwrzmvuslzg";
export const PROD_REF = "uowearboulykfcwnuirn";

/** Paths probed without access: all must be blocked by Vercel. */
export const PROTECTED_PATHS = [
  ["GET", "/"],
  ["GET", "/staging/private-access"],
  ["GET", "/nba/props"],
  ["POST", "/api/stripe/webhook"],
  ["POST", "/api/notifications/dispatch"],
];

/**
 * Guarded routes with Vercel access. Bodies are empty and no signature/dispatch header is sent,
 * so each must refuse before touching a provider or the database. Runs need network access to the
 * deployment host (Node: NODE_USE_ENV_PROXY=1 behind a proxy).
 */
export const ROUTE_EXPECTATIONS = [
  {
    method: "POST",
    path: "/api/stripe/webhook",
    expect: [503],
    why: "BILLING_ENABLED=false",
  },
  {
    method: "POST",
    path: "/api/age/webhook",
    expect: [503],
    why: "no identity provider config",
  },
  {
    method: "POST",
    path: "/api/notifications/dispatch",
    expect: [401],
    why: "no dispatch token",
  },
  {
    method: "POST",
    path: "/api/notifications/social-dispatch",
    expect: [401],
    why: "no dispatch token",
  },
  {
    method: "POST",
    path: "/api/live/alerts",
    expect: [401],
    why: "no dispatch token",
  },
  // With LIVE_SCORES_DISABLED=1 these answer 200 with `disabled: true` and never call ESPN.
  {
    method: "GET",
    path: "/api/live?sport=nba",
    expect: [200],
    body: /"disabled":true/,
    why: "LIVE_SCORES_DISABLED=1",
  },
  {
    method: "GET",
    path: "/api/live/box?sport=nba&id=1",
    expect: [200],
    body: /"disabled":true/,
    why: "LIVE_SCORES_DISABLED=1",
  },
];

/** Vercel's protection: 401 page, or a redirect to Vercel SSO / login. Never app content. */
export function isVercelProtection(status, headers, body = "") {
  const location = headers.get?.("location") ?? headers.location ?? "";
  if ([301, 302, 303, 307, 308].includes(status))
    return /(^https:\/\/vercel\.com\/(login|sso)|\/sso-api\b|_vercel_sso)/.test(
      location,
    );
  if (status === 401 || status === 403)
    return (
      /vercel/i.test(body) || /vercel/i.test(headers.get?.("server") ?? "")
    );
  return false;
}

const FORBIDDEN = [
  [new RegExp(PROD_REF), "production Supabase ref"],
  [/https?:\/\/(www\.)?vegasquant\.app\/api\//, "production API URL"],
  [/\b(sk|rk)_live_[A-Za-z0-9]{8,}/, "Stripe live secret"],
  [/\bpk_live_[A-Za-z0-9]{8,}/, "Stripe live publishable key"],
  [/\bsb_secret_[A-Za-z0-9_-]{8,}/, "Supabase secret key"],
  [/\bwhsec_[A-Za-z0-9]{8,}/, "webhook signing secret"],
  [/postgres(ql)?:\/\/[^\s"'`]+/, "database URL"],
  [/"role"\s*:\s*"service_role"/, "service-role claim"],
];

/** Problems in shipped text, plus which Supabase projects it names. */
export function scanShipped(text) {
  const problems = FORBIDDEN.filter(([re]) => re.test(text)).map(
    ([, what]) => what,
  );
  const projects = [
    ...new Set(
      [...text.matchAll(/https?:\/\/([a-z0-9]{20})\.supabase\.co/g)].map(
        (m) => m[1],
      ),
    ),
  ];
  for (const p of projects)
    if (p !== STAGE_REF) problems.push(`other Supabase project ${p}`);
  return { problems, projects };
}

/** Script and chunk URLs referenced by a page, same origin only. */
export function assetUrls(html, base) {
  const out = new Set();
  for (const m of html.matchAll(/(?:src|href)="([^"]+\.js(?:\?[^"]*)?)"/g)) {
    const url = new URL(m[1].replaceAll("&amp;", "&"), base);
    if (url.origin === new URL(base).origin) out.add(url.href);
  }
  return [...out];
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith("--")) continue;
    args[k.slice(2)] = argv[i + 1];
    i++;
  }
  return args;
}

async function accessHeaders(base, shareUrl) {
  if (process.env.VQ_PROBE_BYPASS)
    return { "x-vercel-protection-bypass": process.env.VQ_PROBE_BYPASS };
  if (!shareUrl) return null;
  const res = await fetch(shareUrl, { redirect: "manual" });
  const cookies = (res.headers.getSetCookie?.() ?? []).map(
    (c) => c.split(";")[0],
  );
  if (new URL(shareUrl).origin !== new URL(base).origin)
    throw new Error("--share-url must be on the --url deployment");
  if (!cookies.length)
    throw new Error(`share link gave no access cookie (status ${res.status})`);
  return { cookie: cookies.join("; ") };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url || !/^https:\/\/[a-z0-9-]+\.vercel\.app\/?$/.test(args.url))
    throw new Error(
      "--url must be the protected https://<deployment>.vercel.app origin (never vegasquant.app)",
    );
  const base = args.url.replace(/\/$/, "");
  const results = [];
  const record = (phase, name, ok, detail) =>
    results.push({ phase, name, result: ok ? "PASS" : "FAIL", detail });

  for (const [method, path] of PROTECTED_PATHS) {
    const res = await fetch(base + path, {
      method,
      redirect: "manual",
      headers: method === "POST" ? { "content-type": "application/json" } : {},
      body: method === "POST" ? "{}" : undefined,
    });
    const body = await res.text();
    record(
      "protection",
      `${method} ${path} blocked without access`,
      isVercelProtection(res.status, res.headers, body),
      `${res.status} ${res.headers.get("location") ?? ""}`.trim(),
    );
  }

  const access = await accessHeaders(base, args["share-url"]);
  if (!access) {
    results.push({
      phase: "routes",
      name: "guarded routes and shipped bundle",
      result: "NOT_RUN",
      detail: "pass --share-url or set VQ_PROBE_BYPASS",
    });
  } else {
    for (const r of ROUTE_EXPECTATIONS) {
      const res = await fetch(base + r.path, {
        method: r.method,
        redirect: "manual",
        headers: {
          ...access,
          ...(r.method === "POST"
            ? { "content-type": "application/json" }
            : {}),
        },
        body: r.method === "POST" ? "{}" : undefined,
      });
      const text = await res.text();
      const ok =
        r.expect.includes(res.status) && (!r.body || r.body.test(text));
      record(
        "routes",
        `${r.method} ${r.path} refuses (${r.why})`,
        ok,
        `${res.status}, expected ${r.expect.join("/")}${r.body ? ` with ${r.body}` : ""}`,
      );
    }
    const pages = ["/", "/staging/private-access"];
    let shipped = "";
    for (const p of pages) {
      const res = await fetch(base + p, { headers: access });
      const html = await res.text();
      record(
        "bundle",
        `GET ${p} serves the app`,
        res.ok && !isVercelProtection(res.status, res.headers, html),
        String(res.status),
      );
      shipped += html;
      for (const url of assetUrls(html, base + p))
        shipped += await (await fetch(url, { headers: access })).text();
    }
    const { problems, projects } = scanShipped(shipped);
    record(
      "bundle",
      "shipped HTML/JS has no production endpoint or secret",
      problems.length === 0,
      problems.join("; ") || "clean",
    );
    record(
      "bundle",
      "shipped HTML/JS names the staging Supabase project",
      projects.includes(STAGE_REF),
      projects.join(", ") || "none found",
    );
  }

  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results)
    console.log(
      `${r.result.padEnd(8)} ${r.phase.padEnd(10)} ${r.name.padEnd(width)}  ${r.detail}`,
    );
  if (args.json)
    (await import("node:fs")).writeFileSync(
      args.json,
      JSON.stringify(
        { url: base, at: new Date().toISOString(), results },
        null,
        2,
      ),
    );
  process.exitCode = results.some((r) => r.result === "FAIL") ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`probe error: ${err.message}`);
    process.exitCode = 2;
  });
}
