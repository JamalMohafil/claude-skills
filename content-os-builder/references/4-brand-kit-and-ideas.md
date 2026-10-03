# Reference 4: The brand kit and the idea store (Stage 3)

Two stores that everything else stands on. Build them before any view: the dashboard, generation,
the radar, the chat and the cron all import them. `<root>` below is always one tenant folder,
`tenants/<id>/`. Every function takes it as an argument; there is never a global root.

The strategy view (§8) and the ideas view (§11) are specified here but built in Stage 4, together
with the dashboard shell they live in; this stage builds the stores, the routes and their tests.

Everything here is plain ESM with zero dependencies (`*.mjs`), so the Next routes and the CLI and cron
tools import the **same file**. The `.ts` wrappers only add types and bind `root`. Never rewrite one in
TypeScript "for consistency": that re-creates the drift this design exists to prevent.

```
<root>/brand/strategy.json              ← the LIVE kit. Only the approve route creates it. No AI writes it.
<root>/brand/strategy.json.prev         ← the previous live kit, kept on every approval
<root>/brand/strategy.draft.json        ← the proposed kit, written only by the ENGINE from an agent's fenced block
<root>/brand/strategy.draft.notes.md    ← the research agent's notes: what it read + "you must confirm"
<root>/content/analytics/audience.json  ← optional live audience snapshot (analytics module)
<root>/content/ideas.json               ← THE idea store (engine-owned)
<root>/content/ideas.json.corrupt-<iso> ← a quarantined unparseable store (never deleted)
engine/app/src/lib/strategy-core.mjs    ← readStrategy · readAudience · renderStrategyBlock (THE one renderer)
engine/app/src/lib/strategy.ts          ← strategyFor(root)
engine/app/src/lib/brand-interview.mjs  ← interviewInstructions · extractDraftBlock · writeDraft
engine/app/src/lib/brand-research.mjs   ← researchPrompt · saveResearchDraft
engine/app/src/lib/strategy-approve.mjs ← validateStrategyDraft · draftSha256 · approveDraft · rollbackPromotion
engine/app/src/lib/ideas-core.mjs       ← taxonomy, validation, dedup, atomic I/O, mutex (asset, copied verbatim)
engine/app/src/lib/shapes.mjs           ← the shape + lesson axes (asset, copied verbatim)
engine/tools/strategy-block.mjs         ← CLI: print a tenant's block for one scope (the cron)
engine/tools/draft-kit.mjs              ← CLI: research-draft a kit from the terminal
engine/tools/approve-kit.mjs · ideas.mjs · import-ideas.mjs   ← terminal approval and idea store (§12)
api/[tenant]/strategy/route.ts          ← GET only (read-only by design)
api/[tenant]/strategy/draft/route.ts    ← POST start research draft · GET poll
api/[tenant]/strategy/approve/route.ts  ← POST {draft_sha256}: the only write path to strategy.json
api/[tenant]/ideas/route.ts             ← GET / POST / PATCH / DELETE
```

---

## 1. Brand status and the brand gate

`brandStatus(root)` is derived (reference 2). `approved` plus an existing draft means a **pending
update**. `brandGate(t)` returns 409 unless approved. Call it at the top of **every brand-sensitive
producer**: generate, radar, competitor ideas, videos, today's proposal, community post, and the
chat's generate/radar actions. Read-only views (strategy, the ideas list) are not gated.

## 2. `brand/strategy.json`: the schema

**[V]** = checked by the approval validator.

```jsonc
{
  "version": 1,                                  // [V] integer
  "updated": "YYYY-MM-DD",                       // [V] non-empty
  "owner": "<business name>",
  "governance": { "change_process": "", "ai_must_never": [""] },          // optional, shown in the UI
  "mission": { "one_line": "", "contrarian_belief": "", "brand_promise": "" },
  "positioning": { "statement": "",              // [V] non-empty
                   "statement_en": "", "shorthand": "", "is": [""], "is_not": [""] },
  "brand_associations": { "rule": "every piece must reinforce at least one",
                          "items": [{ "id": "", "label": "", "test": "" }] },   // [V] non-empty, unique ids
  "business_objective": { "horizon": "90 days", "primary": "", "north_star_kpi": "" },
  "kpis": { "north_star": { "id": "", "label": "", "why": "" }, "secondary": [{ "id": "", "label": "", "funnel": "" }],
            "distribution_indicators_only": { "ids": [], "rule": "" }, "measurement_note": "" },
  "audience": { "language": "", "geo_note": "", "live_data_source": "content/analytics/audience.json" },   // prose; the machine-readable code is tenant.json settings.lang
  "personas": [{ "id": "", "label": "", "priority": 1, "description": "", "level": "",     // [V] non-empty, unique ids
                 "wants": [], "pains": [], "objection": "", "objection_answer": "", "moved_by": [] }],
  "pillars": [{ "id": "", "label": "", "target_share": 0.4,      // [V] non-empty, unique, share in (0,1], sum = 1 ±0.001
                "primary_funnel": "reach", "personas": [], "description": "", "rule": "", "examples": [] }],
  "funnel": [{ "id": "reach", "label": "", "goal": "", "kpis": [], "content_feel": "" }],   // [V] non-empty, unique ids
  "shapes": [{ "id": "", "label": "", "news": false }],          // [V] non-empty, unique ids, ≥2 with news:false
  "platforms": [{ "id": "instagram", "handle": "@real_handle or \"\"", "role": "", "cadence": "", "note": "" }],
  "offers": [{ "id": "", "name": "", "priority": 1, "is_default_cta": true, "cta_keywords": [], "url": "",   // [V] array, MAY be empty, unique ids
               "note": "", "objection": "", "objection_answer": "" }],
  "cta_library": [{ "id": "" }],                                 // optional; if present: unique ids
  "cta_rule": { "max_per_piece": 1, "no_cta_is_valid": true, "statement": "", "hard_rules": [], "ai_instruction": "" },  // [V] object
  "filming_styles": [{ "id": "", "label": "", "camera": "", "pacing": "", "use_for": [] }],       // video creators only
  "script_principles": { "framework": "", "hook_window": { "short_form": "", "long_form": "" }, "rules": [], "reel_length": "" },
  "voice": { "summary": "", "dialect_markers": [], "hard_rules": [], "banned_words": [], "samples": [] },
  "visual_system": { "summary": "", "background": "dark|light", "fonts": { "display": "", "body": "" },
                     "hard_rules": [], "canvases": { "carousel": "1080x1350", "story": "1080x1920" } },
  "competitors": [{ "id": "", "name": "", "platform": "youtube|instagram|tiktok|x", "handle": "", "note": "" }],
  "proof_bank": { "note": "only real, verifiable proof", "items": [], "no_proof_framing": "" },   // framing: optional, the owner's own words
  "retired": [],                                                 // claims that must never be used again
  "no_gos": { "hard": [], "soft": [], "enforced_by": "" },       // [V] no_gos.hard is an array (may be empty)
  "idea_scoring": { "dimensions": [{ "id": "", "label": "", "min": 0, "max": 5 }], "hard_reject_rule": "" }   // optional, display-only
}
```

