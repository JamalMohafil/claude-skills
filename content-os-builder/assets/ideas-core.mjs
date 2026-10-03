// ideas-core.mjs — the persistent idea store: tenants/<id>/content/ideas.json.
//
// COPY TO: engine/app/src/lib/ideas-core.mjs (unchanged). Imports ./strategy-core.mjs (readStrategy,
// which you write from reference 4 §3) and ./shapes.mjs (an asset). Reference 4 §9–§10 explains it.
//
// content/ideas.json is the AUTHORITATIVE store of actionable ideas. Markdown logs (research/radar/feed.md
// and the like) are human-readable records and are never scraped to build a view.
//
// Plain ESM, zero dependencies, so the exact same code backs the Next routes (/ideas, /radar, /generate,
// the chat's idea action) and the CLI tools (radar ingest, ideas.mjs, import-ideas.mjs).
//
// Design rules enforced here:
//   • stable crypto.randomUUID() ids — never positional, never derived from order
//   • every taxonomy reference validated against THIS tenant's brand/strategy.json (shapes included)
//   • atomic writes (temp file + rename) behind an in-process mutex on globalThis (survives dev HMR)
//   • reads never throw, but an UNPARSEABLE store is quarantined before any write: degrading to
//     "no ideas" and saving that is how a store gets erased
//   • deterministic dedup; a resurfaced idea updates its seen metadata, it is never deleted or overwritten
//   • two more axes text dedup cannot see: shape (the form) and core_lesson (shapes.mjs)
//   • NO AI calls anywhere in this module

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { readStrategy } from "./strategy-core.mjs";
import { normalizeLesson, findShapeSaturation, findLessonSaturation } from "./shapes.mjs";

export const IDEAS_PATH = join("content", "ideas.json");
export const STORE_VERSION = 1;

export const IDEA_STATUSES = ["new", "reviewing", "approved", "rejected", "produced", "archived"];
export const SOURCE_TYPES = ["radar", "competitor", "manual", "analytics", "community", "legacy-import"];
export const TIMELINESS_LEVELS = ["evergreen", "timely", "urgent"];

/* ─────────────────────────── kit-backed taxonomy ─────────────────────────── */

/** The valid reference values, read fresh from brand/strategy.json. ok:false → every writer refuses (503). */
export function taxonomy(root) {
  const s = readStrategy(root);
  if (!s) return { ok: false, pillars: [], personas: [], funnel: [], associations: [], shapes: [], ctas: [], offers: [] };
  const ids = (list) => (Array.isArray(list) ? list : []).map((x) => x?.id).filter((x) => typeof x === "string" && x);
  return {
    ok: true,
    pillars: ids(s.pillars),
    personas: ids(s.personas),
    funnel: ids(s.funnel),
    associations: ids(s.brand_associations?.items),
    shapes: ids(s.shapes),
    // A CTA may be referenced by cta_library id or by an offer id (offers carry keywords).
    ctas: [...ids(s.cta_library), ...ids(s.offers)],
    offers: ids(s.offers),
  };
}

/* ─────────────────────────────── normalisation ──────────────────────────────── */

/**
 * Canonical form for duplicate detection. Deliberately aggressive and deterministic: NFKC, combining
 * marks stripped (accents, harakat, hamza seats), tatweel removed, Arabic letter variants folded,
 * zero-width and bidi marks removed, lowercased, punctuation and symbols → space, whitespace collapsed.
 * Both sides of every comparison go through it, so a fold that is too strong for one script stays
 * consistent rather than wrong.
 */
export function normalizeText(t) {
  return String(t || "")
    .normalize("NFKC")
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, "")
    .normalize("NFKD").replace(/[\p{M}ـ]/gu, "").normalize("NFC")
    .replace(/[آأإٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip tracking params, the hash, www. and a trailing slash, so the same link matches itself. */
export function normalizeUrl(u) {
  if (!u) return "";
  try {
    const url = new URL(String(u));
    url.hash = "";
    for (const k of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$|ref_src|si$)/i.test(k)) url.searchParams.delete(k);
    }
    return `${url.protocol}//${url.host.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}${url.search}`.toLowerCase();
  } catch { return String(u).trim().toLowerCase(); }
}

