#!/usr/bin/env node
// sync-tenant.mjs — bring existing tenants up to date with the ENGINE's copies of what new-tenant wrote.
//
// COPY TO: engine/tools/sync-tenant.mjs (unchanged).
//
//   node engine/tools/sync-tenant.mjs --tenant <id> [--dry-run]
//   node engine/tools/sync-tenant.mjs --all [--dry-run]
//
// WHY THIS EXISTS. new-tenant.mjs copies engine/skills/tenant/* and writes .claude/settings.json at
// creation time. Tenants are created in Stage 1, the builder skills are written in Stage 5, and
// PUBLISH_ASK is finalised in Stage 2, so without this tool every tenant made during the build silently
// generates WITHOUT its builder skills and keeps the example ask list forever. No agent can fix that
// itself: .claude/** is write-denied to every agent. Run this:
//   • at the end of Stage 2 (PUBLISH_ASK), at the end of Stage 5 (skills), and
//   • after ANY edit to engine/skills/tenant/*, PUBLISH_ASK, CONFINEMENT_DENY or ADVISORY_LINT.
//
// What it does, per tenant (and nothing else):
//   1. re-copies every skill folder of engine/skills/tenant/ into .claude/skills/ (a skill folder the
//      owner added by hand, under another name, is left alone);
//   2. rewrites .claude/settings.json from tenantSettings(): the engine's deny + ask, PLUS any extra deny
//      or ask entries the owner added by hand (restrictions are kept). It DROPS an `allow` list, any hook
//      that does not point into engine/tools/hooks/, and every other key (env, model…), and says so:
//      spawned agents load this file, so each of those could widen what an agent can do;
//   3. refreshes AGENTS.md when it is a generated copy (systems that refuse symlinks);
//   4. re-creates content/node_modules when it is missing or dangling.
// It never touches brand/, content/ data, memory/, .env.local or tenant.json.

import { readFileSync, writeFileSync, lstatSync, existsSync, rmSync, realpathSync, readdirSync, cpSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { listTenants, getTenant } from "../app/src/lib/tenant.mjs";
import { tenantSettings, linkNodeModules, AGENTS_COPY_HEADER } from "./new-tenant.mjs";

/** A digest of a directory tree (paths + bytes), "" when it does not exist. */
function treeHash(dir) {
  if (!existsSync(dir)) return "";
  const h = createHash("sha256");
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) { h.update(relative(dir, p)); h.update("\0"); h.update(readFileSync(p)); h.update("\0"); }
    }
  };
  walk(dir);
  return h.digest("hex");
}

/** The engine skill folders whose tenant copy is missing or differs. */
function staleSkills(repoRoot, root) {
  const src = join(repoRoot, "engine", "skills", "tenant");
  if (!existsSync(src)) return { src, names: [], stale: [] };
  const names = readdirSync(src, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith(".")).map((d) => d.name);
  return { src, names, stale: names.filter((n) => treeHash(join(src, n)) !== treeHash(join(root, ".claude", "skills", n))) };
}

const ENGINE_HOOK = /engine\/tools\/hooks\/[\w.-]+\.mjs/;

/** Every hook command in a settings object, as strings. */
function hookCommands(settings) {
  const out = [];
  for (const groups of Object.values(settings?.hooks || {})) {
    for (const g of Array.isArray(groups) ? groups : []) for (const h of g?.hooks || []) out.push(String(h?.command ?? ""));
  }
  return out;
}

