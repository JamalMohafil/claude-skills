#!/usr/bin/env node
// new-tenant.mjs — scaffold a valid, empty, gated tenant (all or nothing).
//
// COPY TO: engine/tools/new-tenant.mjs (unchanged; edit only the lines marked EDIT:).
// It imports tenant.mjs AND agent-flags.mjs, so copy every asset before running it (Stage 1).
//
// Usage:
//   node engine/tools/new-tenant.mjs <id> --name "<Name>" --kind <creator|company>
//        [--accent #7c3aed] [--order 9] [--modules a,b,c] [--formats a,b] [--engines html,image-model]
//        [--lang <bcp47>] [--settings '<json>'] [--root <repoRoot>]
//   node engine/tools/new-tenant.mjs <new-id> --from <source-id> [--name "<Name>"]   # a TEST COPY
//
// Creates tenants/<id>/ with a manifest tenant.mjs accepts, an empty idea store, the memory index and
// folders, a confining .claude/settings.json, the engine's tenant skills, a Routing-Map CLAUDE.md
// (+ AGENTS.md → CLAUDE.md), and the content/node_modules link the exporter resolves through.
// It NEVER writes a brand kit: brand/ stays empty, so the tenant starts gated (brand status "missing")
// until a draft is approved in the strategy view.
//
// --from <source-id> makes a throwaway TEST COPY for checkpoints: the source's manifest (new id, name
// "<source> (test copy)") plus a copy of its brand/ and library/. It never copies .env.local (the
// business's own keys), content/ (chats, ideas, publishing records) or memory/. Delete the copy with
// `rm -rf tenants/<new-id>` when the checkpoint is done.
//
// WINDOWS: creating a symlink needs Developer Mode or admin rights there. When a symlink is refused,
// AGENTS.md becomes a generated COPY of CLAUDE.md (sync-tenant.mjs refreshes it) and node_modules
// becomes a directory JUNCTION (no admin needed; junctions take an absolute target).

import { mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, rmSync, realpathSync, cpSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifest, isValidId, getTenant, SCHEMA_VERSION } from "../app/src/lib/tenant.mjs";
import { PUBLISH_ASK, CONFINEMENT_DENY } from "../app/src/lib/agent-flags.mjs";

// EDIT: defaults per kind. The interview usually passes --modules/--formats/--engines explicitly.
export const CREATOR_MODULES = [
  "home", "strategy", "ideas", "radar", "search", "carousels", "stories", "presentations", "scripts",
  "gallery", "analytics", "inspiration", "calendar", "assistant", "terminal", "settings",
];
export const COMPANY_MODULES = [
  "home", "strategy", "ideas", "radar", "search", "library", "carousels", "stories",
  "gallery", "inspiration", "calendar", "assistant", "settings",
];
// Only formats reference 6 fully specifies by default. `thumbnail` needs extra work (reference 6, the
// format table) and stays off unless the owner asks for it.
export const CREATOR_FORMATS = ["carousel", "story", "presentation", "script"];
export const COMPANY_FORMATS = ["carousel", "single-post", "story", "reel-idea"];

export const MEMORY_DIRS = ["rules", "people", "decisions", "projects", "lessons", "notes"];

/**
 * EDIT: true wires the optional ADVISORY content lint (reference 3 §4) into every tenant's settings: a
 * PostToolUse hook that runs the ENGINE-owned engine/tools/hooks/content-lint.mjs after each Write/Edit.
 * It never blocks. Leave false until that file exists. sync-tenant.mjs applies a change to every tenant.
 */
export const ADVISORY_LINT = false;
export const LINT_COMMAND = 'node "$CLAUDE_PROJECT_DIR/../../engine/tools/hooks/content-lint.mjs"';

/**
 * The settings every tenant starts with: DEFENCE IN DEPTH, not the boundary. The real confinement is
 * serialised inline into --settings by agent-flags.mjs. This file governs the OWNER's hand-run agent
 * inside the tenant folder, so it carries the same deny list.
 * ⭐ NO `allow` list: allow rules here would only widen a hand-run session, and a shell allow rule in this
 * file is exactly how a cross-tenant leak was once proven.
 * The only hook ever written here points INTO engine/tools/hooks/ (engine-owned, outside every tenant);
 * verify-tenants.mjs fails any other hook command.
 */