Rules: ids are short kebab-case ASCII. Labels and descriptions are in the language the business
**publishes** in. Fonts are Google Fonts families that support the script. A handle is the real
@handle or `""`, never a guess.

> **`shapes` is the anti-repetition vocabulary** (§9): the recurring *forms* the content takes,
> e.g. "I got this wrong → what I'd do instead" for a creator, or "a customer asked → the answer" for a
> shop. Starter lists per kind are `STARTER_SHAPES` in `shapes.mjs`. It is not the manifest's `formats`, which
> are canvases and outputs. The reference build called this axis `format_id`; this skill names it
> `shape_id` because `formats` already means outputs in `tenant.json`, and the collision caused bugs.

## 3. `strategy-core.mjs`: the ONE renderer

Every AI surface (generate, radar, chat, hooks, edit) needs the brand. The naive build hardcodes a
summary into each route: five copies that drift the moment a pillar changes. Instead there is one
renderer, read fresh on every request. **Editing `strategy.json` changes what every AI surface knows,
with no route code touched and no restart.**

```js
// engine/app/src/lib/strategy-core.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const SCOPES = ["generate", "radar", "chat", "hooks", "edit"];
export const KIT_FILE = "brand/strategy.json";

/** Parse the live kit. NEVER throws. POSITIVE shape gate: a hand-edit that still parses ({} or []) must
 *  not be accepted, or the renderer emits an authoritative "Obey it" header over empty guardrails. */
export function readStrategy(root) {
  try {
    const k = JSON.parse(readFileSync(join(root, KIT_FILE), "utf-8"));
    if (!k || typeof k !== "object" || Array.isArray(k)) return null;
    if (k.version === undefined || !k.no_gos || !k.cta_rule || !k.positioning) return null;
    return k;
  } catch { return null; }
}
export function readAudience(root) {
  try { return JSON.parse(readFileSync(join(root, "content/analytics/audience.json"), "utf-8")); } catch { return null; }
}

const arr = (a) => (Array.isArray(a) ? a : a ? [a] : []).filter(Boolean);
const bullets = (a) => arr(a).map((s) => `- ${s}`).join("\n");
const fontsOf = (f) => !f ? "" : typeof f === "string" ? f : Array.isArray(f) ? f.join(" / ")
  : [f.display && `display ${f.display}`, f.body && `body ${f.body}`].filter(Boolean).join(" · ");
const kfmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));
/** Sort an audience slice ourselves (never trust the API order), print the top n as "key NN%". */
const slice = (s, n) => { const t = arr(s).reduce((a, x) => a + (x.value || 0), 0) || 1;
  return arr(s).slice().sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, n)
    .map((x) => `${x.key} ${Math.round(((x.value || 0) / t) * 100)}%`).join(", "); };

const SEC = {
  identity: (k) => { const p = k.positioning || {}, m = k.mission || {}, a = k.brand_associations?.items || [];
    return [`## IDENTITY (non-negotiable)`, p.statement, p.shorthand && `Shorthand: ${p.shorthand}`,
      m.contrarian_belief && `Contrarian belief: ${m.contrarian_belief}`,
      arr(p.is).length && `THE BRAND IS:\n${bullets(p.is)}`, arr(p.is_not).length && `THE BRAND IS NOT:\n${bullets(p.is_not)}`,
      a.length && `BRAND ASSOCIATIONS — every piece reinforces at least one, or it is not made:\n${a.map((x) => `- **${x.id}** ${x.label} — test: ${x.test}`).join("\n")}`,
    ].filter(Boolean).join("\n"); },
  objective: (k) => { const o = k.business_objective, kp = k.kpis; if (!o && !kp) return "";
    return [`## OBJECTIVE`, o?.primary && `${o.horizon || ""}: ${o.primary}`, kp?.north_star && `North star: ${kp.north_star.label} — ${kp.north_star.why || ""}`,
      arr(kp?.secondary).length && `Secondary: ${arr(kp.secondary).map((x) => x.label).join(" · ")}`,
      kp?.distribution_indicators_only?.rule && `Distribution-only metrics: ${kp.distribution_indicators_only.rule}`].filter(Boolean).join("\n"); },
  audience: (k, aud) => { const a = k.audience || {};
    const live = aud ? `LIVE AUDIENCE: ${aud.followers != null ? `${kfmt(aud.followers)} followers · ` : ""}age ${slice(aud.age, 3)} · gender ${slice(aud.gender, 2)} · countries ${slice(aud.country, 5)}` : "";
    return [`## AUDIENCE`, a.language && `Language: ${a.language}`, a.geo_note, live,
      ...arr(k.personas).map((p) => `- **${p.id}** ${p.label}: wants ${arr(p.wants).join(" · ")} · pains ${arr(p.pains).join(" · ")}${p.objection ? ` · objection "${p.objection}" → ${p.objection_answer || ""}` : ""}${arr(p.moved_by).length ? ` · moved by ${arr(p.moved_by).join(", ")}` : ""}`),
    ].filter(Boolean).join("\n"); },
  pillars: (k) => `## PILLARS (target mix)\n${arr(k.pillars).map((p) => `- **${p.id}** ${p.label} · ${Math.round((p.target_share || 0) * 100)}% · funnel ${p.primary_funnel || "—"}\n  ${p.description || ""}${p.rule ? `\n  RULE: ${p.rule}` : ""}${arr(p.examples).length ? `\n  e.g. ${arr(p.examples).slice(0, 3).join(" | ")}` : ""}`).join("\n")}`,
  funnel: (k) => `## FUNNEL\n${arr(k.funnel).map((f) => `- **${f.id}** ${f.label}: ${f.goal || ""}`).join("\n")}`,
  cta: (k) => { const c = k.cta_rule || {}, def = arr(k.offers).find((o) => o.is_default_cta);
    return [`## CTA RULE (hard)`, c.statement, `At most ${c.max_per_piece ?? 1} CTA per piece. A piece with NO CTA is ${c.no_cta_is_valid === false ? "not" : "a valid, correct"} output — never invent one.`,
      bullets(c.hard_rules), c.ai_instruction, def && `Default CTA: ${def.name} (${def.id})${arr(def.cta_keywords).length ? ` · keywords ${def.cta_keywords.join(" / ")}` : ""}`].filter(Boolean).join("\n"); },
  offers: (k) => arr(k.offers).length ? `## OFFERS (never mix two in one piece)\n${arr(k.offers).map((o) => `- **${o.id}** ${o.name}${o.is_default_cta ? " (default)" : ""}${o.objection ? `\n  objection "${o.objection}" → ${o.objection_answer || ""}` : ""}`).join("\n")}` : "",
  filming: (k) => arr(k.filming_styles).length ? `## FILMING STYLES\n${arr(k.filming_styles).map((f) => `- **${f.id}** ${f.label}: ${[f.camera, f.pacing].filter(Boolean).join(" · ")}`).join("\n")}` : "",
  script: (k) => { const s = k.script_principles; if (!s) return "";
    return [`## SCRIPT PRINCIPLES`, s.framework, s.hook_window && `Hook window: short ${s.hook_window.short_form || "—"} · long ${s.hook_window.long_form || "—"}`, s.reel_length && `Length: ${s.reel_length}`, bullets(s.rules)].filter(Boolean).join("\n"); },
  voice: (k) => { const v = k.voice || {};
    return [`## VOICE`, v.summary, arr(v.dialect_markers).length && `Dialect markers: ${v.dialect_markers.join(" · ")}`,
      arr(v.hard_rules).length && `HARD RULES:\n${bullets(v.hard_rules)}`, arr(v.banned_words).length && `Never use: ${v.banned_words.join(", ")}`,
      arr(v.samples).length && `Sounds like:\n${arr(v.samples).map((s) => `> ${s}`).join("\n")}`].filter(Boolean).join("\n"); },
  visual: (k) => { const v = k.visual_system || {};
    return [`## VISUAL SYSTEM`, v.summary, v.background && `Background: ${v.background}`, fontsOf(v.fonts) && `Fonts: ${fontsOf(v.fonts)}`,
      v.canvases && `Canvases: ${Object.entries(v.canvases).map(([n, d]) => `${n} ${d}`).join(" · ")}`, bullets(v.hard_rules)].filter(Boolean).join("\n"); },
  proof: (k) => `## PROOF BANK — the ONLY claims you may make\nNever invent a number, result, client, price or personal habit. No proof → say less${k.proof_bank?.no_proof_framing ? `, or ${k.proof_bank.no_proof_framing}` : ""}.\n${bullets(k.proof_bank?.items)}${arr(k.retired).length ? `\nRETIRED — never use again:\n${bullets(k.retired)}` : ""}`,
  nogos: (k) => `## NO-GOS\nHARD — never, under any framing:\n${bullets(k.no_gos?.hard)}${arr(k.no_gos?.soft).length ? `\nSOFT — avoid:\n${bullets(k.no_gos.soft)}` : ""}`,
  scoring: (k) => { const d = k.idea_scoring; if (!d) return "";
    return `## IDEA FIT SCORING\n${arr(d.dimensions).map((x) => `- ${x.id} (${x.label}): ${x.min}–${x.max}`).join("\n")}${d.hard_reject_rule ? `\nHARD REJECT: ${d.hard_reject_rule}` : ""}`; },
};