/** The settings this tenant should have: the engine's, plus the owner's own extra restrictions. */
export function mergedSettings(existing) {
  const want = tenantSettings();
  const notes = [];
  const extraDeny = (existing?.permissions?.deny || []).filter((r) => !want.permissions.deny.includes(r));
  const extraAsk = (existing?.permissions?.ask || []).filter((r) => !want.permissions.ask.includes(r));
  want.permissions.deny.push(...extraDeny);
  want.permissions.ask.push(...extraAsk);
  if (existing?.permissions?.allow?.length) notes.push(`dropped an allow list (${existing.permissions.allow.join(", ")})`);
  const foreign = hookCommands(existing).filter((c) => !ENGINE_HOOK.test(c));
  if (foreign.length) notes.push(`dropped hooks outside engine/tools/hooks/: ${foreign.join(" | ")}`);
  // Any other key (env, model, MCP switches…) is loaded into every SPAWNED agent through
  // --setting-sources project, so it is engine business, not tenant business: dropped, and reported.
  const other = Object.keys(existing || {}).filter((k) => !["$schema", "permissions", "hooks"].includes(k));
  if (other.length) notes.push(`dropped keys: ${other.join(", ")}`);
  return { settings: want, notes };
}

export function syncTenant(repoRoot, t, { dryRun = false } = {}) {
  const report = [];
  const root = t.root;
  // 1. skills
  const { src, names, stale } = staleSkills(repoRoot, root);
  if (!names.length) report.push("skills: engine/skills/tenant is empty or missing");
  else if (!stale.length) report.push("skills: up to date");
  else {
    if (!dryRun) for (const n of stale) {
      const dest = join(root, ".claude", "skills", n);
      rmSync(dest, { recursive: true, force: true });
      cpSync(join(src, n), dest, { recursive: true });
    }
    report.push(`skills: ${dryRun ? "would re-copy" : "re-copied"} ${stale.join(", ")}`);
  }
  // 2. settings
  const sp = join(root, ".claude", "settings.json");
  let existing = null;
  try { existing = JSON.parse(readFileSync(sp, "utf-8")); } catch { report.push("settings: missing or unreadable → rewritten"); }
  const { settings, notes } = mergedSettings(existing);
  const next = JSON.stringify(settings, null, 2) + "\n";
  const prev = existsSync(sp) ? readFileSync(sp, "utf-8") : "";
  if (next !== prev) { if (!dryRun) writeFileSync(sp, next); report.push(`settings: ${dryRun ? "would update" : "updated"}${notes.length ? ` (${notes.join("; ")})` : ""}`); }
  else report.push("settings: up to date");
  // 3. AGENTS.md copy
  const agents = join(root, "AGENTS.md");
  try {
    if (!lstatSync(agents).isSymbolicLink()) {
      const body = AGENTS_COPY_HEADER + readFileSync(join(root, "CLAUDE.md"), "utf-8");
      if (readFileSync(agents, "utf-8") !== body) { if (!dryRun) writeFileSync(agents, body); report.push("AGENTS.md: copy refreshed"); }
    }
  } catch { report.push("AGENTS.md: missing (run new-tenant's linkAgentsMd or create it by hand)"); }
  // 4. node_modules link
  const nm = join(root, "content", "node_modules");
  let ok = false;
  try { realpathSync(nm); ok = true; } catch { ok = false; }   // missing or dangling
  if (!ok) {
    if (!dryRun) { rmSync(nm, { recursive: true, force: true }); linkNodeModules(repoRoot, root); }
    report.push(`content/node_modules: ${dryRun ? "would re-link" : "re-linked"}`);
  }
  return report;
}

function main() {
  const argv = process.argv.slice(2);
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const dryRun = argv.includes("--dry-run");
  let targets;
  if (argv.includes("--all")) targets = listTenants(repoRoot).filter((t) => t.manifest);
  else {
    const i = argv.indexOf("--tenant");
    const id = i > -1 ? argv[i + 1] : undefined;
    const t = id ? getTenant(repoRoot, id) : null;
    if (!t) {
      const known = listTenants(repoRoot).filter((x) => x.manifest).map((x) => x.id).join(", ");
      console.error(`✗ ${id ? `unknown tenant "${id}"` : "--tenant <id> or --all is required"} (tenants: ${known || "none"})`);
      process.exit(1);
    }
    targets = [t];
  }
  for (const t of targets) {
    console.log(`${t.id}`);
    for (const line of syncTenant(repoRoot, t, { dryRun })) console.log(`  · ${line}`);
  }
}

const invoked = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) main();
