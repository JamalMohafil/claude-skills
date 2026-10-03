// proxy.ts — the API's front door (Next.js 16 `proxy`, formerly `middleware`).
//
// COPY TO: engine/app/src/proxy.ts (unchanged). Check the installed Next version's docs: before v16 the
// same code lives in src/middleware.ts with the function named `middleware`.
//
// ⭐ WHY THIS EXISTS. The API has no login: it is a local tool for one owner. That is only safe while
// nobody but the owner's own dashboard can reach it. A live audit proved two other callers could:
//   • any website the owner visits (CSRF): a text/plain "simple" POST needs no preflight, and every route parsed
//     it as JSON anyway, so an evil-Origin POST reached the brand-kit approval;
//   • agent-authored slide HTML inside the exporter, and anything that can make the server's browser or a
//     fetch call 127.0.0.1 (DNS rebinding; a cross-site <img> on a GET with side effects).
// Binding dev to 127.0.0.1 (package.json: "next dev -H 127.0.0.1") closes the LAN. This closes the browser.
//
// The rules, in order:
//   1. Host must be a loopback name. A DNS-rebinding page arrives as Host: evil.example:3000.
//   2. Sec-Fetch-Site: cross-site is refused on EVERY method (reads included).
//   3. A mutating request (anything but GET/HEAD/OPTIONS) must be SAME-ORIGIN: its Origin is exactly
//      http://<this Host>, or it has no Origin at all AND Sec-Fetch-Site is same-origin / none / absent.
//      No Origin + no Sec-Fetch-Site is a non-browser caller on this machine (a route calling another
//      route, the cron's curl, a CLI tool). "Origin: null" (file://, sandboxed frames) is refused.
//   4. A mutating request WITH a body must say application/json or multipart/form-data. text/plain and
//      x-www-form-urlencoded (the only bodies a cross-site form can send without a preflight) never reach
//      a handler. Body-less POST/DELETE pass.
// Never loosen this guard. A route that calls another route server-to-server sends
// `Origin: http://127.0.0.1:<port>`.

import { NextResponse, type NextRequest } from "next/server";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const BODY_TYPES = ["application/json", "multipart/form-data"];

/** "localhost:3000" → "localhost"; "[::1]:3000" → "[::1]". */
function hostname(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1);
  const i = h.lastIndexOf(":");
  return i === -1 ? h : h.slice(0, i);
}

function refuse(reason: string): NextResponse {
  return NextResponse.json({ error: `refused: ${reason}` }, { status: 403, headers: { "Cache-Control": "no-store" } });
}

export function proxy(request: NextRequest) {
  const h = request.headers;
  const host = h.get("host") || "";
  if (!LOOPBACK_HOSTS.has(hostname(host))) return refuse(`host "${host}" is not this machine`);

  const site = (h.get("sec-fetch-site") || "").toLowerCase();
  if (site === "cross-site") return refuse("cross-site request");

  if (SAFE_METHODS.has(request.method)) return NextResponse.next();

  const origin = h.get("origin");
  if (origin !== null) {
    if (origin !== `http://${host}`) return refuse(`origin "${origin}" is not this dashboard`);
  } else if (site && site !== "same-origin" && site !== "none") {
    return refuse(`no origin and sec-fetch-site "${site}"`);
  }

  const hasBody = Number(h.get("content-length") || "0") > 0 || h.has("transfer-encoding");
  if (hasBody) {
    const type = (h.get("content-type") || "").toLowerCase();
    if (!BODY_TYPES.some((t) => type.startsWith(t))) {
      return refuse(`content-type "${type || "none"}" — send application/json or multipart/form-data`);
    }
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
