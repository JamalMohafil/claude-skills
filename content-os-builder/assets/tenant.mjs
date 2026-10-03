// tenant.mjs — tenant discovery, validation and resolution.
//
// COPY TO: engine/app/src/lib/tenant.mjs (unchanged; edit only the lines marked EDIT:).
//
// A tenant is a folder tenants/<id>/ with a tenant.json manifest. This file is plain ESM with zero
// dependencies, so the Next app and every CLI tool in engine/tools share exactly one implementation.
//
// ⭐ There is NO default tenant. Every caller must name one, and an unknown id throws (or returns null).
// A forgotten tenant has to fail loudly rather than silently read or write another business's data.

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

export const TENANTS_DIR = "tenants";
export const SCHEMA_VERSION = 1;

/** Sidebar view ids. A manifest may only enable ids from this list. Must equal the dashboard's view list (a test asserts it). */
export const MODULE_IDS = [
  "home", "strategy", "ideas", "radar", "search", "carousels", "stories", "presentations",
  "scripts", "gallery", "analytics", "inspiration", "calendar", "assistant", "terminal", "settings",
  "library", "videos", "animations", "crm",
];
/** What a tenant publishes. The generation `type` strings ARE these ids. */
export const OUTPUT_FORMATS = [
  "carousel", "single-post", "story", "reel-idea", "reel-video", "ai-video", "presentation", "script",
  "thumbnail", "community-post", "animation",
];
/**
 * How an asset gets rendered. A format whose engine is not listed is unavailable.
 * `browser-video` = an AI video tool driven in the owner's own signed-in browser (no API).
 */
export const ENGINES = ["html", "image-model", "video-model", "browser-video", "remotion"];
export const TENANT_KINDS = ["creator", "company"];

/**
 * Per-business settings: the interview answers that code must read, kept in tenant.json under
 * `settings` (optional). tenant.json is write-denied to every agent, so these are owner-controlled.
 * Every key is optional; settingsOf() fills the defaults below. A key the interview did not ask
 * about stays absent, never invented.
 *   lang       BCP-47 publishing language of THIS business ("ar", "en", "es-MX"…): starter HTML
 *              lang/dir, the radar's language gate, image-text rules
 *   dir        "ltr" | "rtl" (derived from lang when absent)
 *   radar      { cron: boolean, max_age_days: 1..60 }
 *   competitors { covered_window_days: 1..365, hit_multiplier: >=1, heavy_min_views: >=0,
 *                 paid_transcription: boolean }
 *   crm        { currency: "USD" | any ISO-4217 code }
 *   media      { codex_image_model: string, codex_images: boolean (shell-capable helper, opt-in),
 *                edit_paid_fallback: boolean, max_credits: >=0 }
 */
export const DEFAULT_SETTINGS = {
  radar: { cron: true, max_age_days: 10 },
  competitors: { covered_window_days: 90, hit_multiplier: 2, heavy_min_views: null, paid_transcription: false },
  crm: { currency: null },
  media: { codex_image_model: null, codex_images: false, edit_paid_fallback: false, max_credits: null },
};
const RTL_LANGS = new Set(["ar", "he", "iw", "fa", "ur", "ps", "sd", "ug", "yi", "dv", "ckb"]);
export const dirFor = (lang) => (RTL_LANGS.has(String(lang || "").toLowerCase().split("-")[0]) ? "rtl" : "ltr");
const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const SETTINGS_SHAPE = {
  lang: "lang", dir: "dir",
  radar: { cron: "bool", max_age_days: [1, 60] },
  competitors: { covered_window_days: [1, 365], hit_multiplier: [1, 1000], heavy_min_views: [0, 1e12], paid_transcription: "bool" },
  crm: { currency: "currency" },
  media: { codex_image_model: "string", codex_images: "bool", edit_paid_fallback: "bool", max_credits: [0, 100000] },
};