const SCOPE_SECTIONS = {
  generate: ["identity", "objective", "audience", "pillars", "funnel", "cta", "offers", "filming", "script", "voice", "visual", "proof", "nogos"],
  radar:    ["identity", "objective", "audience", "pillars", "funnel", "cta", "proof", "nogos", "scoring"],
  chat:     ["identity", "objective", "audience", "pillars", "funnel", "cta", "offers", "filming", "script", "voice", "visual", "proof", "nogos", "scoring"],
  hooks:    ["identity", "audience", "cta", "script", "voice", "nogos"],
  edit:     ["identity", "cta", "voice", "visual", "nogos"],
};

export const FALLBACK_MARKER = "BRAND KIT UNAVAILABLE";
export const FALLBACK = `## ${FALLBACK_MARKER}
This workspace has no approved brand kit. Refuse brand-sensitive output (scripts, hooks, captions, ideas,
CTAs, sales copy). Do not assume a voice, audience or offer, and never read another workspace as a
substitute. Tell the owner to approve a kit in the strategy view.`;

/** For a chat that is BUILDING or REVIEWING the kit (interview mode, or a draft pending review): the
 *  refusal above would contradict the instructions to draft voice, offers and CTAs, so it is replaced. */
export const DRAFT_HEADER = `## BRAND KIT NOT APPROVED YET
There is no approved kit. You are building or reviewing the draft at brand/strategy.draft.json (read it
if it exists). Drafting the kit's voice, offers and CTAs WITH the owner is your job here; producing
finished content (scripts, captions, posts) is not, until the owner approves the kit in the strategy view.
Never read another workspace as a substitute.`;