/** Content-word set for cheap Jaccard similarity (no AI). */
const contentWords = (n) => n.split(" ").filter((w) => w.length > 2);
export function similarity(aNorm, bNorm) {
  const A = new Set(contentWords(aNorm)), B = new Set(contentWords(bNorm));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/* ─────────────────────────────── store I/O ──────────────────────────────────── */

const emptyStore = () => ({ version: STORE_VERSION, updated_at: null, ideas: [] });

/**
 * DEGRADED marks an empty store standing in for a file that could not be parsed, as opposed to one
 * standing in for a file that isn't there yet. Non-enumerable, because the store is spread and
 * JSON-serialised by routes and tools: a stray `__degraded: true` inside ideas.json would be its own bug.
 */
const DEGRADED = "__degraded";
const markDegraded = (store) => Object.defineProperty(store, DEGRADED, { value: true, enumerable: false, configurable: true });
export const isDegraded = (store) => store?.[DEGRADED] === true;

/**
 * Never throws. But "no file" and "unparseable file" are different states and must not both come back
 * as a plain empty store: the caller writes that store back, so conflating them turns one truncated
 * write into a permanent loss of every idea.
 */
export function readIdeas(root) {
  const p = join(root, IDEAS_PATH);
  let text;
  try { text = readFileSync(p, "utf-8"); }
  catch (e) { return e?.code === "ENOENT" ? emptyStore() : markDegraded(emptyStore()); }   // EACCES, EISDIR: bytes exist
  try {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.ideas)) throw new Error("bad store shape");
    return { version: raw.version ?? STORE_VERSION, updated_at: raw.updated_at ?? null, ideas: raw.ideas };
  } catch { return markDegraded(emptyStore()); }
}

/**
 * Move an unparseable store aside rather than letting the next write flatten it. A rename that cannot
 * be performed is fatal on purpose: continuing would destroy exactly the data this exists to save.
 * ENOENT alone is benign (the file vanished between the read and the write).
 */
function quarantineCorrupt(p) {
  try { renameSync(p, `${p}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`); }
  catch (e) { if (e?.code !== "ENOENT") throw e; }
}

/**
 * Atomic write: a temp file in the same directory, renamed over the target. rename(2) is atomic within a
 * filesystem, so a reader sees the whole old file or the whole new one, never a truncated store.
 * The quarantine guard lives HERE, not in withStore(), so a tool that pairs readIdeas() with this
 * function directly is protected too.
 */
export function writeIdeasAtomic(root, store) {
  const p = join(root, IDEAS_PATH);
  if (isDegraded(store)) {
    quarantineCorrupt(p);
    delete store[DEGRADED];   // salvaged: a later write of this same store must not re-quarantine
  }
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  const payload = { version: STORE_VERSION, updated_at: new Date().toISOString(), ideas: store.ideas };
  try {
    writeFileSync(tmp, JSON.stringify(payload, null, 2) + "\n", "utf-8");
    renameSync(tmp, p);
  } catch (e) {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* best effort */ }
    throw e;
  }
  return payload;
}

/**
 * Serialise read-modify-write so two near-simultaneous requests cannot clobber each other. One Node
 * process serves every tenant, so an in-process promise chain on globalThis is enough (no lockfile).
 * `fn` mutates store.ideas; return { __noWrite: true, … } to skip the write.
 */
const g = globalThis;
if (!g.__ideasMutex) g.__ideasMutex = Promise.resolve();
export function withStore(root, fn) {
  const run = g.__ideasMutex.then(async () => {
    const store = readIdeas(root);
    const result = await fn(store);
    if (result?.__noWrite !== true) writeIdeasAtomic(root, store);
    return result;
  });
  g.__ideasMutex = run.then(() => undefined, () => undefined);   // keep the chain alive on rejection
  return run;
}

/* ─────────────────────────────── validation ─────────────────────────────────── */

/**
 * Validate and normalise an incoming idea. Unknown taxonomy references are REJECTED (strict: radar
 * ingest, manual POST/PATCH) or DROPPED WITH A WARNING (soft: the chat agent's add, a one-time import),
 * never silently invented.
 * @returns {{ok:true, value:object, warnings:string[]} | {ok:false, errors:string[], warnings:string[]}}
 */