/** Closed shape: an unknown key or a wrong type is an error, never ignored. */
export function validateSettings(settings) {
  const errors = [];
  if (settings === undefined) return errors;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return ["settings: must be an object"];
  const check = (path, rule, v) => {
    if (v === undefined || v === null) return;
    if (rule === "lang") { if (typeof v !== "string" || !LANG_RE.test(v)) errors.push(`${path}: must be a BCP-47 code like "en" or "ar"`); }
    else if (rule === "dir") { if (v !== "ltr" && v !== "rtl") errors.push(`${path}: must be "ltr" or "rtl"`); }
    else if (rule === "bool") { if (typeof v !== "boolean") errors.push(`${path}: must be true or false`); }
    else if (rule === "string") { if (typeof v !== "string" || !v.trim() || v.length > 100) errors.push(`${path}: must be a non-empty string`); }
    else if (rule === "currency") { if (typeof v !== "string" || !CURRENCY_RE.test(v)) errors.push(`${path}: must be an ISO-4217 code like "USD"`); }
    else if (Array.isArray(rule)) { if (typeof v !== "number" || !Number.isFinite(v) || v < rule[0] || v > rule[1]) errors.push(`${path}: must be a number from ${rule[0]} to ${rule[1]}`); }
  };
  for (const [k, v] of Object.entries(settings)) {
    const rule = SETTINGS_SHAPE[k];
    if (!rule) { errors.push(`settings.${k}: unknown key (valid: ${Object.keys(SETTINGS_SHAPE).join(", ")})`); continue; }
    if (typeof rule === "object" && !Array.isArray(rule)) {
      if (!v || typeof v !== "object" || Array.isArray(v)) { errors.push(`settings.${k}: must be an object`); continue; }
      for (const [k2, v2] of Object.entries(v)) {
        if (!(k2 in rule)) { errors.push(`settings.${k}.${k2}: unknown key (valid: ${Object.keys(rule).join(", ")})`); continue; }
        check(`settings.${k}.${k2}`, rule[k2], v2);
      }
    } else check(`settings.${k}`, rule, v);
  }
  return errors;
}

/** The settings a route or tool reads: the manifest's values over DEFAULT_SETTINGS (never throws). */
export function settingsOf(manifest) {
  const s = manifest?.settings && typeof manifest.settings === "object" ? manifest.settings : {};
  const out = { lang: s.lang || null, dir: s.dir || (s.lang ? dirFor(s.lang) : null) };
  for (const k of ["radar", "competitors", "crm", "media"]) out[k] = { ...DEFAULT_SETTINGS[k], ...(s[k] || {}) };
  return out;
}

const ID_RE = /^[a-z][a-z0-9-]{1,30}$/;
// "api" and "_next" collide with routes. "zz-canary" is the throwaway tenant verify-tenants.mjs
// scaffolds to attack FROM: reserving it means a human can never create one, and a leftover from a
// crashed verification run can never be mistaken for a live business. "brain" is the optional owner
// vault (/brain, /api/brain and its agent's pseudo-tenant id): a real tenant by that name would shadow
// the page and share the agent's identity. Keep it reserved even if the vault isn't built.
const RESERVED = new Set(["api", "_next", "zz-canary", "brain"]);
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export const isValidId = (id) => typeof id === "string" && ID_RE.test(id) && !RESERVED.has(id);

export function validateManifest(obj, folderName) {
  const errors = [];
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ok: false, errors: ["tenant.json must be a JSON object"] };
  if (obj.schema_version !== SCHEMA_VERSION) errors.push(`schema_version: must be ${SCHEMA_VERSION}`);
  if (!isValidId(obj.id)) errors.push(`id: must match ${ID_RE} and not be reserved (${[...RESERVED].join(", ")})`);
  else if (obj.id !== folderName) errors.push(`id: "${obj.id}" must match the folder name "${folderName}"`);
  if (typeof obj.name !== "string" || !obj.name.trim()) errors.push("name: required");
  if (!TENANT_KINDS.includes(obj.kind)) errors.push(`kind: must be one of ${TENANT_KINDS.join("|")}`);
  if (!HEX_RE.test(obj.accent || "")) errors.push("accent: must be a 6-digit hex colour like #7c3aed");
  if (!Number.isInteger(obj.order)) errors.push("order: must be an integer");
  const list = (key, vocab) => {
    if (!Array.isArray(obj[key]) || obj[key].length === 0) { errors.push(`${key}: must be a non-empty array`); return; }
    const unknown = obj[key].filter((v) => !vocab.includes(v));
    if (unknown.length) errors.push(`${key}: unknown ${unknown.map((v) => `"${v}"`).join(", ")} (valid: ${vocab.join(", ")})`);
  };
  list("modules", MODULE_IDS);
  list("formats", OUTPUT_FORMATS);
  list("engines", ENGINES);
  errors.push(...validateSettings(obj.settings));
  return { ok: errors.length === 0, errors };
}

