#!/usr/bin/env node
// export-project.mjs — the TRUSTED Playwright exporter.
//
// COPY TO: engine/app/scripts/export-project.mjs (unchanged; edit COLLECTIONS only if you add a canvas).
//
//   node engine/app/scripts/export-project.mjs <absProjectDir> <absTenantRoot>
//
// ─────────────────────────────────────────────────────────────────────────────
// ⭐ WHY THIS FILE EXISTS. Routes used to run `node <projectDir>/export.mjs`: a file the build agent can
// author. That is the shell leak moved one step sideways: the agent writes the script, the SERVER runs it
// with full OS privilege, and its stdout is streamed back into the job log. So the route executes THIS
// file, which lives in the engine where no agent can write, and never a file under a tenant. It takes the
// project directory as DATA, not as code.
//
// It lives under engine/app/ (not engine/tools/) so its bare `playwright` import resolves through
// engine/app/node_modules — the same install the tenants' content/node_modules symlinks point at.
// Run it with a minimal env (agentEnv(…, {forClaude:false})): the Chromium it launches renders
// agent-authored HTML, so no secret may be in its process.
// ─────────────────────────────────────────────────────────────────────────────

import path from "node:path";
import { realpathSync, existsSync, readdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const EXIT_ERROR = 1;       // a real failure: the job should go red
const EXIT_NO_EXPORTER = 2; // informational: this collection has no trusted exporter

/** Canvas + screenshot strategy per collection. */
const COLLECTIONS = {
  carousels:     { w: 1080, h: 1350, mode: "element" },
  stories:       { w: 1080, h: 1920, mode: "element" },
  presentations: { w: 1920, h: 1080, mode: "deck" },
  posts:         { w: 1080, h: 1350, mode: "element" },   // an HTML single post's source/ (re-exported by «edit»)
};

const die = (code, msg) => { console.error(msg); process.exit(code); };

const [, , rawProject, rawTenantRoot] = process.argv;
if (!rawProject || !rawTenantRoot) die(EXIT_ERROR, "usage: export-project.mjs <absProjectDir> <absTenantRoot>");
if (!path.isAbsolute(rawProject) || !path.isAbsolute(rawTenantRoot)) die(EXIT_ERROR, "both arguments must be absolute paths");

// realpath both sides before comparing: a symlink inside the tenant must not be a way out.
const tenantRoot = realpathSync(rawTenantRoot);
if (!existsSync(rawProject)) die(EXIT_ERROR, `project directory does not exist: ${rawProject}`);
const projectDir = realpathSync(rawProject);
if (projectDir !== tenantRoot && !projectDir.startsWith(tenantRoot + path.sep)) {
  die(EXIT_ERROR, `refused: ${projectDir} is outside the tenant root ${tenantRoot}`);
}

// The collection is inferred from the path: <tenant>/content/<collection>/<slug>[/...].
const rel = path.relative(tenantRoot, projectDir).split(path.sep);
const collection = rel[0] === "content" ? rel[1] : undefined;
const cfg = collection ? COLLECTIONS[collection] : undefined;
if (!cfg) {
  die(EXIT_NO_EXPORTER, `no trusted exporter for this collection — export it by hand (${rel.join("/") || "."})`);
}

// The HTML file: <slug>.html, else the single .html in the folder, else give up.
const slug = path.basename(projectDir);
let htmlPath = path.join(projectDir, `${slug}.html`);
if (!existsSync(htmlPath)) {
  const found = readdirSync(projectDir).filter((f) => f.toLowerCase().endsWith(".html"));
  if (found.length === 1) htmlPath = path.join(projectDir, found[0]);
  else die(EXIT_ERROR, found.length === 0
    ? `no .html file in ${projectDir} (expected ${slug}.html)`
    : `expected ${slug}.html — found ${found.length} html files instead: ${found.join(", ")}`);
}

const outputDir = path.join(projectDir, "png");
await mkdir(outputDir, { recursive: true });

// ⭐ Request firewall, at the BROWSER-CONTEXT level, so it covers every frame, not just the top page.
//
// The slide HTML is agent-authored, so it may reference anything:
//   • <iframe src="file://../../<other-tenant>/brand/…">, a CSS url() at ~/.ssh: another tenant's files
//     painted into this tenant's PNG (exfiltration through a screenshot);
//   • <iframe src="http://127.0.0.1:<port>/api/<other-tenant>/strategy">: a live audit rendered another
//     tenant's whole brand kit into a scratch tenant's slide-01.png this way, because http(s) used to be
//     waved through for web fonts;
//   • fetch(…, {method: "POST", mode: "no-cors"}) at the local API or a LAN device.
// So the default is DENY. A request continues only when it is
//   (a) file:// whose REAL path is inside this tenant's content/, brand/ or library/, with no path
//       segment starting with "." (so never .env.local, .claude/ or a dotfile), or
//   (b) an https GET to a font/CDN host on FONT_CDN_HOSTS.
// (a) is narrower than "anywhere in the tenant" on purpose: tenants/<id>/.env.local holds this business's
// own account tokens, and <iframe src="../../../.env.local"> would otherwise paint them into a PNG that
// the build agent can Read on its next «edit» turn and the publisher sends out.
// Everything else (http:, ws:, loopback, RFC1918, link-local, any other host, any non-GET) is aborted and
// logged. Redirects: Playwright only routes the FIRST hop of a redirect, so allowed requests are fetched
// here with redirects OFF and every Location is judged by the same rules before it is followed.
/** The only tenant folders a slide may load files from: the piece itself, the brand's assets, product photos. */
const FILE_ROOTS = new Set(["content", "brand", "library"]);
const FONT_CDN_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com", "cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com"]);

/** Why a host is refused, for the log (the verdict itself is "not on the allowlist"). */
function hostReason(host) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || /^127\./.test(h) || h === "::1" || h === "0.0.0.0" || h === "::") return "loopback";
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^f[cd][0-9a-f]{2}:/.test(h)) return "private network";
  if (/^169\.254\./.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return "link-local";
  return "host not allowlisted";
}