/** NEVER throws. Empty sections are dropped; one broken section never kills the block. */
export function renderStrategyBlock(kit, scope, audience = null) {
  if (!kit) return FALLBACK;
  const header = `# STRATEGY (v${kit.version} · updated ${kit.updated || "?"} · source: ${KIT_FILE})
Operational source of truth. Obey it. Human-controlled: never edit it.`;
  const body = (SCOPE_SECTIONS[scope] || SCOPE_SECTIONS.generate)
    .map((name) => { try { return SEC[name](kit, audience); } catch { return ""; } })
    .filter((t) => t && String(t).trim()).join("\n\n");
  return `${header}\n\n${body}`;
}
```

- **The chat picks the header, not the renderer.** With no approved kit, the chat route uses
  `DRAFT_HEADER` instead of `FALLBACK` when `chat.mode === "interview"` or `brand_status === "draft"`
  (reference 9 §3); every other surface (generate, radar, hooks, edit, the cron) gets `FALLBACK`.
- **Tenant-neutral by construction.** No default voice, shorthand, no-go, "no proof" framing or reference
  document in code. Write "THE BRAND IS", never a gendered "HE IS". A unit test renders tenant B's kit in every
  scope and asserts that zero literals from tenant A's kit appear.
- `strategy.ts` → `strategyFor(root)` = `{ loadStrategy, loadAudience, renderStrategyBlock(scope),
  currentFollowers() }`. It reads fresh on every call and wraps rendering in try/catch with the
  fallback, so an AI route can never 500 because of a kit edit.
- **Keep the schema and the renderer in lockstep, with a test that every schema field renders.** A
  real bug: the schema wrote `fonts` as `{display, body}` while the renderer did `[].concat(fonts).join()`,
  which printed `Fonts: [object Object]` into every prompt.
- The CLI `node engine/tools/strategy-block.mjs <scope> --tenant <id>` prints the same block for the
  cron. On a missing kit it warns on stderr and prints the fallback. **The cron must grep for
  `FALLBACK_MARKER`, not test for emptiness**, because the renderer never returns "".

## 4. Making a kit, path A: the in-chat interview

- **Interview is a property of the chat record**, set at creation with `POST /chats {mode:"interview"}`.
  Every turn of that chat gets `interviewInstructions({tenantName, brandStatus, today})` appended to
  its system prompt, and `DRAFT_HEADER` in place of the fallback block. A normal chat can never write a
  draft. It needs the `assistant` module: path (a) is offered only where that module is on.
- One click from the strategy view or home (`/assistant?start=interview`) creates it with a canned
  first message ("start the brand interview, one question at a time").
- The instructions tell the agent to:
  - PRE-FILL from what the tenant folder already says (CLAUDE.md, brand/, memory/) and ask the owner
    to confirm. Never make the owner repeat themselves, and never invent.
  - Ask 1–2 questions per turn, in this order: what the business is and for whom → positioning and
    one contrarian belief → associations → 3–5 pillars with shares → 2–3 personas → shapes → voice →
    visual system → offers and CTAs (or none) → funnel → platforms and cadence → competitors' handles
    → hard no-gos.
  - Propose concrete options so the owner only says yes or adjusts. Numbers, names and claims come
    only from the owner or the documents.
  - Let "done / write the draft" end it at any time. Unknown values become `"TBD"` **inside values**;
    a list always stays a list, with one honest entry, never the string "TBD" in place of a list.
  - Not output the draft before pillars, personas, voice and no-gos are covered, unless asked.
  - End with: a 5–8 line summary, then **exactly one** fenced block tagged ` ```strategy-draft `
    holding the JSON (the exact schema keys, no comments), then one line telling the owner to review
    and approve it in the strategy view.