export function validateIdea(input, tax, { partial = false, soft = false } = {}) {
  const errors = [], warnings = [];
  const out = {};
  const has = (k) => input[k] !== undefined && input[k] !== null;

  if (!partial || has("text")) {
    const text = String(input.text ?? "").trim();
    if (text.length < 8) errors.push("text: must be at least 8 characters");
    else if (text.length > 600) errors.push("text: must be at most 600 characters");
    else out.text = text;
  }

  if (!partial || has("source")) {
    const src = input.source || {};
    const type = String(src.type ?? "manual");
    if (!SOURCE_TYPES.includes(type)) errors.push(`source.type: must be one of ${SOURCE_TYPES.join("|")}`);
    out.source = {
      type,
      ...(src.url ? { url: String(src.url).slice(0, 2000) } : {}),
      ...(src.title ? { title: String(src.title).slice(0, 300) } : {}),
      ...(src.competitor_id ? { competitor_id: String(src.competitor_id).slice(0, 120) } : {}),
      ...(src.radar_run_id ? { radar_run_id: String(src.radar_run_id).slice(0, 60) } : {}),
    };
  }

  // ---- kit-backed references ----
  const ref = (key, value, valid, label) => {
    if (value === undefined || value === null || value === "") return undefined;
    const v = String(value);
    if (valid.includes(v)) return v;
    const msg = `${key}: unknown ${label} "${v}" (valid: ${valid.join(", ") || "none — the brand kit is unreadable"})`;
    if (soft) { warnings.push(msg); return undefined; }
    errors.push(msg); return undefined;
  };

  if (!partial || has("pillar_id")) out.pillar_id = ref("pillar_id", input.pillar_id, tax.pillars, "pillar");
  if (!partial || has("funnel_stage")) out.funnel_stage = ref("funnel_stage", input.funnel_stage, tax.funnel, "funnel stage");
  if (!partial || has("suggested_cta_id")) out.suggested_cta_id = ref("suggested_cta_id", input.suggested_cta_id, tax.ctas, "CTA/offer");
  if (!partial || has("offer_id")) out.offer_id = ref("offer_id", input.offer_id, tax.offers, "offer");
  // the FORM the idea takes (anti-repetition axis 1): the kit's own vocabulary, never invented
  if (!partial || has("shape_id")) out.shape_id = ref("shape_id", input.shape_id, tax.shapes || [], "shape");

  if (!partial || has("persona_ids")) {
    const arr = Array.isArray(input.persona_ids) ? input.persona_ids : [];
    out.persona_ids = arr.map((p) => ref("persona_ids", p, tax.personas, "persona")).filter(Boolean);
  }
  if (!partial || has("brand_associations")) {
    const arr = Array.isArray(input.brand_associations) ? input.brand_associations : [];
    out.brand_associations = arr.map((a) => ref("brand_associations", a, tax.associations, "brand association")).filter(Boolean);
  }
  // the ONE lesson the piece teaches, as a canonical key (anti-repetition axis 2)
  if (!partial || has("core_lesson")) out.core_lesson = normalizeLesson(input.core_lesson) || undefined;

  // ---- free-form strategic fields (length-clipped) ----
  if (!partial || has("angle")) out.angle = input.angle ? String(input.angle).slice(0, 1000) : undefined;
  if (!partial || has("suggested_hook")) out.suggested_hook = input.suggested_hook ? String(input.suggested_hook).slice(0, 500) : undefined;
  if (!partial || has("hook_source")) out.hook_source = input.hook_source ? String(input.hook_source).slice(0, 300) : undefined;
  if (!partial || has("competitor_precedent")) {
    const cp = input.competitor_precedent;
    out.competitor_precedent = cp && typeof cp === "object" ? {
      covered: cp.covered === true,
      who: cp.who ? String(cp.who).slice(0, 120) : null,
      date: cp.date ? String(cp.date).slice(0, 10) : null,
      performance: cp.performance ? String(cp.performance).slice(0, 120) : null,
      differentiator: cp.differentiator ? String(cp.differentiator).slice(0, 600) : null,
    } : undefined;
  }
  // the verified evidence behind a radar idea. Routes STRIP `grounding` from client input (POST/PATCH):
  // only the radar ingest passes it through, from the engine's verifier.
  if (!partial || has("grounding")) {
    const gr = input.grounding;
    out.grounding = gr && typeof gr === "object" ? {
      what_happened: gr.what_happened ? String(gr.what_happened).slice(0, 400) : null,
      why_it_matters: gr.why_it_matters ? String(gr.why_it_matters).slice(0, 400) : null,
      evidence: gr.evidence ? String(gr.evidence).slice(0, 400) : null,
      source_date: gr.source_date ? String(gr.source_date).slice(0, 10) : null,
      verified_at: gr.verified_at ? String(gr.verified_at).slice(0, 30) : null,
    } : undefined;
  }
  if (!partial || has("proof_assets")) out.proof_assets = (Array.isArray(input.proof_assets) ? input.proof_assets : []).map((s) => String(s).slice(0, 300)).slice(0, 12);
  if (!partial || has("rationale")) out.rationale = input.rationale ? String(input.rationale).slice(0, 1000) : undefined;

  if (!partial || has("timeliness")) {
    const t = input.timeliness;
    if (t && typeof t === "object") {
      const level = String(t.level ?? "evergreen");
      if (!TIMELINESS_LEVELS.includes(level)) errors.push(`timeliness.level: must be one of ${TIMELINESS_LEVELS.join("|")}`);
      else out.timeliness = {
        level,
        ...(t.expires_at ? { expires_at: String(t.expires_at).slice(0, 30) } : {}),
        ...(t.rationale ? { rationale: String(t.rationale).slice(0, 500) } : {}),
      };
    } else if (t !== undefined) out.timeliness = undefined;
  }

  if (has("status")) {
    const st = String(input.status);
    if (!IDEA_STATUSES.includes(st)) errors.push(`status: must be one of ${IDEA_STATUSES.join("|")}`);
    else out.status = st;
  }
  if (has("rejection_reason")) out.rejection_reason = String(input.rejection_reason).slice(0, 600);
  if (has("priority")) { const p = Number(input.priority); if (Number.isFinite(p)) out.priority = p; }

  // strip undefined so a PATCH merge never blanks an existing field
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];

  return errors.length ? { ok: false, errors, warnings } : { ok: true, value: out, warnings };
}

