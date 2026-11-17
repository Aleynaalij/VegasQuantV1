import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const production = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(production ?? "")) throw Error("Pin an exact production commit");
const list = ref => execFileSync("git", ["ls-tree", "-r", "--name-only", ref, "src/app"], {encoding: "utf8"}).trim().split("\n");
const route = path => "/" + path.replace(/^src\/app\//, "").replace(/(?:^|\/)(page|route)\.(?:ts|tsx)$/, "");
const isRoute = p => /\/(page|route)\.(ts|tsx)$/.test(p);
const baseline = list(production).filter(isRoute);
const candidate = new Set(list("HEAD").filter(isRoute));
const rows = baseline.map(path => {
 const url = route(path).replace(/\/$/, "") || "/";
 const restricted = url.startsWith("/api/") || url === "/admin" || url.startsWith("/admin/") || /\/image$/.test(url);
 return `| \`${url}\` | ${candidate.has(path) ? "Present" : "MISSING"} | ${restricted ? "Intentional authorization denial" : "Owner/MFA gate, existing page retained"} | ${restricted ? "Hosted side-effect/API/download contract not admitted" : "No build exclusion; live data/feature acceptance still required"} |`;
});
const text = `# Route compatibility inventory\n\nProduction deployment source: \`${production}\`. Source-file inventory, not hosted navigation acceptance.\n\nAll baseline page/handler files are compared with the candidate. Explicit staging consumer routes are separately tested against actual page patterns. Legacy service APIs are included in the build but intentionally denied by the combined staging proxy. Their presence is not functional parity.\n\n| Production route | Candidate file | Combined policy | Classification / limit |\n|---|---|---|---|\n${rows.join("\n")}\n\n## Diagnosed failures\n\n- \`/membership\`, \`/notifications\`, \`/slots\`, \`/vegas-fear\`, \`/privacy\`, \`/support\`: prior unexpected 404 was an authorization allowlist omission, not build exclusion. Explicit real-page patterns now admitted after live owner authorization.\n- \`/account\`: no such production page file. Existing account navigation opens the account shell; supported deep links are \`/account/recovery\` and \`/account/verify-age\`. No fabricated destination is added.\n- Unknown IDs/slugs may still produce real missing-record errors/404s. Do not rewrite them into success or placeholder research.\n- Admin, billing, collectors, dispatchers, account mutations, legacy server image/download handlers and service worker remain intentionally denied in combined staging. The gate's own login/logout endpoints are separately origin checked.\n- Client-rendered publication PNG remains existing code; gated hosted download acceptance and legacy download routes remain open.\n- Game Rooms preserve sport + stored game ID + optional Eastern day; current reader retains its existing upcoming window, not a permanent archive.\n`;
writeFileSync("docs/atlas/route-compatibility.md", text);
console.log(`${baseline.length} baseline route files; ${baseline.filter(p=>!candidate.has(p)).length} missing`);