- `extractDraftBlock(text)`: the tagged fence first; failing that, the first ` ```json ` block that
  parses and has both `pillars` and `positioning`. Models often drop the custom tag.
- `writeDraft(root, raw)`: `JSON.parse` → `validateStrategyDraft` → write a temp file and rename it onto
  `brand/strategy.draft.json`. It returns `{ok}` or `{ok:false, errors}` and never throws.
- After the reply streams, the chat route either sends `{type:"draft", ok:true}` (the UI shows an
  "approve it in the strategy view" card), or **appends an assistant note listing the validation
  errors** to the chat (so the next turn sees and fixes them) and sends `{type:"draft", ok:false, errors}`.
- In the chat UI, a `strategy-draft` code block is folded into a `<details>` ("brand draft, already
  written"). It is data, not reading material.

## 5. Path B: the research draft (no questions)

- `researchPrompt({tenantName, tenantId, today})` reuses the interview's schema and output contract
  **verbatim**, by splitting the interview instruction text at its "When you write the draft" marker.
  Both paths then produce the identical kit shape, from one schema to maintain.
- The research order: (1) Glob and read the tenant's CLAUDE.md, memory/, work/, brand/,
  content/analytics/*.json, research/ and library/products/; (2) WebFetch the business's website and
  the public profiles named there, then WebSearch the brand (official sources only); (3) its
  competitors: the tracked ones plus 2–4 more that make content for the same audience.
- Rules: facts only from files and sources. Where the sources are silent, pick a sensible **strategic
  default and flag it as an assumption**. Rules already written in CLAUDE.md and memory override the
  web. 3–5 pillars summing to exactly 1; 2–3 personas.
- The output is 8–14 lines for the owner (the files and URLs it read, plus a **"you must confirm"**
  list of every assumption), then the fenced kit. `saveResearchDraft(root, reply)` writes the draft
  and saves everything before the fence as `brand/strategy.draft.notes.md`.
- `POST /api/[tenant]/strategy/draft` (403 in production; module `strategy`): one job per tenant in
  `globalThis.__draftJobs` (a Map keyed by tenant id, which survives HMR); 409 if one is running. It
  spawns the **scout** profile (files inside the tenant plus WebFetch/WebSearch, no shell) with
  `maxTurns: 80` and the prompt on stdin, and runs `saveResearchDraft` on close. `GET` returns the job
  or `{status:"idle"}`; the UI polls every 5 s.
- `node engine/tools/draft-kit.mjs --tenant <id>` does the same from the terminal.

## 6. Path C: answers given to you during the build

Write them to `brand/strategy.draft.json` through the same `validateStrategyDraft`, and put your
assumptions in `brand/strategy.draft.notes.md`. **Never write `strategy.json` yourself.** The owner
approves in the strategy view like any other draft.

## 7. Approval: the only path to `strategy.json`

`validateStrategyDraft(obj)` → `{ok, errors[]}`. It checks two layers:
1. **What `readStrategy` gates on**: `version` is an integer; `updated` is non-empty;
   `positioning.statement` is non-empty; `cta_rule` is an object; `no_gos.hard` is an array.
2. **What the idea taxonomy reads ids from**: `pillars`, `personas`, `funnel`, `brand_associations.items`
   and `shapes` must be non-empty arrays of objects with unique non-empty string ids. `offers` must be
   such an array but may be empty (a no-CTA brand is valid). `cta_library`, if present, follows the
   same rules. Pillar `target_share` must be in (0,1] and the shares must sum to 1 ±0.001. `shapes`
   needs at least 2 entries with `news: false`, or no radar run can ever pass the diversity gate.

```js
// engine/app/src/lib/strategy-approve.mjs (shape)
export const draftSha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function approveDraft(root, { expectedSha256 }) {
  const draft = join(root, "brand/strategy.draft.json"), live = join(root, "brand/strategy.json"), prev = `${live}.prev`;
  let st; try { st = lstatSync(draft); } catch { return { status: 409, error: "no draft to approve" }; }
  if (!st.isFile()) return { status: 422, error: "draft is not a regular file" };   // refuse symlinks
  const bytes = readFileSync(draft);                                                 // read ONCE
  if (draftSha256(bytes) !== expectedSha256)
    return { status: 409, error: "the draft changed after you opened it — refresh and review again" };
  let obj; try { obj = JSON.parse(bytes.toString("utf-8")); } catch (e) { return { status: 422, error: `not JSON: ${e.message}` }; }
  const v = validateStrategyDraft(obj); if (!v.ok) return { status: 422, errors: v.errors };
  const hadLive = existsSync(live); if (hadLive) copyFileSync(live, prev);
  const tmp = `${live}.approving-${process.pid}`; writeFileSync(tmp, bytes); renameSync(tmp, live); unlinkSync(draft);
  if (!readStrategy(root) || !taxonomy(root).ok) {                                   // functional check
    rollbackPromotion(root, { hadLive });                                             // live → draft, restore .prev
    return { status: 422, error: "approved kit could not be loaded — rolled back" };
  }
  return { status: 200, ok: true };
}
```
- `GET /api/[tenant]/strategy` is **always 200** for a resolved tenant ("no kit yet" is every new
  tenant's normal state): `{strategy|null, audience, readOnly:true, brand_status, draft|null,
  draft_sha256|null, draft_notes|null, error?}`. `draft` and `draft_sha256` come from **one read**, so
  the hash describes exactly the bytes the page renders. `?scope=<s>` adds the exact prompt block for
  debugging. **No POST, PATCH or DELETE**, by design.
- `POST /api/[tenant]/strategy/approve {draft_sha256}`: 403 in production; a missing or malformed
  hash (not `^[0-9a-f]{64}$`) → 400; otherwise it maps `approveDraft`'s status.
- Approving over an existing live kit is allowed on purpose: that is how a proposed update is
  accepted, and `.prev` keeps the old one.
- **Approval does not touch `CLAUDE.md`, and does not need to.** The tenant's law is written once by
  `new-tenant` in neutral words ("the approved kit is `brand/strategy.json`; read it; if it is missing,
  the kit is not approved yet") and no agent can edit it, so it stays true before and after approval.
  Never write kit facts ("what it sells", "it is not approved yet") into `CLAUDE.md` during the build:
  they go stale the moment the owner approves or changes the kit in the app.

## 8. The strategy view (read-only)

Three states, keyed on the files, never on the HTTP status:
- **A draft exists** (a first kit or an update). Show a hero card ("a brand draft / a proposed update
  is waiting for your approval") with: **Approve**, which POSTs the `draft_sha256` and reloads, or
  lists the errors; a "correct it with the assistant" link (`?start=interview`); and the rendered
  `draft_notes` ("what the agent read · what you must confirm"). **While a draft is pending, every
  section below renders FROM THE DRAFT**, so the owner reviews exactly what they approve. For an
  update, say that the current kit keeps running until the owner approves, and that the old one is kept.
- **No draft and not approved.** An empty state with two actions: "let the agent draft it" (starts
  the research job, polls, and shows "reading files, site, competitors…") or "interview me".
- **Approved, no draft.** No banner.

The body, with section numbers counted **at render time** so a skipped section leaves no gap:
governance ("this page is read-only; the kit changes only when you approve a new draft"), positioning
(a big quote plus a green IS / red IS NOT split), mission, associations (cards with their tests),
objective and KPIs, personas (wants and pains columns, objection box, "moved by" tags), pillars (one
stacked bar of all the shares in shades of the tenant accent, then a bar per pillar), funnel, shapes
(news ones marked), offers and the CTA rule, filming styles, voice and visual system, no-gos (hard in
red, soft in amber). An empty value shows "not set in the kit". Map ids to their labels. Isolate
opposite-direction text with `<bdi>`.

---

## 9. The idea store: `content/ideas.json`

```jsonc
{ "version": 1, "updated_at": "ISO", "ideas": [ {
  "id": "crypto.randomUUID()",             // stable; never positional
  "text": "8..600 chars",
  "source": { "type": "radar|competitor|manual|analytics|community|legacy-import", "url": "", "title": "≤300",
              "competitor_id": "", "radar_run_id": "" },
  "pillar_id": "<kit pillar id>", "persona_ids": ["<kit persona ids>"], "funnel_stage": "<kit funnel id>",
  "brand_associations": ["<kit association ids>"],
  "shape_id": "<kit shape id>",            // the FORM (anti-repetition axis 1)
  "core_lesson": "kebab-key",              // the ONE lesson it teaches (axis 2), normalized
  "angle": "≤1000", "suggested_hook": "≤500", "hook_source": "≤300",
  "competitor_precedent": { "covered": false, "who": null, "date": null, "performance": null, "differentiator": null },
  "grounding": { "what_happened": "≤400", "why_it_matters": "≤400", "evidence": "verbatim quote ≤400",
                 "source_date": "YYYY-MM-DD", "verified_at": "ISO — ENGINE STAMP ONLY" },
  "proof_assets": ["≤12 × ≤300"], "suggested_cta_id": "<cta or offer id>|null", "offer_id": "",
  "timeliness": { "level": "evergreen|timely|urgent", "expires_at": "", "rationale": "≤500" },
  "rationale": "≤1000",
  "status": "new|reviewing|approved|rejected|produced|archived",
  "rejection_reason": "≤600 — required when rejected",
  "score": null, "score_details": null,    // reserved: no scoring yet, never fake one
  "seen_count": 1, "last_seen_at": "ISO", "additional_sources": [{ "type": "", "url": "", "title": "", "seen_at": "" }],
  "priority": 0,                           // optional manual sort override, higher first
  "created_at": "ISO", "updated_at": "ISO", "reviewed_at": "ISO", "produced_at": "ISO",
  "produced_paths": ["content/carousels/<slug>"]
} ] }
```

### 9.1 Taxonomy and validation

`taxonomy(root)` reads the kit fresh → `{ok, pillars[], personas[], funnel[], associations[], shapes[],
ctas: [...cta_library ids, ...offer ids], offers[]}`. If the kit is unreadable it returns `ok:false`
with empty lists, and every writer then refuses with 503.

`validateIdea(input, tax, {partial, soft})`:
- `partial` (for PATCH) validates only the keys present; strip `undefined` keys afterwards so a merge
  never blanks a field.
- Every taxonomy reference must exist in the kit. **Strict** (radar ingest, manual POST/PATCH): an
  unknown id is an error whose message lists the valid ids. **Soft** (the chat agent's add, a legacy
  import): unknown ids are dropped with a warning. References are never silently invented.
- `shape_id` must be one of the kit's shapes; `core_lesson` goes through `normalizeLesson`.
- `status` and `timeliness.level` are enum-checked; every string is length-clipped.

### 9.2 Store I/O: atomic, locked, and safe when corrupt

- `readIdeas(root)` **never throws**. ENOENT → an empty store. Any other read error, a parse failure,
  or `ideas` not being an array → an empty store **marked DEGRADED** with a non-enumerable flag, so
  the flag never serialises.
- `writeIdeasAtomic(root, store)`: if the store is degraded, first **quarantine** the bad file by
  renaming it to `ideas.json.corrupt-<iso>` (a failed rename other than ENOENT is fatal). Then write
  `{version, updated_at, ideas}` to `ideas.json.tmp-<pid>-<ts>` and rename it over the store. On
  failure, delete the temp file and rethrow. `rename(2)` is atomic within a filesystem: a reader sees
  the whole old file or the whole new one.
- `withStore(root, fn)`: an in-process mutex, as a promise chain on `globalThis.__ideasMutex` so it
  survives HMR. It reads, `await fn(store)`, then writes atomically unless `fn` returns
  `{__noWrite:true}`. Keep the chain alive on rejection: `run.then(() => {}, () => {})`. **Route every
  writer through it, the radar ingest included.**

> Why the degraded flag matters: an unparseable store that reads as "no ideas" gets that emptiness
> written over it by the next insert. One truncated write becomes permanent loss of every idea.

### 9.3 Dedup: deterministic, no AI

- `normalizeText`: NFKC, strip diacritics and tatweel, fold letter variants (Arabic: `آأإٱ→ا`, `ى→ي`,
  `ة→ه`; other scripts: fold accents), remove zero-width and bidi marks, lowercase, punctuation → space,
  collapse whitespace.
- `normalizeUrl`: drop the hash and `utm_*`, `fbclid`, `gclid`, `ref`, `ref_src` and `si`; drop `www.`
  and the trailing slash; lowercase.
- Similarity is Jaccard over content words (longer than 2 characters).
- `findDuplicate(ideas, cand)` considers non-archived ideas whose `last_seen_at || created_at` is
  within **120 days**. **Rejected ideas ARE candidates**, so a rejected idea never returns as new.
  The rules, cheapest first:
  1. exact normalized text;
  2. same normalized URL and similarity ≥ **0.82**;
  3. similarity ≥ **0.93** regardless of source;
  4. similarity ≥ **0.55** and ≥ **5 shared leading content words** (a paraphrase).
- `markResurfaced(existing, cand)`: `seen_count++`, `last_seen_at = now`, append a new URL to
  `additional_sources`. It **never deletes and never overwrites**. A rising `seen_count` is a signal:
  the world keeps repeating the story.

These thresholds were measured on a real corpus: paraphrase pairs share 5–6 leading words at 0.63–0.82
similarity, while genuinely different ideas share none at 0.00.

### 9.4 The shape and lesson axes: ship `assets/shapes.mjs`

**§9.1–§9.5 are implemented by `assets/ideas-core.mjs` (copy it verbatim)**; the prose here is why.

Text dedup compares **wording**. Two ideas that both mean "something new came out → we tried it for
real" share almost no words, so every rule passes them both, correctly. Run that daily and the store fills
with dozens of records of one single form while every metric says it is clean. Later, six ideas in
six different shapes in one week all taught the same single lesson. Neither text dedup nor shape
saturation could see that. So there are two more axes, and both are gated:

| Function (shapes.mjs) | Gate | Called from |
|---|---|---|
| `findShapeSaturation(ideas, cand)` | ≥3 active ideas with the same shape **and pillar** in 30 days → refused | `insertIdea` (radar, chat add) |
| `findLessonSaturation(ideas, cand)` | ≥2 active ideas with the same `core_lesson` in 30 days → refused | `insertIdea` (radar, chat add) |
| `enforceRunDiversity(cands, kit)` | max 2 per shape, max 1 per lesson per run; **fewer than 2 non-news ideas (or fewer than 2 distinct shapes) → the WHOLE run is rejected** | radar ingest |
| `fullShapes` · `recentLessons` · `renderVarietyBlock` | told to the scout **up front** | the radar prompt |
| `shapeMix(ideas)` | 30-day shape mix | Ideas and Radar views |

`insertIdea(store, validated, now, {allowSaturated})`:
1. Dedup first: a duplicate is resurfaced → `{inserted:false, duplicate_of, rule, score}`.
2. Then shape and lesson saturation, unless `allowSaturated` → `{inserted:false, saturated, rule, message}`.
   This is a refusal that carries the count and examples ("you already have 3 of these"), not a
   resurface.
3. Otherwise build the record (uuid, `status:"new"`, `score:null`, `seen_count:1`, timestamps) →
   `{inserted:true, idea}`.

**A manual POST passes `allowSaturated:true`**: a human deliberately adding a 4th piece of a working
shape is legitimate. The radar and the chat agent never bypass it. Telling the scout what is full up
front matters, because one run lost 4 of its 6 verified ideas to these gates at ingest.

### 9.5 Querying and verification

- `sortIdeas`: `priority` desc, then `created_at` desc, then `id`: a total order, stable across restarts.
- `filterIdeas(ideas, {status, pillar, persona, funnel, shape, source, timeliness, since, until, q})`:
  list filters are CSV; `q` matches normalized text.
- `isUnverifiedExternal(idea)` is true when `source.type` is `radar` or `competitor` and
  `grounding.verified_at` is missing. **Such an idea cannot be approved or generated** (409, "re-run the
  radar"). The stamp is written only by the engine's verifier at ingest (reference 8).

## 10. `/api/[tenant]/ideas` (module `ideas`, no AI, no-store)

- **GET** `?status&pillar&persona&funnel&shape&source&timeliness&since&until&q&limit` →
  `{ok, ideas, total, counts:{per status}, taxonomy, shape_mix, updated_at}`. Archived ideas are
  hidden unless a status filter asks for them.
- **POST** creates a manual idea: 503 if the taxonomy is unreadable. It **strips any client
  `grounding`** (`stripClientFields`: no record may claim a verified source), defaults `source` to
  `{type:"manual"}`, validates strictly (422 with errors), and calls `insertIdea(…, {allowSaturated:true})`
  under `withStore`. Required for a manual idea: `text` (8–600 chars), `pillar_id`, `shape_id` and at
  least one `brand_associations` id (the intentionality gate; 422 "pick what this reinforces" without
  it). Optional: `persona_ids`, `funnel_stage`, `core_lesson`, `angle`, `suggested_hook`,
  `suggested_cta_id`, `timeliness`, `priority`. It returns 201 `{created:true, idea}`, or **200** `{created:false, deduplicated:true,
  rule, duplicate_of}`: a duplicate is a normal outcome, not an error.
- **PATCH** `{id, ...fields}`: `status:"rejected"` requires a `rejection_reason` of at least 3
  characters (422 otherwise). It **strips `source` and `grounding`** (provenance is not editable), so
  a radar idea cannot be retyped as manual to dodge verification. Approving an unverified external
  idea → 409. Rejected stores the reason; any other status clears a stale one. `reviewed_at` is set on
  approved, rejected and reviewing.
- **DELETE** `?id` archives (soft, reversible); `&permanent=1` really removes it.

## 11. The ideas UI ("decide what gets made")

- Big stats: waiting (new + reviewing), approved, produced, total. Status pill tabs with counts.
- Filters: search, pillar, persona, funnel, shape, source, timeliness; a clear button; a
  narrowed-count readout. The 30-day **shape mix** as a row of chips, with the largest share
  highlighted past ~40%. Seeing "7 of the last 10 are tool tryouts" lets the owner steer before a gate
  has to fire.
- Empty states for: all archived / none in this status / none for this filter / none yet ("they appear
  when the radar runs").
- **IdeaCard**: status chip, source tag, timeliness badge, "seen ×N" when `seen_count > 1`, a source
  link; the shape's **human label** above the text (never the raw id). A grounding box shows what
  happened, why it matters, the differentiator, the source host and date, the **verbatim evidence
  quote**, and a green "verified" line. For a competitor idea it reads "what worked for them / why we
  want our own version / what we do differently". An amber **unverified** warning disables approve and
  produce, with a hint. Then the hook (a pull-quote), the angle and the rationale; taxonomy tags
  mapped to **the kit's labels** (fetch `/strategy` once, falling back to the draft); a dashed "no CTA"
  tag when there is none; proof assets; the rejection reason; produced paths.
- **"Add an idea" form** (the one manual entry point): a textarea for the idea, then pickers filled from
  the kit's LABELS: pillar (required), shape (required), associations (required, multi-select chips),
  personas and funnel (optional), an optional hook and angle, and a CTA picker whose first choice is
  "no CTA". Submit is disabled, with the missing field named under it, until the required ones are set.
  A `deduplicated` answer opens the existing idea instead of showing an error.
- Actions: Approve · Reject (an inline textarea; the reason is **required** before confirm) · Restore
  (rejected or archived → new) · Edit · Archive. **Produce buttons appear only on approved ideas**, and
  only for the formats this tenant enabled. A button that 409s is a bug you shipped, not a guardrail.

## 12. Terminal tools (Lite Mode, the cron, one-time imports)

Each takes `--tenant <id>` (`requireTenant`, no default) and imports the SAME core modules as the app.
- **`engine/tools/approve-kit.mjs --tenant <id> [--sha <hex>]`**: without `--sha` it prints the draft's
  path, a short summary (positioning, pillars with shares, shapes, no-gos) and its sha256, and exits 0
  without changing anything. With `--sha` it calls `approveDraft(root, {expectedSha256})` and prints the
  result. The two-step form is the terminal version of "approval signs the bytes you reviewed".
- **`engine/tools/ideas.mjs --tenant <id> list [--status s] | add --text "…" --pillar p --shape s
  --assoc a[,b] | approve <id-or-prefix> | reject <id-or-prefix> --reason "…"`**: `withStore` +
  `validateIdea` (strict) + `insertIdea` (`allowSaturated:true` for a human add) + `findIdea`. Approving
  an unverified radar idea is refused, exactly as in the app.
- **`engine/tools/import-ideas.mjs --tenant <id> <file.json|file.md> [--apply]`**: a one-time import of
  an existing backlog (B8). Dry run by default: it prints what it would insert, deduplicate or reject.
  Each item goes through `validateIdea(…, {soft:true})` (unknown ids are dropped with a warning, never
  invented) and `insertIdea` under `withStore`, with `source.type = "legacy-import"` and status `new`.
  A Markdown backlog is read one idea per list item; anything ambiguous is skipped and reported, never
  guessed.

## 13. Lessons

- **One renderer, shared by the app and the cron**, read fresh per request. Five copies drift.
- **The positive shape gate.** A typo that still parses must read as "no kit", not as an
  authoritative block over empty guardrails, because that also defeats the cron's emptiness check.
- **AI proposes, the owner approves, AI never writes the kit.** The agent RETURNS a fenced block; the
  ROUTE validates and writes the draft; only the owner's click promotes it.
- **Approval signs the exact bytes.** Promoting "whatever is on disk at click time" let an edit that
  landed between review and click go live unseen (found in a live audit). Read once, then hash,
  validate and write the same bytes.
- **Validate the structure, then the function.** A kit that validates but doesn't load is what the
  post-promotion check catches; it rolls back.
- **Every taxonomy list must be non-empty with unique ids.** With an empty list, no idea can ever
  validate. Only `offers` may be empty.
- **Interview mode belongs to the chat record**, and validation errors go back into the chat, so the
  next turn fixes them.
- **The research agent may choose defaults, but must flag each one** in "you must confirm", which is
  shown above the Approve button.
- **Ideas get uuids.** The old system scraped markdown and used array positions as ids, so nothing
  could attach to an idea and every id changed whenever the file was edited.
- **Corrupt is not empty.** Quarantine before writing.
- **Shape and lesson are separate axes**, and the scout is told up front what's full.
- **Rejecting requires a reason**, which makes the queue auditable. `produced` is set only on a
  successful generation.
- **`verified_at` is an engine stamp**, stripped from POST and PATCH.

## Checkpoint (before Stage 4)

```bash
node engine/tools/strategy-block.mjs generate --tenant <id> | head -20   # draft only → the FALLBACK, by design
node --test engine/tools/tests/*.test.mjs
```
Tests to have written by now: the renderer (every scope; fallback on a missing or `{}` kit;
tenant-neutrality across two kits; fonts as object/array/string), approval (sha mismatch → 409; a
symlinked draft → 422; invalid → 422 with errors; success writes the same bytes and keeps `.prev`; a
kit that cannot load → rolled back), and the store (round-trip; a duplicate resurfaces instead of
inserting; a rejected twin is still a duplicate; a 4th same shape+pillar is refused unless
`allowSaturated`; a 3rd same lesson is refused; a truncated `ideas.json` is quarantined on the next
write; PATCH without a reason → 422; a POST with `grounding` stores no `verified_at`).

Then make a **test copy** (`node engine/tools/new-tenant.mjs zz-test --from <id>`, where `<id>` has a
draft), approve its draft with `approve-kit.mjs --tenant zz-test` then `--sha <the printed hash>`,
confirm `strategy-block.mjs generate --tenant zz-test` now prints the real block, and
`rm -rf tenants/zz-test`.