/**
 * What a ROUTE does to client input before validating: no client may claim a verified source, and on
 * PATCH provenance is not editable (a radar idea cannot be retyped as manual to dodge verification).
 */
export function stripClientFields(input, { patch = false } = {}) {
  const out = { ...(input || {}) };
  delete out.grounding;
  delete out.id; delete out.created_at; delete out.seen_count; delete out.additional_sources; delete out.produced_paths;
  if (patch) delete out.source;
  return out;
}

/* ─────────────────────────────── dedup ──────────────────────────────────────── */

/** Only recent, non-archived records are dedup candidates. Thresholds measured on a real corpus. */
const DEDUP_WINDOW_DAYS = 120;
const SIMILARITY_THRESHOLD = 0.82;   // same URL + near-identical text
const STRONG_SIMILARITY = 0.93;      // near-identical text on its own
// Paraphrase rule: the same idea logged twice, once as a short title and once as a longer one-line
// paraphrase with no URL. Measured: paraphrase pairs share 5–6 leading content words at similarity
// 0.63–0.82, while genuinely different ideas share none at 0.00, so this separates with a wide margin.
const PREFIX_WORDS = 5;
const PREFIX_SIMILARITY = 0.55;

function sharedLeadingWords(aNorm, bNorm) {
  const A = contentWords(aNorm), B = contentWords(bNorm);
  let i = 0;
  while (i < Math.min(A.length, B.length) && A[i] === B[i]) i++;
  return i;
}

/**
 * Deterministic duplicate detection, cheapest rule first:
 *  1. exact normalized text                              → "exact-normalized-text"
 *  2. same normalized source URL + similarity ≥ 0.82      → "same-url-similar-text"
 *  3. similarity ≥ 0.93 regardless of source              → "near-identical-text"
 *  4. similarity ≥ 0.55 + ≥ 5 shared leading content words → "shared-prefix-paraphrase"
 * REJECTED ideas are candidates on purpose, so a rejected idea never comes back as "new".
 */
