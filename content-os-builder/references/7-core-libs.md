# Reference 7 — The core libs (build these BEFORE the views)

Three tiny zero-dependency ESM modules that everything else stands on. Build them right after the
brand kit and before any view, because the dashboard, the generation routes, the radar, and the cron
all import them. Skipping them and "just parsing markdown" is the single biggest architectural
mistake in this build — it produces a dashboard that looks right and cannot be trusted.

```
content-os/app/src/lib/
  strategy-block.mjs    # the ONE renderer: brand-kit.json → a prompt block, per scope
  ideas-core.mjs        # the idea store: ids, validation, atomic writes, dedup
  radar-contract.mjs    # the ONE radar output contract + JSON extraction
  radar-ingest.mjs      # validate a scout run → insert into ideas.json
```

⚠️ **Put them under `app/src/lib/`, not a top-level `content-os/lib/`.** Next.js will not reliably
resolve imports from outside the app root, and you would have to fight the bundler. The CLI tools in
`content-os/tools/` import them by relative path instead (`../app/src/lib/strategy-block.mjs`) —
that direction works with zero config. **One copy, imported two ways. Never two copies.**

They are `.mjs` (plain ESM, no TypeScript, no deps) precisely so the Next.js app and a bare
`node tools/…` cron script can both import the *same file*. If you rewrite one in TypeScript you
have re-created the drift this design exists to prevent.

---

## 7a. `strategy-block.mjs` — the ONE renderer ⭐

**The single most important idea in this whole OS.** Every AI surface (generate, radar, chat, hooks,
edit) needs to know the brand. The naive build hardcodes a summary into each route — five copies that
drift the moment the user changes a pillar. Instead: **one renderer, read fresh on every request.**

The user edits `brand-kit.json` → what every AI surface knows changes → **no route code is touched.**

```js
// content-os/app/src/lib/strategy-block.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const SCOPES = ["generate", "radar", "chat", "hooks", "edit"];
export const KIT_PATH = join("brand-kit.json");

/**
 * Read + parse the kit. Returns null if missing/malformed — never throws.
 * The shape check is POSITIVE and deliberate: the kit is hand-edited, so a typo that
 * still parses (`{}`, `[]`, a half-saved file) must NOT be accepted. Otherwise we would
 * emit an authoritative "Obey it" header over empty guardrail sections — worse than no
 * strategy at all, because it looks valid.
 */
export function readKit(root) {
  try {
    const k = JSON.parse(readFileSync(join(root, KIT_PATH), "utf-8"));
    if (!k || typeof k !== "object" || Array.isArray(k)) return null;
    if (!k.identity || !k.voice || !k.strategy) return null;   // the guardrail sections
    return k;
  } catch { return null; }
}

const bullets = (a) => (a || []).map((s) => `- ${s}`).join("\n");

const secIdentity = (k) => `## WHO THIS IS FOR (positioning — non-negotiable)
${k.identity.tagline || ""}
Niche: ${k.identity.niche || ""} · Language: ${k.identity.language?.primary} (RTL: ${!!k.identity.language?.rtl})
Audience: ${k.audience?.who || ""} (level: ${k.audience?.level || ""})
${(k.audience?.personas || []).map((p) => `- **${p.id}** ${p.label} — wants: ${(p.wants || []).join(" · ")} · pains: ${(p.pains || []).join(" · ")}`).join("\n")}`;

const secAssociations = (k) => {
  const a = k.strategy?.associations || [];
  if (!a.length) return "";
  return `## BRAND ASSOCIATIONS — the intentionality gate
Every piece must reinforce at least ONE of these. If it reinforces none, do not make it.
${a.map((x) => `- **${x.id}** ${x.label} — test: ${x.test}`).join("\n")}`;
};

const secPillars = (k) => `## CONTENT PILLARS (target mix)
${(k.strategy?.pillars || []).map((p) => `- **${p.id}** ${p.label} · target ${p.ratio}% · funnel: ${p.funnel || "—"}\n  ${p.description || ""}`).join("\n")}`;

const secFunnel = (k) => `## FUNNEL
${(k.strategy?.funnel || []).map((f) => `- **${f.id}** (${f.label}) — goal: ${f.goal}`).join("\n")}`;

const secCta = (k) => {
  const s = k.strategy || {};
  const def = (s.offers || []).find((o) => o.is_default_cta);
  return `## CTA RULE (hard)