export function tenantSettings({ lint = ADVISORY_LINT } = {}) {
  const s = {
    $schema: "https://json.schemastore.org/claude-code-settings.json",
    permissions: { deny: [...CONFINEMENT_DENY], ask: [...PUBLISH_ASK] },
  };
  if (lint) {
    s.hooks = { PostToolUse: [{ matcher: "Write|Edit|MultiEdit", hooks: [{ type: "command", command: LINT_COMMAND }] }] };
  }
  return s;
}

/** A language code as a readable name ("ar" → "Arabic"); the code itself when the runtime has no ICU data. */
export function languageName(code) {
  if (!code) return "";
  try { return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code; } catch { return code; }
}

/**
 * The tenant's law. It is NEUTRAL about the kit's state on purpose: it is written once, before any kit
 * exists, and no agent may edit it afterwards, so it must stay true after the owner approves a kit in
 * the app. The kit itself (brand/strategy.json) is read fresh on every request.
 */
export function tenantLaw(manifest, lang) {
  const publishing = lang ? `${languageName(lang)} (\`${lang}\`)` : "the language set in tenant.json `settings.lang`";
  return `# ${manifest.name}

> \`AGENTS.md\` is a symlink to this file (or, where symlinks are refused, a generated copy). Edit CLAUDE.md only.

You are the content agent for ${manifest.name} only. You know nothing about any other business. If asked
about another business, say plainly that you have no information about it here.

## What it is
The approved brand kit is \`brand/strategy.json\`: read it before any piece. If it does not exist, the kit is not
approved yet. A draft may be waiting in \`brand/strategy.draft.json\`; never treat a draft as approved.

## Hard rules
- Never invent products, prices, numbers, clients, results or personal habits.
- The kit's \`no_gos.hard\` are hard rules too, under any framing.

## Brand kit
\`brand/strategy.json\` is law once approved. Until then it is a draft that only the owner can approve in the
strategy view. You never write either file.

## Core operating rules
- Read the Routing Map and open only what the task needs.
- Glob and Grep: ALWAYS pass an explicit \`path\`. A path-less Glob returns "No files found" even when files exist.
- Write this business's content in ${publishing}. Talk to the owner in the owner's own language.
- Engine-owned files are read-only for you: content/ideas.json, content/chats.json, the brand kit and draft,
  content/planning/{publishing,scheduled,published}.json, work/crm/**, CLAUDE.md, AGENTS.md, .claude/**.
- You have no shell. The engine exports and renders after you finish.

## Routing Map
| Need | Path | Rule |
|---|---|---|
| Brand law | \`brand/strategy.json\` · the draft files | read before ANY piece; never write it |
| Brand docs, templates | \`brand/*.md\` · \`brand/templates/*.html\` · \`brand/*-rules.md\` | a design change = the template AND the rules file |
| Ideas | \`content/ideas.json\` | change only through the chat's idea action |
| Made pieces | \`content/<collection>/<slug>/\` | the engine exports; never run a command |
| Calendar, publishing | \`content/planning/*.json\` | publishing is the owner's click |
| Competitors, transcripts | \`content/analytics/*.json\` · \`research/competitors/covered.json\` | huge: Grep, never Read whole |
| Radar | \`research/radar/\` | the engine writes feed.md and verifies every idea |
| Memory | \`memory/MEMORY.md\` → \`memory/{${MEMORY_DIRS.join(",")}}/\` | one file per topic + one index line; rules/ always loaded |
| Partners | \`work/partners/<slug>.md\` | only what the owner said |
| Products | \`library/products/<slug>/product.json\` + photos | a product not here does not exist |
| Skills | \`.claude/skills/<skill>/SKILL.md\` | read the skill before its task; read-only |
`;
}

const MEMORY_INDEX = (name) => `# Memory index — ${name}
One line per memory file: \`- [title](folder/file.md) — what it says\`. rules/ is always loaded.
`;