export function findDuplicate(ideas, candidate, now = Date.now()) {
  const nText = normalizeText(candidate.text);
  const nUrl = normalizeUrl(candidate.source?.url);
  const cutoff = now - DEDUP_WINDOW_DAYS * 86400000;
  let best = null;
  for (const it of ideas) {
    if (it.status === "archived") continue;
    const ts = Date.parse(it.last_seen_at || it.created_at || "") || 0;
    if (ts && ts < cutoff) continue;
    const itText = normalizeText(it.text);
    if (itText === nText) return { idea: it, rule: "exact-normalized-text", score: 1 };
    const itUrl = normalizeUrl(it.source?.url);
    const sim = similarity(nText, itText);
    if (nUrl && itUrl && nUrl === itUrl && sim >= SIMILARITY_THRESHOLD) {
      if (!best || sim > best.score) best = { idea: it, rule: "same-url-similar-text", score: sim };
    } else if (sim >= STRONG_SIMILARITY) {
      if (!best || sim > best.score) best = { idea: it, rule: "near-identical-text", score: sim };
    } else if (sim >= PREFIX_SIMILARITY && sharedLeadingWords(nText, itText) >= PREFIX_WORDS) {
      if (!best || sim > best.score) best = { idea: it, rule: "shared-prefix-paraphrase", score: sim };
    }
  }
  return best;
}

/** Record that an existing idea was seen again. Never deletes, never overwrites. A rising seen_count is a signal. */
export function markResurfaced(existing, candidate, nowIso = new Date().toISOString()) {
  existing.seen_count = (existing.seen_count || 1) + 1;
  existing.last_seen_at = nowIso;
  const url = candidate.source?.url;
  if (url) {
    existing.additional_sources = existing.additional_sources || [];
    const seen = new Set(existing.additional_sources.map((s) => normalizeUrl(s.url)));
    if (normalizeUrl(url) !== normalizeUrl(existing.source?.url) && !seen.has(normalizeUrl(url))) {
      existing.additional_sources.push({
        type: candidate.source?.type || "radar", url,
        ...(candidate.source?.title ? { title: candidate.source.title } : {}),
        seen_at: nowIso,
      });
    }
  }
  return existing;
}

/* ─────────────────────────────── create ────────────────────────────────────── */

/** A full idea record. `score`/`score_details` are null on purpose: no scoring yet, never a fake one. */
export function makeIdea(validated, nowIso = new Date().toISOString()) {
  return {
    id: randomUUID(),
    text: validated.text,
    source: validated.source || { type: "manual" },
    pillar_id: validated.pillar_id,
    persona_ids: validated.persona_ids || [],
    funnel_stage: validated.funnel_stage,
    brand_associations: validated.brand_associations || [],
    shape_id: validated.shape_id,
    core_lesson: validated.core_lesson,
    angle: validated.angle,
    suggested_hook: validated.suggested_hook,
    hook_source: validated.hook_source,
    competitor_precedent: validated.competitor_precedent,
    grounding: validated.grounding,
    proof_assets: validated.proof_assets || [],
    suggested_cta_id: validated.suggested_cta_id,
    offer_id: validated.offer_id,
    timeliness: validated.timeliness,
    rationale: validated.rationale,
    status: validated.status || "new",
    score: null,
    score_details: null,
    seen_count: 1,
    last_seen_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
    ...(validated.priority !== undefined ? { priority: validated.priority } : {}),
  };
}

/**
 * Insert with dedup, then shape and lesson saturation.
 * Returns {inserted:true, idea} · {inserted:false, duplicate_of, rule, score, idea} (resurfaced) ·
 * or {inserted:false, saturated, rule, message} (refused: there is no record this duplicates, the
 * slot is simply full; `saturated` carries the count and examples for the owner).
 * {allowSaturated:true} is for a MANUAL add only: a human deliberately adding a 4th piece of a working
 * shape is legitimate. The radar and the chat agent never pass it.
 */