${s.cta_rule || ""}
One CTA per piece: ${s.one_cta_per_piece ? "YES — never two" : "no"}
Never mix: ${(s.never_mix || []).join(" · ") || "—"}
Default destination: ${s.cta_destination || "—"}${def ? ` (offer: ${def.id} — ${def.name})` : ""}
A piece with NO CTA is a valid, correct output — never invent one to fill the field.`;
};

const secOffers = (k) => {
  const o = k.strategy?.offers || [];
  if (!o.length) return "";
  return `## OFFERS (never mix two in one piece)
${o.map((x) => `- **${x.id}** ${x.name}${x.is_default_cta ? " ⭐ default" : ""}${x.keywords?.length ? ` · keywords: ${x.keywords.join(" / ")}` : ""}${x.objection ? `\n  Objection "${x.objection}" → ${x.objection_answer}` : ""}`).join("\n")}`;
};

const secVoice = (k) => `## VOICE
${k.voice.tone || ""} · register: ${k.voice.register || ""} · emoji: ${k.voice.emoji || "none"}
ALWAYS:
${bullets(k.voice.dos)}
NEVER:
${bullets(k.voice.donts)}
Sounds like him:
${(k.voice.samples || []).map((s) => `> ${s}`).join("\n")}`;

const secVisual = (k) => {
  const v = k.visual || {}, c = k.canvas || {};
  return `## VISUAL SYSTEM
Palette: primary ${v.colors?.primary} · accent ${v.colors?.accent} · theme ${v.theme}
Fonts: display ${v.fonts?.display} · mono ${v.fonts?.mono}
Canvases: ${Object.entries(c).map(([n, d]) => `${n} ${Array.isArray(d) ? d.join("×") : d}`).join(" · ")}
Tokens: content-os/app/src/app/design-tokens.css (inline the :root block into every exported HTML)`;
};

const secProof = (k) => `## PROOF BANK — ground every claim in one of these
NEVER invent a number, a result, a feature or a client detail. If you have no proof, say less.
${bullets(k.grounding?.projects)}
${bullets(k.grounding?.proof_points)}`;

const secNoGos = (k) => `## NO-GOS
HARD (never, under any framing):
${bullets(k.radar?.no_gos)}
${bullets(k.voice?.donts)}`;

const secScoring = (k) => {
  const d = k.strategy?.idea_scoring;
  if (!d) return "";
  return `## IDEA FIT SCORING