/** The header a generated AGENTS.md copy starts with (sync-tenant.mjs recognises it). */
export const AGENTS_COPY_HEADER = "<!-- GENERATED COPY of CLAUDE.md: this system refused a symlink. Edit CLAUDE.md, then run sync-tenant.mjs. -->\n";

const REFUSED = new Set(["EPERM", "EACCES", "ENOTSUP", "EINVAL", "UNKNOWN"]);

/**
 * AGENTS.md → CLAUDE.md. A symlink where the OS allows one; otherwise a generated copy.
 * `link` is injectable so both paths are testable.
 */
export function linkAgentsMd(root, { link = symlinkSync, platform = process.platform } = {}) {
  const target = join(root, "AGENTS.md");
  try { link("CLAUDE.md", target); return "symlink"; }
  catch (e) {
    if (!(platform === "win32" || REFUSED.has(e?.code))) throw e;
    writeFileSync(target, AGENTS_COPY_HEADER + readFileSync(join(root, "CLAUDE.md"), "utf-8"));
    return "copy";
  }
}

/**
 * content/node_modules → engine/app/node_modules. Relative on purpose (the repo must keep working when it
 * is moved or cloned). On Windows a directory JUNCTION with an absolute target, which needs no admin
 * rights; the junction must be re-created after the repo moves (sync-tenant.mjs does it).
 */
export function linkNodeModules(repoRoot, root, { link = symlinkSync, platform = process.platform } = {}) {
  const target = join(root, "content", "node_modules");
  if (platform === "win32") { link(resolve(repoRoot, "engine", "app", "node_modules"), target, "junction"); return "junction"; }
  try { link("../../../engine/app/node_modules", target, "dir"); return "symlink"; }
  catch (e) {
    if (!REFUSED.has(e?.code)) throw e;
    link(resolve(repoRoot, "engine", "app", "node_modules"), target, "junction");
    return "junction";
  }
}

/** Copy the engine's generic tenant skills into <root>/.claude/skills (replacing those skill folders only). */
export function copyEngineSkills(repoRoot, root) {
  const src = join(repoRoot, "engine", "skills", "tenant");
  if (!existsSync(src)) return [];
  const names = readdirSync(src, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith(".")).map((d) => d.name);
  for (const n of names) {
    const dest = join(root, ".claude", "skills", n);
    rmSync(dest, { recursive: true, force: true });
    cpSync(join(src, n), dest, { recursive: true });
  }
  return names;
}

/**
 * Create tenants/<id>/ on disk — all or nothing. If any step throws, the half-built folder is removed
 * before the error propagates; otherwise a retry would die on "already exists" and the only way out would
 * be a manual rm -rf. `link` and `platform` are injectable so the rollback and the Windows fallback are testable.
 * `copyFrom` (an absolute tenant root) copies that tenant's brand/ and library/ in: the test-copy path.
 */
export function scaffoldTenant(repoRoot, manifest, { link = symlinkSync, platform = process.platform, lang, copyFrom } = {}) {
  const root = join(repoRoot, "tenants", manifest.id);
  if (existsSync(root)) throw new Error(`tenants/${manifest.id}/ already exists`);
  try {
    const dirs = ["brand", "content", "research/radar/runs", "research/radar/failed", "research/competitors",
      "library", "work", ".claude/skills", ...MEMORY_DIRS.map((d) => `memory/${d}`)];
    for (const d of dirs) mkdirSync(join(root, d), { recursive: true });
    for (const d of ["brand", "library", "work", "research/radar/runs", "research/radar/failed", "research/competitors",
      ...MEMORY_DIRS.map((d) => `memory/${d}`)]) writeFileSync(join(root, d, ".gitkeep"), "");
    writeFileSync(join(root, "tenant.json"), JSON.stringify(manifest, null, 2) + "\n");
    writeFileSync(join(root, "content", "ideas.json"), JSON.stringify({ version: 1, updated_at: null, ideas: [] }, null, 2) + "\n");
    writeFileSync(join(root, "memory", "MEMORY.md"), MEMORY_INDEX(manifest.name));
    writeFileSync(join(root, ".claude", "settings.json"), JSON.stringify(tenantSettings(), null, 2) + "\n");
    writeFileSync(join(root, "CLAUDE.md"), tenantLaw(manifest, lang ?? manifest.settings?.lang));
    linkAgentsMd(root, { link, platform });
    // The generic builder skills every business starts with (read-only to agents; the owner may restyle).
    copyEngineSkills(repoRoot, root);
    linkNodeModules(repoRoot, root, { link, platform });
    if (copyFrom) {
      // A test copy: the brand and the products, never the keys, the chats, the ideas or the publishing log.
      const skipSecrets = (src) => !/(^|[\\/])\.env[^\\/]*$/.test(src);
      for (const d of ["brand", "library"]) {
        if (existsSync(join(copyFrom, d))) cpSync(join(copyFrom, d), join(root, d), { recursive: true, filter: skipSecrets });
      }
    }
  } catch (e) {
    rmSync(root, { recursive: true, force: true });
    throw e;
  }
  return root;
}

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