/** Derived, never stored: one source of truth, so the status cannot drift from the files. */
export function brandStatus(tenantRootAbs) {
  if (existsSync(join(tenantRootAbs, "brand", "strategy.json"))) return "approved";
  if (existsSync(join(tenantRootAbs, "brand", "strategy.draft.json"))) return "draft";
  return "missing";
}

/** statSync throws on a dangling symlink; one bad entry must not hide every healthy tenant. */
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

function readOne(repoRoot, folder) {
  const root = join(repoRoot, TENANTS_DIR, folder);
  const base = { id: folder, root, manifest: null, errors: [], brand_status: brandStatus(root) };
  let text;
  try { text = readFileSync(join(root, "tenant.json"), "utf-8"); }
  catch { return { ...base, errors: ["tenant.json is missing"] }; }
  let obj;
  try { obj = JSON.parse(text); }
  catch (e) { return { ...base, errors: [`tenant.json is not valid JSON: ${e.message}`] }; }
  const v = validateManifest(obj, folder);
  return v.ok ? { ...base, manifest: obj } : { ...base, errors: v.errors };
}

/** Every folder under tenants/: valid ones first by `order` then id, broken ones last by name (with their errors). */
export function listTenants(repoRoot) {
  let folders = [];
  try {
    folders = readdirSync(join(repoRoot, TENANTS_DIR))
      // Reserved names are never tenants: zz-canary is the isolation test's temporary attacker and must
      // not flash up in the picker as a broken card while that test runs.
      .filter((f) => !f.startsWith(".") && !RESERVED.has(f) && isDir(join(repoRoot, TENANTS_DIR, f)));
  } catch { return []; }
  const all = folders.map((f) => readOne(repoRoot, f));
  const ok = all.filter((t) => t.manifest).sort((a, b) => a.manifest.order - b.manifest.order || a.id.localeCompare(b.id));
  const broken = all.filter((t) => !t.manifest).sort((a, b) => a.id.localeCompare(b.id));
  return [...ok, ...broken];
}

/** A usable tenant, or null when the id is invalid, unknown, OR its manifest is broken. */
export function getTenant(repoRoot, id) {
  if (!isValidId(id)) return null;
  return listTenants(repoRoot).find((t) => t.id === id && t.manifest) ?? null;
}

/**
 * Absolute tenant root. The id is matched against the DISCOVERED list; it is never joined into a path
 * raw. That match is the path-traversal guard.
 */
export function tenantRoot(repoRoot, id) {
  const t = getTenant(repoRoot, id);
  if (!t) throw new Error("unknown tenant");
  return t.root;
}

/** Minimal .env parser: skips comments and blanks, strips surrounding quotes. */
export function parseEnv(text) {
  const out = {};
  for (const raw of String(text).split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/**
 * Keys bound to ONE business's own accounts. They come ONLY from that tenant's .env.local and are
 * never inherited from the engine env. Inheriting them once made every company tenant read the owner's
 * own social audience as its own (and feed it to its agent through the strategy block).
 * EDIT: add any other per-business account key the interview produced (a booking tool, a shop API…).
 */
export const ACCOUNT_KEYS = [
  "META_ACCESS_TOKEN", "INSTAGRAM_ACCOUNT_ID", "FACEBOOK_PAGE_ID", "META_APP_ID", "META_APP_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN", "YOUTUBE_CHANNEL_ID", "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET",
  "YOUTUBE_REFRESH_TOKEN", "BLOTATO_API_KEY", "CAL_API_KEY",
];

/**
 * The env a ROUTE uses for this tenant. The tenant's own .env.local wins; the engine's env supplies only
 * SHARED keys (OPENAI_API_KEY, YOUTUBE_API_KEY, APIFY_TOKEN, BUFFER_API_KEY, CLOUDINARY_URL…). The
 * engine's Meta token is passed under ENGINE_* names so a route can look up PUBLIC competitor accounts
 * with it (business discovery), never as this tenant's own account.
 * Spawned agents NEVER get this env: they get agentEnv() from agent-flags.mjs.
 */
export function tenantEnv(repoRoot, id) {
  const root = tenantRoot(repoRoot, id);
  let own = {};
  try { own = parseEnv(readFileSync(join(root, ".env.local"), "utf-8")); } catch { /* no tenant env yet */ }
  const shared = { ...process.env };
  for (const k of ACCOUNT_KEYS) delete shared[k];
  const lookup = {
    ENGINE_META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN || "",
    ENGINE_INSTAGRAM_ACCOUNT_ID: process.env.INSTAGRAM_ACCOUNT_ID || "",
  };
  return { ...shared, ...lookup, ...own };
}