${(d.dimensions || []).map((x) => `- ${x.id} (${x.label}): ${x.min}–${x.max}`).join("\n")}
HARD REJECT: ${d.hard_reject_rule || ""}`;
};

const SCOPE_SECTIONS = {
  generate: [secIdentity, secAssociations, secPillars, secFunnel, secCta, secOffers, secVoice, secVisual, secProof, secNoGos],
  radar:    [secIdentity, secAssociations, secPillars, secFunnel, secCta, secScoring, secProof, secNoGos],
  chat:     [secIdentity, secAssociations, secPillars, secFunnel, secCta, secOffers, secVoice, secVisual, secProof, secNoGos, secScoring],
  hooks:    [secIdentity, secVoice, secCta, secNoGos],
  edit:     [secIdentity, secCta, secVoice, secVisual, secNoGos],
};

const FALLBACK = `## STRATEGY CONTEXT UNAVAILABLE
brand-kit.json could not be read. Read content-os/brand/*.md before producing anything.
Honor the hard no-gos regardless, keep at most ONE CTA (or none), and never invent numbers.`;

/** Render the strategy block for one AI surface. Never throws. */
export function renderStrategyBlock(kit, scope) {
  if (!kit) return FALLBACK;
  const header = `# ${kit.identity.name?.toUpperCase() || "BRAND"} — OPERATING STRATEGY (source: ${KIT_PATH})
This is the operational source of truth. Obey it. It is human-controlled — never edit it.
The Markdown docs in content-os/brand/ are the detailed reference and are NOT superseded.`;
  const body = (SCOPE_SECTIONS[scope] || SCOPE_SECTIONS.generate)
    .map((fn) => { try { return fn(kit); } catch { return ""; } })
    .filter((t) => t && t.trim())
    .join("\n\n");
  return `${header}\n\n${body}`;
}
```

**Wire it into every AI route** — one line at the top of each prompt, read fresh per request
(never cache the kit in a module-level constant, or edits need a server restart):

```ts
const kit = readKit(ROOT);
const prompt = `${renderStrategyBlock(kit, "generate")}\n\n---\n\n${task}`;
```

**And into the cron** — `content-os/tools/strategy-block.mjs` is a 5-line CLI wrapper that prints
the block so `radar-cron.sh` can inline it. Same file, no drift:

```js
#!/usr/bin/env node
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
import { readKit, renderStrategyBlock, SCOPES } from "../app/src/lib/strategy-block.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scope = process.argv[2] || "radar";
if (!SCOPES.includes(scope)) { console.error(`scope must be one of ${SCOPES.join("|")}`); process.exit(1); }
process.stdout.write(renderStrategyBlock(readKit(ROOT), scope) + "\n");
```

⚠️ **`brand-kit.json` is human-controlled. The AI reads it and may PROPOSE changes — it must never
write it.** Serve it read-only from `/api/strategy` (GET only, no POST/PATCH/DELETE by design) and
show it in a read-only Strategy view. A system that rewrites its own guardrails has none.

---

## 7b. `ideas-core.mjs` — the idea store ⭐

**`content-os/ideas.json` is the database.** Markdown logs (`radar/feed.md`, an `ideas.md` scratch
log) remain *human-readable research records* — they are never scraped to build the UI.

> If you have seen an earlier version of this skill that parsed `ideas.md` with a "top-level list
> items only, skip indented sub-bullets, skip `[source]` lines" parser: **that approach is retired.**
> It was fragile by construction — a research log is prose, and prose is not a schema. Every rule in
> that parser existed to undo damage the format caused. Store structured data structured.

### The record

```jsonc
{
  "id": "uuid",                        // crypto.randomUUID() — stable, never positional
  "text": "the idea in one line, in the brand voice",
  "source": { "type": "radar|competitor|manual|analytics|community", "url": "", "title": "", "radar_run_id": "" },
  "pillar_id": "…",                    // validated against the kit
  "persona_ids": [],
  "funnel_stage": "reach|trust|conversion",
  "brand_associations": [],            // ≥1 required — the intentionality gate
  "angle": "", "suggested_hook": "", "proof_assets": [],
  "suggested_cta_id": null,            // null = a no-CTA piece, which is valid
  "timeliness": { "level": "evergreen|timely|urgent", "expires_at": null, "rationale": "" },
  "rationale": "",
  "status": "new|reviewing|approved|rejected|produced|archived",
  "rejection_reason": null,            // REQUIRED when status = rejected
  "seen_count": 1, "last_seen_at": "", "created_at": "", "updated_at": ""
}
```

### The four things this module must get right

**1. Taxonomy validated against the kit — never invented.**

```js
import { readKit } from "./strategy-block.mjs";
export function taxonomy(root) {
  const k = readKit(root);
  if (!k) return { ok: false, pillars: [], personas: [], funnel: [], associations: [], ctas: [] };
  const s = k.strategy || {};
  return { ok: true,
    pillars: (s.pillars || []).map((p) => p.id),
    personas: (k.audience?.personas || []).map((p) => p.id),
    funnel: (s.funnel || []).map((f) => f.id),
    associations: (s.associations || []).map((a) => a.id),
    ctas: [...(s.cta_library || []).map((c) => c.id), ...(s.offers || []).map((o) => o.id)] };
}
```
`validateIdea(input, tax, {partial, soft})` rejects an unknown `pillar_id` with a message listing the
valid ids. **Hard-reject on write, soft-warn on ingest** — a radar run with one bad id should lose
that idea, not the whole run. Strip `undefined` keys before returning so a PATCH merge cannot blank
existing fields.

**2. Atomic writes behind an in-process mutex.** Two near-simultaneous requests must not clobber each
other, and a crash mid-write must not leave a truncated store.

```js
export function writeIdeasAtomic(root, store) {
  const p = join(root, "ideas.json");
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  const payload = { version: 1, updated_at: new Date().toISOString(), ideas: store.ideas };
  try { writeFileSync(tmp, JSON.stringify(payload, null, 2) + "\n", "utf-8"); renameSync(tmp, p); }
  catch (e) { try { if (existsSync(tmp)) unlinkSync(tmp); } catch {} throw e; }
  return payload;
}
// rename(2) is atomic within a filesystem: a reader sees the whole old file or the whole new one.