/** null = allowed; otherwise the reason it is blocked. */
function verdict(method, url) {
  let u;
  try { u = new URL(url); } catch { return "unparseable url"; }
  if (u.protocol === "file:") {
    if (method !== "GET") return "only GET on file://";
    let target;
    try {
      target = fileURLToPath(u.href.split("?")[0].split("#")[0]);
      // realpath the deepest part that exists, so a missing file is judged by where it WOULD be
      // (and a symlinked parent cannot point outside the tenant)
      let base = target, rest = "";
      while (!existsSync(base) && path.dirname(base) !== base) { rest = path.join(path.basename(base), rest); base = path.dirname(base); }
      target = path.join(realpathSync(base), rest);
    } catch { return "unresolvable file path"; }
    if (target !== tenantRoot && !target.startsWith(tenantRoot + path.sep)) return "file outside the tenant";
    const parts = path.relative(tenantRoot, target).split(path.sep);
    if (!FILE_ROOTS.has(parts[0])) return `file outside ${[...FILE_ROOTS].join("/, ")}/`;
    if (parts.some((p) => p.startsWith("."))) return "hidden file or folder";
    return null;
  }
  if (u.protocol !== "https:") {
    const where = hostReason(u.hostname);
    return `${u.protocol.replace(":", "")}${where === "host not allowlisted" ? "" : ` to ${where}`} — https only`;
  }
  if (method !== "GET") return "only GET leaves the exporter";
  if (!FONT_CDN_HOSTS.has(u.hostname) || (u.port && u.port !== "443")) return hostReason(u.hostname);
  return null;
}

let blocked = 0;
// "blocked: <url> (<why>)": the URL first, so a log reader (and the verifier) can grep for it.
const block = (url, why) => { blocked += 1; console.log(`blocked: ${url} (${why})`); };

const browser = await chromium.launch({ headless: true });
// serviceWorkers: "block" — a service worker's own fetches would not pass through context.route.
const context = await browser.newContext({ viewport: { width: cfg.w, height: cfg.h }, deviceScaleFactor: 2, serviceWorkers: "block" });
await context.route("**/*", async (route) => {
  const req = route.request();
  const why = verdict(req.method(), req.url());
  if (why) { block(req.url(), `${req.method()} · ${why}`); return route.abort("blockedbyclient"); }
  if (req.url().startsWith("file:")) return route.continue();
  try {
    // Follow redirects HERE, judging every hop. Measured: a hop the browser follows itself (even after
    // route.fulfill() with the 3xx) never reaches this handler, so an allowlisted host that redirects
    // would otherwise walk straight to 127.0.0.1.
    let url = req.url();
    for (let hop = 0; hop <= 5; hop += 1) {
      const response = await route.fetch({ url, maxRedirects: 0 });
      const location = response.headers()["location"];
      if (response.status() < 300 || response.status() >= 400 || !location) return route.fulfill({ response });
      const next = new URL(location, url).href;
      const why2 = verdict("GET", next);
      if (why2) { block(next, `redirect from ${url} · ${why2}`); return route.abort("blockedbyclient"); }
      url = next;
    }
    block(req.url(), "more than 5 redirects");
    return route.abort("blockedbyclient");
  } catch (e) {
    console.log(`failed: ${req.url()} (${e instanceof Error ? e.message.split("\n")[0] : e})`);
    return route.abort("failed");
  }
});
// WebSockets never go through route(): mock every one and close it, so no connection is ever made.
await context.routeWebSocket(() => true, (ws) => { block(ws.url(), "websockets are not allowed"); ws.close(); });
const page = await context.newPage();

await page.goto(`file://${htmlPath}`, { waitUntil: "load" });
// Without a linked font, fonts.ready resolves instantly and non-Latin text renders in a fallback face:
// the HTML must <link> its fonts. The extra settle covers late font swaps.
await page.evaluate(() => document.fonts.ready);
// A deck's presenter chrome (key hints, progress bar, nav buttons) is for presenting live, not for stills.
if (cfg.mode === "deck") await page.addStyleTag({ content: ".nav-hint,.progress,.progress-bar,.deck-nav,.controls,[data-presenter-only]{display:none!important}" });
await page.waitForTimeout(1200);

const total = await page.locator(".slide").count();
if (total === 0) { await browser.close(); die(EXIT_ERROR, `no .slide elements found in ${path.basename(htmlPath)}`); }

for (let i = 0; i < total; i += 1) {
  const num = String(i + 1).padStart(2, "0");
  const file = path.join(outputDir, `slide-${num}.png`);
  if (cfg.mode === "deck") {
    // Full-screen deck: only the .active slide is displayed, so step it and shoot the viewport.
    await page.evaluate((idx) => {
      document.querySelectorAll(".slide").forEach((s, x) => s.classList.toggle("active", x === idx));
    }, i);
    await page.waitForTimeout(400);
    await page.screenshot({ path: file });
  } else {
    await page.locator(".slide").nth(i).screenshot({ path: file, animations: "disabled" });
  }
  console.log(`✓ slide-${num}.png`);
}

await browser.close();
if (blocked) console.log(`(${blocked} request${blocked === 1 ? "" : "s"} blocked by the exporter firewall)`);
console.log(`\nExported ${total} slides → ${outputDir}`);