export function insertIdea(store, validated, nowIso = new Date().toISOString(), { allowSaturated = false } = {}) {
  const dup = findDuplicate(store.ideas, validated, Date.parse(nowIso) || Date.now());
  if (dup) {
    markResurfaced(dup.idea, validated, nowIso);
    dup.idea.updated_at = nowIso;
    return { inserted: false, duplicate_of: dup.idea.id, rule: dup.rule, score: dup.score, idea: dup.idea };
  }
  if (!allowSaturated) {
    const now = Date.parse(nowIso) || Date.now();
    const shape = findShapeSaturation(store.ideas, validated, { now });
    if (shape.saturated) return { inserted: false, saturated: shape, rule: shape.rule, message: shape.message };
    const lesson = findLessonSaturation(store.ideas, validated, { now });
    if (lesson.saturated) return { inserted: false, saturated: lesson, rule: lesson.rule, message: lesson.message };
  }
  const idea = makeIdea(validated, nowIso);
  store.ideas.push(idea);
  return { inserted: true, idea };
}

/* ─────────────────────────────── query ─────────────────────────────────────── */

/** priority desc, then created_at desc, then id: a total order, stable across restarts. */
export function sortIdeas(ideas) {
  return [...ideas].sort((a, b) => {
    const pa = typeof a.priority === "number" ? a.priority : 0;
    const pb = typeof b.priority === "number" ? b.priority : 0;
    if (pa !== pb) return pb - pa;
    const ta = Date.parse(a.created_at || "") || 0;
    const tb = Date.parse(b.created_at || "") || 0;
    if (ta !== tb) return tb - ta;
    return String(a.id).localeCompare(String(b.id));
  });
}

/** List filters are CSV; `q` matches normalized text. Archived ideas are hidden unless `status` asks for them. */
export function filterIdeas(ideas, f = {}) {
  const csv = (v) => (v ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : null);
  const status = csv(f.status), pillar = csv(f.pillar), persona = csv(f.persona), shape = csv(f.shape);
  const funnel = csv(f.funnel), source = csv(f.source), timeliness = csv(f.timeliness);
  const since = f.since ? Date.parse(f.since) : null;
  const until = f.until ? Date.parse(f.until) : null;
  const q = f.q ? normalizeText(f.q) : null;
  return ideas.filter((i) => {
    if (status ? !status.includes(i.status) : i.status === "archived") return false;
    if (pillar && !pillar.includes(i.pillar_id || "")) return false;
    if (shape && !shape.includes(i.shape_id || "")) return false;
    if (funnel && !funnel.includes(i.funnel_stage || "")) return false;
    if (source && !source.includes(i.source?.type || "")) return false;
    if (timeliness && !timeliness.includes(i.timeliness?.level || "")) return false;
    if (persona && !(i.persona_ids || []).some((p) => persona.includes(p))) return false;
    const created = Date.parse(i.created_at || "") || 0;
    if (since && created < since) return false;
    if (until && created > until) return false;
    if (q && !normalizeText(i.text).includes(q)) return false;
    return true;
  });
}

/** Counts per status (archived included), for the tabs. */
export function countByStatus(ideas) {
  const c = Object.fromEntries(IDEA_STATUSES.map((s) => [s, 0]));
  for (const i of ideas) if (c[i.status] !== undefined) c[i.status]++;
  return c;
}

/**
 * A radar or competitor idea without the engine's verified stamp. It cannot be approved or generated
 * (409, "re-run the radar"): the stamp is written only by radar-verify.mjs at ingest.
 */
export function isUnverifiedExternal(idea) {
  const t = idea?.source?.type;
  return (t === "radar" || t === "competitor") && !idea?.grounding?.verified_at;
}

/**
 * Find an idea by its full id or a unique prefix of at least 8 characters (the chat's actions use
 * prefixes). Returns {idea} | {error:"not-found"|"ambiguous"}.
 */
export function findIdea(ideas, idOrPrefix) {
  const k = String(idOrPrefix || "").trim().toLowerCase();
  if (!k) return { error: "not-found" };
  const exact = ideas.find((i) => String(i.id).toLowerCase() === k);
  if (exact) return { idea: exact };
  if (k.length < 8) return { error: "not-found" };
  const hits = ideas.filter((i) => String(i.id).toLowerCase().startsWith(k));
  return hits.length === 1 ? { idea: hits[0] } : { error: hits.length ? "ambiguous" : "not-found" };
}