const g = globalThis;                       // on globalThis so it survives Next.js HMR
if (!g.__ideasMutex) g.__ideasMutex = Promise.resolve();
export function withStore(root, fn) {
  const run = g.__ideasMutex.then(async () => {
    const store = readIdeas(root);
    const result = await fn(store);                       // fn mutates store.ideas
    if (result?.__noWrite !== true) writeIdeasAtomic(root, store);
    return result;
  });
  g.__ideasMutex = run.then(() => undefined, () => undefined);  // keep the chain alive on rejection
  return run;
}
```
`readIdeas` returns `{version:1, updated_at:null, ideas:[]}` on a missing or malformed file — **never
throws**, so a fresh install renders an empty Ideas view instead of a 500.

**3. Deterministic dedup — no AI, no fuzzy scoring at insert time.** A daily radar re-surfaces the
same story for days. Inserting a twin each time makes the Ideas view unusable within a week.

Normalize first, then apply four rules cheapest-first:

```js
// normalizeText: NFKC → strip diacritics/tatweel → fold letter variants → strip zero-width/bidi
//                → lowercase → strip punctuation → collapse whitespace.
// (For Arabic: أإآٱ→ا, ى→ي, ة→ه. Adapt the folding pairs to the brand's language.)
// normalizeUrl:  drop hash + utm_*/fbclid/gclid/ref/si params + www. + trailing slash.
// similarity:    Jaccard over content words (length > 2).

1. exact normalized text match                        → duplicate
2. same normalized source URL + similarity ≥ 0.82     → duplicate
3. similarity ≥ 0.93 regardless of source             → duplicate
4. similarity ≥ 0.55 AND ≥ 5 shared *leading* words   → duplicate (paraphrase rule)
```
Rule 4 catches the same idea logged once as a title and once as a longer paraphrase with no URL, so
rules 2 and 3 both miss it. Only consider records from the last ~120 days, skip `archived`, and
**do match `rejected` ones** — otherwise a rejected idea returns as "new" every single scan.

A duplicate **never** replaces or deletes: bump `seen_count`, set `last_seen_at`, append the new URL
to `additional_sources`. Rising `seen_count` is signal — a story the world keeps repeating.

**4. Rejecting requires a reason.** `PATCH {status:"rejected"}` without `rejection_reason` → 400.
This is what makes the store teach you something over time instead of just shrinking.

### `/api/ideas` — full CRUD

`GET` (filters: `status,pillar,persona,funnel,source,timeliness,q,since,until` as CSV) ·
`POST` (validate → dedup → insert; returns `{inserted:false, duplicate_of, rule}` on a twin, **200 not
409** — a duplicate is a normal outcome) · `PATCH` (partial merge by id) ·
`DELETE` (archives; `?permanent=1` really removes).

Sort newest-first with an optional numeric `priority` override, and break ties by `id` so the order
is **total** and stable across restarts.

---

## 7c. `radar-contract.mjs` + `radar-ingest.mjs` — structured scout output

The scout is an LLM. Asking it for prose and then parsing the prose is the same mistake as 7b. Ask
for **JSON against a contract that lives in exactly one file**, imported by every entry point
(`/api/radar`, the cron script, and the scout's own prompt) so they cannot drift.

`RADAR_JSON_CONTRACT` is a template string of the exact shape, injected verbatim into the prompt:

```jsonc
{ "run_id": "<YYYY-MM-DD-HHmm>", "scanned_at": "<ISO>", "scope": "<general|focus topic>",
  "coverage_note": "<one honest line: what you could and could NOT reach>",
  "signals": [ { "bucket": "…", "headline": "…", "why_it_matters": "…", "url": "…" } ],
  "ideas":   [ { "text", "source_url", "source_title", "pillar_id", "persona_ids",
                 "funnel_stage", "brand_associations", "angle", "suggested_hook",
                 "proof_assets", "suggested_cta_id",
                 "timeliness": {"level","expires_at","rationale"}, "rationale" } ] }
