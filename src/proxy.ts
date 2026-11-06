import { NextResponse, type NextRequest } from "next/server";

/**
 * "/" became the neutral lobby when the NFL desk moved to /nfl. Old shared and bookmarked links that
 * opened a game on the NFL desk (`/?game=<slug>`) get a real HTTP 308 to the same game at /nfl, with
 * every other query parameter kept, before anything renders. Only "/" is matched; hash-only links
 * (`/#home-games`) never reach the server and are forwarded by the lobby in the browser.
 */
export function proxy(request: NextRequest) {
  const url = request.nextUrl;
  if (!url.searchParams.has("game")) return NextResponse.next();
  const to = url.clone();
  to.pathname = "/nfl";
  to.hash = "home-games";
  return NextResponse.redirect(to, 308);
}

export const config = { matcher: "/" };
