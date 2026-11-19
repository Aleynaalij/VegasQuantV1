import type { NextRequest } from "next/server";
import { PRIVATE_ACCESS_PATH, privateAccessConfig } from "../../../lib/private-access-stage-config";
import { readStageRecords, signInStage, signOutStage, stagePage, stageRedirect, stageResponse, stageToken } from "../../../lib/private-access-stage";

export const dynamic = "force-dynamic";

function signInPage(status = 200) {
  return stagePage("Private access staging", `
    <p>Sign in with an authorized staging account.</p>
    ${status === 403 ? "<p>Access denied. Check your staging account and authenticator code.</p>" : ""}
    <form method="post">
      <label>Email <input name="email" type="email" autocomplete="username" required maxlength="254"></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" required maxlength="256"></label>
      <label>Authenticator code <input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"></label>
      <button type="submit">Sign in</button>
    </form>`, status);
}

export function GET() {
  return privateAccessConfig(process.env) ? signInPage() : stageResponse(null, 404);
}

export async function POST(request: NextRequest) {
  const config = privateAccessConfig(process.env);
  if (!config) return stageResponse(null, 404);
  if (request.headers.get("origin") !== config.origin) return stageResponse(null, 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded") {
    return stageResponse(null, 415);
  }
  const length = Number(request.headers.get("content-length"));
  if (!Number.isInteger(length) || length <= 0 || length > 4096) return stageResponse(null, 400);

  try {
    const fields = await request.formData();
    if (fields.get("action") === "signout") return signOutStage(config, stageToken(request));
    const email = fields.get("email");
    const password = fields.get("password");
    const code = fields.get("code") ?? "";
    if (typeof email !== "string" || !email || email.length > 254 ||
        typeof password !== "string" || !password || password.length > 256 ||
        typeof code !== "string" || (code && !/^\d{6}$/.test(code))) {
      return stageResponse(null, 400);
    }
    const token = await signInStage(config, email, password, code);
    if (!token || token.length > 3800) return signInPage(403);
    const result = await readStageRecords(config, token);
    if (result.status === 503) return stageResponse(null, 503);
    if (result.status !== 200) return signInPage(403);
    return stageRedirect(`${PRIVATE_ACCESS_PATH}/records`, config, token);
  } catch {
    return stageResponse(null, 503);
  }
}