```

Hard rules to state in the prompt, verbatim:
- Every id **must** exist in `brand-kit.json` (they are listed in the strategy block above). Never
  invent one — use `null` / `[]` rather than guessing.
- `brand_associations` must contain **at least one** id. An idea reinforcing none fails the
  intentionality gate — **drop it** instead of emitting it.
- `suggested_cta_id` may be `null`. A no-CTA piece is valid — do not invent an invite to fill it.
- `proof_assets` must reference something real from the PROOF BANK, or the idea must be framed
  build-in-public. Never invent a number, a result, or a client detail.
- **Write the JSON file FIRST, then the Markdown log.** If you can only do one, do the JSON.

`extractJson(text)` pulls the first *balanced* JSON object out of arbitrary model output (try the
```json fence first, then brace-match while tracking string/escape state). Models wrap JSON in prose;
`JSON.parse(wholeOutput)` fails on output that is 99% correct.

### The failure policy — a radar run is expensive, never lose one

| Failure | Result |
|---|---|
| Run file missing / unparseable / fails shape check | Raw text preserved to `radar/failed/<ts>.txt`. **`ideas.json` is not touched.** |
| One idea fails validation | That idea is skipped and reported. The rest still land. |
| Kit unreadable | Refuse to ingest at all — never insert against an unknown taxonomy |
| Partial write | Impossible — the store is one atomic rename at the end |

`ingestRadarRun(root, runPath, {dryRun})` returns a summary object and **never throws**:
`{ok, status:"success|degraded|failed", run_id, inserted, deduplicated, rejected, store_before,
store_after, details:{inserted,deduplicated,rejected}}`. Surface those counts in the UI — "3 new · 4
already known · 1 rejected" is the line that makes the radar trustworthy.

Keep it a **pure function with no `process.exit`** so `/api/radar` can call it in-process (preserving
the singleton job + reconnect behaviour) and the CLI can call it too. One implementation.

---

## 7d. Generation is gated on an approved idea ⭐

The point of a review workflow is that nothing gets produced without passing it. `/api/generate`
takes an **`idea_id`, not a free string**:

```ts
const rec = readIdeas(ROOT).ideas.find((i) => i.id === body.idea_id);
if (!rec) return Response.json({ error: `idea "${body.idea_id}" not found` }, { status: 404 });
if (rec.status !== "approved")
  return Response.json({ error: `idea must be approved before generating (current: "${rec.status}")`,
                         status: rec.status }, { status: 409 });
```
- The full record is injected into the prompt as an **explicit brief** (hook, angle, pillar, personas,
  proof assets, CTA id) — not just the one-line text. This is most of the quality difference.
- An escape hatch for ad-hoc work: `{ idea: "…", allow_untracked: true }`. Explicit, never the default.
- On **success only**, set `status:"produced"`, `produced_at`, and append the output paths to
  `produced_paths`. On failure the previous status stays — a failed run must not consume the idea.

---

## Checkpoint before moving on

```bash
cd content-os
node -e "import('./app/src/lib/strategy-block.mjs').then(async m=>{const b=m.renderStrategyBlock(m.readKit('.'),'generate');console.log(b.slice(0,400));console.log('...\n[block length]',b.length)})"
node tools/strategy-block.mjs radar | head -20
```
You must see the brand's real positioning, pillars and no-gos — **not** the `STRATEGY CONTEXT
UNAVAILABLE` fallback. If you see the fallback, `readKit`'s shape check is rejecting the kit: the file
is missing `identity`, `voice`, or `strategy`. Fix the kit, not the check.

Then confirm the store round-trips and dedups:
```bash
node -e "import('./app/src/lib/ideas-core.mjs').then(m=>{const s={ideas:[]},t=m.taxonomy('.');
 const v=m.validateIdea({text:'a test idea about building things',source:{type:'manual'}},t,{partial:true});
 console.log('valid:',v.ok,v.errors||'');
 console.log('insert1:',m.insertIdea(s,v.value).inserted, 'insert2(dup):',m.insertIdea(s,v.value).inserted);})"
```
Expect `valid: true`, `insert1: true`, `insert2(dup): false`. If the second insert returns `true`,
dedup is not wired — stop and fix it before building any view on top.