function main() {
  const argv = process.argv.slice(2);
  const id = argv[0];
  const flag = (name, dflt) => {
    const i = argv.indexOf(`--${name}`);
    if (i === -1) return dflt;
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) die(`--${name} needs a value`);
    return v;
  };
  const csv = (name, dflt) => { const v = flag(name); return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : dflt; };
  const repoRoot = resolve(flag("root", join(dirname(fileURLToPath(import.meta.url)), "..", "..")));
  if (!isValidId(id)) die(`id "${id ?? ""}" is invalid — use lowercase a-z, 0-9, "-" (2-31 chars, starting with a letter), not a reserved word`);

  // --from: start from an existing tenant's manifest (a throwaway test copy)
  const fromId = flag("from");
  const source = fromId ? getTenant(repoRoot, fromId) : null;
  if (fromId && !source) die(`--from: unknown or broken tenant "${fromId}"`);
  const base = source?.manifest;

  let settings = base?.settings ? JSON.parse(JSON.stringify(base.settings)) : undefined;
  const settingsArg = flag("settings");
  if (settingsArg) {
    let extra; try { extra = JSON.parse(settingsArg); } catch (e) { die(`--settings is not valid JSON: ${e.message}`); }
    settings = { ...(settings || {}), ...extra };
  }
  const lang = flag("lang");
  if (lang) settings = { ...(settings || {}), lang };

  const kind = flag("kind", base?.kind);
  const creator = kind === "creator";
  const manifest = {
    schema_version: SCHEMA_VERSION,
    id,
    name: flag("name", base ? `${base.name} (test copy)` : ""),
    kind,
    accent: flag("accent", base?.accent ?? "#7c3aed"),
    order: Number.parseInt(flag("order", String(base ? base.order + 100 : 9)), 10),
    modules: csv("modules", base?.modules ?? (creator ? CREATOR_MODULES : COMPANY_MODULES)),
    formats: csv("formats", base?.formats ?? (creator ? CREATOR_FORMATS : COMPANY_FORMATS)),
    engines: csv("engines", base?.engines ?? ["html"]),
    ...(settings ? { settings } : {}),
  };
  const v = validateManifest(manifest, id);
  if (!v.ok) die(`manifest invalid:\n  - ${v.errors.join("\n  - ")}`);

  try { scaffoldTenant(repoRoot, manifest, { lang: settings?.lang, copyFrom: source?.root }); } catch (e) { die(e.message); }
  const status = source && existsSync(join(repoRoot, "tenants", id, "brand", "strategy.json")) ? "approved (copied)" : source && existsSync(join(repoRoot, "tenants", id, "brand", "strategy.draft.json")) ? "draft (copied)" : "missing";
  console.log(`✓ tenants/${id}/ created (${manifest.kind}, brand status: ${status})${source ? ` — a TEST COPY of ${fromId}: remove it with rm -rf tenants/${id}` : ""}`);
}

// Importable for its helpers without running the CLI. realpath on purpose: run through a symlink, argv[1]
// is the link while import.meta.url is the real file, and comparing them raw made the tool exit 0 having
// done nothing.
const invoked = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) main();
