# Reference 6: Production, export, «edit» and the product library (Stage 5)

Production turns an approved idea (or a library product, or the owner's own brief) into a finished
piece on disk. **The agent writes words and code; the engine does everything that executes.** Because
the spawned agent has no shell, every executable step runs in the ROUTE: scaffolding before the agent
spawns, and exporting or rendering after it exits, through engine-owned scripts no agent can write.

```
engine/app/src/lib/
  gen-jobs.ts        job engine: startGen · settle · discardEmptyDraft (+ media engines, reference 7)
  scaffold-core.mjs  scaffoldProject · nextFreeSlug · promoteHtmlPost · readCaption · kitVisual · tenantHandle
  edit-core.mjs      single-post edit file ops: snapshot · restore · keepPrevious · swapPrevious · diffCopy
  library-core.mjs   products CRUD · markMade · markPublished · pickProductForToday · suggestFormat
engine/app/scripts/export-project.mjs        TRUSTED Playwright exporter (asset; reference 3 §6)
engine/app/src/app/api/[tenant]/{generate,edit,gallery,piece,asset,scripts,hooks,library,library/photo,proposal}/route.ts
engine/app/src/components/ScriptEditor.tsx   the script reader/editor + "generate hooks" (§10)
engine/skills/tenant/{carousel-builder,story-builder,presentation-builder,script-builder,animation-builder}/SKILL.md
engine/tools/scaffold.mjs                    CLI: node engine/tools/scaffold.mjs <carousel|story|presentation> <slug> --tenant <id>
```

**The tenant's output layout:**
```
content/carousels/<slug>/      <slug>.html · export.mjs (for humans only) · assets/ · png/slide-NN.png · caption.md · meta.json
content/stories/<slug>/        same shape, 1080×1920
content/presentations/<slug>/  same shape, 1920×1080 (a live-presentable deck)
content/posts/<slug>/          post.png · post.json · caption.md · meta.json · [raw/] · [source/] · [prev/]
content/reels/<slug>/          reel.mp4 · poster.png · reel.json · caption.md · meta.json   (video-model)
content/reels/<slug>.md        a written reel brief for a human to film (reel-idea)
content/scripts/<slug>.md      a script
content/videos/<slug>/         browser-driven video project (reference 7)
content/animations/<slug>/     Remotion project (reference 7)
library/products/<slug>/       product.json + photo-NN.<ext>
brand/templates/<type>.html    optional per-tenant starter ({{slug}} {{accent}} {{handle}})
```
**Fixed canvases:** carousel 1080×1350 · story 1080×1920 · presentation 1920×1080 · single post 1080×1350
(4:5). Export is always at `deviceScaleFactor: 2`, so a 1080×1350 slide is written as a 2160×2700 PNG.

### Every output format, end to end

A format is offered only when this table has a row for it. Each one says where the piece lands, who
builds it, where the owner finds it, and what the JobDock's "see result" opens.

| format | collection | scaffold | builder skill | appears in | "see result" |
|---|---|---|---|---|---|
| `carousel` | `content/carousels/<slug>/` | `scaffoldProject` | carousel-builder | Carousels view, gallery | the Viewer on that piece |
| `story` | `content/stories/<slug>/` | `scaffoldProject` | story-builder | Stories view, gallery | the Viewer |
| `presentation` | `content/presentations/<slug>/` | `scaffoldProject` (deck starter) | presentation-builder | Presentations view, gallery | the Viewer (stills); "present" opens the HTML deck |
| `single-post` (html) | built in `carousels/`, promoted to `content/posts/<slug>/` | `scaffoldProject` + `promoteHtmlPost` | carousel-builder (exactly one slide) | gallery | the Viewer |
| `single-post` (image-model) | `content/posts/<slug>/` | mkdir + `meta.json` | none (a `post-copy` block, ref 7) | gallery | the Viewer |
| `script` | `content/scripts/<slug>.md` | none (the DONE line) | script-builder | Scripts view | the ScriptEditor on that script |
| `reel-idea` | `content/reels/<slug>.md` | none (the DONE line) | script-builder (its "reel brief" section) | gallery, as a text card; Scripts view when enabled | the Viewer in text mode (`/piece` returns `text`) |
| `reel-video` | `content/reels/<slug>/` | mkdir | none (a `reel-copy` block, ref 7) | gallery | the Viewer (video) |
| `ai-video` | `content/videos/<slug>/` | ref 7 | none (a `storyboard` block) | Videos view | the Videos view |
| `animation` | `content/animations/<slug>/` | ref 7 | animation-builder | Animations view, gallery | the Viewer (video) |
| `community-post` | `research/radar/community/<date>.md` | none | none (the text profile, ref 8 §14) | home | home |
| `thumbnail` | **not specified by default.** To offer it: add a `thumbnails` collection `{w:1280, h:720, mode:"element"}` to the exporter's `COLLECTIONS` and to `PROJECT_TYPES`, a thumbnail-builder skill, a row in `/piece` and the gallery, then remove this sentence. Until then the exporter exits 2 for it and no PNG is ever made, so leave it out of `formats`. | | | | |

The gallery lists every collection above that the tenant's `formats` enable: cover-bearing pieces as
image cards, `.md` briefs as text cards (first heading + first lines). A piece without PNGs is still
listed, with a "built, not exported" badge and Re-export.

## 1. Gates (in this order)

1. 403 in production. Resolve the tenant; `brandGate`.
2. A `type` not in the manifest's `formats` → **404** (unreachable, not just hidden). A missing engine
   → **409** (`reel-video` needs `video-model`; `ai-video` needs `browser-video`; `animation` needs
   `remotion`). `single-post` without `image-model` is built as one HTML slide.
3. **One job per tenant.** If one is running → **409, said out loud**: `{error, running:true, same, job}`,
   where `same` is true when it is the same type and the same idea or product. A double click is then
   told "this very piece is already on its way". The format gate runs first, so a format the tenant
   can never make gets 404, not "wait".
4. The brief source:
   - `product_slug`: the product must exist (404) and have ≥1 photo (409). The product is the brief.
   - `idea_id`: the idea must exist (404), be `approved` (409, with the current status), and not be an
     unverified external idea (409).
   - Otherwise only `{idea, allow_untracked:true}` (the owner's own raw brief) is accepted; anything
     else is 400. This escape hatch is explicit, never the default.

## 2. The job engine (`gen-jobs.ts`)

```ts
type GenType = "carousel"|"story"|"presentation"|"script"|"thumbnail"|"single-post"|"reel-idea"|"reel-video"|"ai-video"|"animation";
interface GenJob { status: "running"|"done"|"error"; logs: string[]; startedAt: number; finishedAt?: number; code?: number;
  idea: string; type: GenType; ideaId?: string; producedPaths?: string[]; productSlug?: string }
// one per tenant, on globalThis so it survives dev-server HMR and page reloads
const store = globalThis as unknown as { __genJobs?: Map<string, GenJob>; __genChildren?: Map<string, ChildProcess> };
const MAX_LOGS = 600;   // oldest dropped
```
`POST /generate` starts the job and returns immediately; the child keeps running past the response.
`GET` returns the job or `{status:"idle", logs:[]}`, and the UI polls it and re-attaches after a
reload. `DELETE` sends SIGTERM to the child, marks the job `error` with a "stopped" line, and runs
`discardEmptyDraft`.

### `startGen(t, ideaText, type, record, product)` → error string | null

1. **The route scaffolds before any spawn** (the agent cannot):
   - carousel / story / presentation / HTML single post → `scaffoldProject(...)`. A product's photos are
     copied into `<project>/assets/`, so the agent embeds them by relative path and `file://` stays
     inside the tenant for the exporter's firewall.
   - image post → `mkdir content/posts/<slug>` + `meta.json`; reel → `content/reels/<slug>`; ai-video,
     animation → reference 7.
   - Every path handed to the agent is RELATIVE to its cwd (the tenant root).
   - A scaffold failure → 409, with nothing left on disk.
2. **The route chooses the slug, never the agent**: `<prefix>-<YYYYMMDD>-<first 6 alnum of the idea id
   | product slug | random>`, passed through `nextFreeSlug(root, collections, base)`, which returns
   `base`, `base-2`, `base-3`… free across **every** collection the piece may end up in. Posts check
   `posts` and `carousels`, because an HTML post is built as a carousel and then moved. A redo on the
   same day therefore gets `-2`, not a 409.
3. `meta.json` = `{title, hook, idea_id, product, type, slug, created_at}`. On success it is patched
   with `headline` (the first `<h1-3>` of the first `.slide`, the post copy's headline, or the
   animation title), so two drafts of one product read apart in the gallery.
4. Spawn `spawnTenantAgent(t, "build", {maxTurns: 60, stream: true})`, write the prompt (§4) to stdin,
   end it. Follow the spawning checklist in reference 3: the stdin error listener, `setEncoding`, a
   tail buffer, identity binding.
5. Parse stream-json: assistant text goes to the log; a `tool_use` becomes a short "🔧 <name>" line;
   the final `result` repeats the last text, so push it only when it differs. Strip `${t.root}/` from
   every line. Ignore stdout once the job is no longer running.
6. On close: a non-zero exit → "agent stopped" and `settle(false)`. Exit 0 → the per-type
   post-processing (§3), then `settle(ok)`.
7. `settle(succeeded)`, guarded by identity and `running`:
   - Set the status and `finishedAt`.
   - On failure: `discardEmptyDraft(root, producedPaths[0])` removes a folder that nothing shows (a
     scaffold with no PNG, a post with no `post.png`, a reel with no `reel.mp4`), so the next try isn't
     `-2`. It never removes a written `.md` brief or a video storyboard.
   - On success with a product: `markMade(root, slug, {type, path, idea_id})`. A generated piece is a
     draft and does not count as posted.
   - On success with an idea: under the ideas mutex set `status:"produced"`, `produced_at`, and merge
     `produced_paths`. **Only on success**; on failure the previous status stays, with the reason in
     the log.
   - **The last log line is the outcome in plain words**: "✅ <title> ready — N slides" or
     "✗ <title> did not finish — reason above". The JobDock shows it as the result.

## 3. Per-type post-processing (after the agent exits 0)

| type | the agent returns | the engine then does |
|---|---|---|
| carousel / story / presentation | the scaffolded HTML + `caption.md` | `runTenantExport(t, project.dir)` → `png/slide-NN.png`. **Paths come from the ROUTE**, never from the agent's DONE line. A failed export turns the job red: a carousel with no PNGs is not done |
| single-post (HTML) | one `.slide` in a scaffolded carousel | export, then `promoteHtmlPost` → `content/posts/<slug>/` |
| single-post (image-model) | a ```` ```post-copy ```` JSON block | reference 7 |
| reel-video / ai-video / animation | a ```` ```reel-copy ```` / ```` ```storyboard ```` block / code | reference 7 |
| script / reel-idea | a `.md` file + a last line `DONE → <path>` | parse the DONE lines (`/DONE\s*(?:->\|→)\s*(\S+)/g`, strip quotes and backticks, dedupe) and check that each file exists. No DONE line = failure |
| thumbnail | an HTML project | the exporter exits 2 (no trusted exporter for it): logged as info, not a failure |

Fenced blocks are extracted with `/```<tag>\s*\n([\s\S]*?)\n```/` from the joined log. A missing or
invalid block fails the job with a precise message.

## 4. The generation prompt (`buildPrompt`)

1. `You are the content producer for <name> (workspace "<id>"). Your working directory is this
   workspace's folder; every path below is relative to it.`
2. `renderStrategyBlock("generate")`, fresh from the kit.
3. **The approved idea as an explicit brief**: this is most of the quality difference between a good
   piece and a generic one.
   ```
   ## THE APPROVED IDEA — produce THIS, not your own interpretation
   Idea: <text>
   Pillar: <label> · Funnel: <stage> · Personas: <labels> · Shape: <label>
   Reinforces: <associations>              ← the piece must visibly do this
   Angle: <angle>
   Suggested hook (improve only if you can beat it): <suggested_hook>
   Stand on this proof — and nothing else: <proof_assets>
   CTA: <offer name + keyword | "NONE — deliberately a no-CTA piece. Do NOT add one.">
   Timeliness: <level><, expires …>   Source: <title · url>
   ```
   ⚠️ **A null CTA must be spelled out as "NONE — do not add one".** Left implicit, the model reads a
   blank field as an omission to fill and appends an invite to a piece designed without one.
4. How to produce: declare the pillar, persona and funnel stage; the **intentionality gate** (name the
   association it reinforces, or STOP); apply the CTA rule literally; ground claims in the proof bank,
   and where there is no proof, say less (or use the kit's `proof_bank.no_proof_framing` when it has
   one); read the brand docs and the matching skill; notes in the owner's language, short, never an
   internal id.
5. Where (scaffolded types): "Your project is ALREADY scaffolded at `<dir>`. Build inside `<html>`, one
   `<section class="slide">` per slide. Don't create folders or rename files. You have no shell; the
   engine exports after you finish." For a story with a design source: "Open `<file>` first; keep its
   fonts, tokens, background, accents and footer, and re-lay it for 1080×1920 with the content in the
   250–1620 px band."
6. The task per type: the skill name; slide counts (carousel 6–10, story 3–6, single post EXACTLY one);
   "write `<dir>/caption.md`: caption text only, no heading, quotes or labels, CTA rule applied".
7. With a product: the product brief (§9).

**Prompt-handoff mode** (an agent that cannot spawn or cannot be confined): write the same prompt to
`<dir>/PROMPT.md`, return, and show it. An "I ran it, refresh" button runs the export and settles the
job. Every gate above still applies.

## 5. Scaffolding (`scaffold-core.mjs`)

`scaffoldProject({tenantRoot, tenantId, tenantName, accent, type, slug, meta, designFrom})`:
- `PROJECT_TYPES = {carousel:{collection:"carousels", w:1080, h:1350}, story:{stories, 1080, 1920},
  presentation:{presentations, 1920, 1080}}`. Slug regex `^[a-z0-9][a-z0-9-]{1,60}$`. Throws if the
  folder exists. **All or nothing**: any failure `rm -rf`s the folder.
- It creates `assets/`, `png/`, `<slug>.html`, `export.mjs` (a human convenience that **the server
  never executes**) and `meta.json`.
- The HTML source, first match wins:
  1. `brand/templates/<type>.html` with `{{slug}} {{accent}} {{handle}}` filled in.
  2. A story: the tenant's `carousel.html` template re-sized to 1080×1920 by an injected `<style>`,
     with a note to keep text out of the top 250 / bottom 300 px.
  3. A story: `designFrom`, the head and FIRST slide of the latest exported carousel of the same
     product, else of the tenant's latest exported carousel, so stories look like the same series.
  4. A **tenant-neutral starter**: `lang`/`dir` from `settings.lang` / `settings.dir` (tenant.json), `:root` tokens from the
     accent, light or dark from `visual_system.background`, fonts from `visual_system.fonts`, a
     placeholder hook slide and a footer with the handle.
- **The starter HTML is self-contained.** Playwright loads it over `file://` with no bundler, so the
  token block and a Google Fonts `<link>` are inlined into every piece. Never link the app's CSS
  across the tree.
- **Fonts**: keep a table of Google Fonts **with the weights each family really has**. Requesting a
  weight a family lacks fails the WHOLE CSS request, and every font falls back. Without a linked font,
  `document.fonts.ready` resolves instantly and non-Latin text renders in a fallback face.
- `tenantHandle`: the kit's Instagram `handle`, else the first `@handle` in that platform's text, else
  the tenant name.
- The presentation starter is a full-screen deck: one `.slide.active` at a time, arrow keys / space /
  click to navigate, a progress bar, slide numbers. It is presented live; its PNGs are stills.
- `promoteHtmlPost({tenantRoot, projectDir})` turns `content/carousels/<slug>/` into
  `content/posts/<slug>/` = `post.png` (a copy of slide-01) + `source/` (the whole project) +
  `caption.md` + `meta.json` + `post.json {type:"single-post", engine:"html", …}`. The gallery, viewer
  and publisher then treat it exactly like an image-model post.
- `readCaption(dir)`: `caption.md`, else the `.caption` of post/reel/video JSON, else an
  `<!-- caption: … -->` comment in the HTML.

## 6. The exporter

Ship `assets/export-project.mjs` (reference 3 §6 explains the firewall). The route runs it through
`runTenantExport`, **never** `node <project>/export.mjs`: that file is agent-authored, and running it
would move the shell leak one step sideways. Its tests are in reference 3 §12.

## 7. Builder skills shipped to tenants (`engine/skills/tenant/*`)

They are copied into `tenants/<id>/.claude/skills/` when a tenant is created. The real tenants were
created in Stage 1, before these skills existed, so **finish this stage with
`node engine/tools/sync-tenant.mjs --all`**, and run it again after every later edit to
`engine/skills/tenant/*`: edit the engine copy, then sync. Agents can't edit them (`.claude/**` is write-denied, because skill frontmatter can run
a shell). A tenant's look lives in `brand/templates/<type>.html` and `brand/<type>-rules.md`, which the
skills read and the chat agent may edit. For a runtime agent with no skills system, write the same
files as `builders/<name>.md` and make the prompt say "Read and follow".

**carousel-builder**:
- Design from `visual_system` and the template. Build inside the scaffolded HTML. Hook first, one idea
  per slide, a proof slide only with real proof, last slide = the CTA rule, the footer handle on every
  slide.
- **Phone scale** (a 1080 px slide is seen at ~390 px): hook 96–140 px; slide headline ≥76; support
  ≥38; list ≥40; label ≥30; footer ≥24. Nothing readable below 30 px. ≤25 words per slide.
- **Fill the canvas** (never leave the bottom 40% empty). **At least 3 different layouts.**
- Contrast ≥4.5:1 for body text, ≥3:1 for display. ≥72 px side padding.
- **Nothing overlaps text**: decoration stays in normal flow. The agent cannot see the PNG before the
  export.
- Arabic: no negative letter-spacing, line-height ≥1.4, «» quotes, **one numeral system per piece**,
  **no tatweel**, **no middle dot next to Arabic-Indic digits** (it reads as a digit).
- Emoji follow the kit's emoji policy (`voice.hard_rules`); when the kit says nothing, use none. Every
  claim traces to the brief, the kit or the product. A self-check before DONE.

**story-builder**: the same rules at 1080×1920; 3–6 frames; safe zones top 250 / bottom 300 px
(footer and counter included); headline ≥96, support ≥44, label ≥32; ≤20 words per frame; the same
series look as the carousels; the last frame follows the CTA rule; `caption.md`.

**presentation-builder**: a full-screen deck built inside the scaffolded starter (one `.slide.active`
at a time, keyboard navigation, the progress bar and slide numbers already there); 8–15 slides at
1920×1080; one idea per slide, headline ≥64 px, body ≥32 px, ≤40 words per slide; speaker notes, if
any, in `<aside class="notes">` (hidden on screen); the brand's fonts and tokens; the CTA rule on the
last slide; `caption.md` holds a one-paragraph summary. It is presented live; its PNGs are stills.

**script-builder** (if `script` or `reel-idea` is enabled): a script in the brand voice, following
`script_principles` (hook window, length), one idea per line, the CTA rule applied (a no-CTA script is
valid), saved to `content/scripts/<slug>.md` with a `DONE →` line. Its **reel brief** section covers
`reel-idea`: a brief a human films from (the hook line, the shots in order, on-screen text per shot,
the spoken lines, the caption), saved to `content/reels/<slug>.md` with a `DONE →` line. Scripts and
briefs are text: never auto-render them as images.

**animation-builder**: reference 7.

## 8. «Edit»: `POST /api/[tenant]/edit` (Server-Sent Events)

- Body: `{type, slug, change}` or `{type, slug, undo:true}`. `type` maps to a collection (single-post →
  `posts`, animation → `animations`). Slug regex; 404 if missing; `change` is required and ≤2000 chars.
- **One edit per piece at a time**: `globalThis.__editLocks: Set<"tenant:path">` → 409. The lock is
  released when the work ends, not when the stream closes.
- SSE events: `{log}`, `{step:"agent"|"export"|"render"|"caption"}`, then `{outcome, ok, noop,
  changed:{image, caption}}`, `{done, code}`, and `[DONE]`. **Closing the viewer cancels the STREAM, not
  the edit**: the work still lands on disk, the next open shows it, and `send` never throws on a closed
  stream.
- The agent runs on the build profile with 40 turns. Every prompt includes the `edit`-scope strategy
  block; "the smallest change that satisfies the request; don't redesign; don't add or remove a CTA
  unless asked"; the honesty line (no invented number, result, price, client, product detail or
  first-person claim); "you have no shell"; and two final lines: `CHANGED: <one line in the owner's
  language>` and `DONE -> <dir>/`.
- **Project pieces**: snapshot the bytes of every `.html` and `caption.md`, run the agent, diff. No
  change → noop, with the agent's own CHANGED line as the reason. Caption only → done, no re-export.
  HTML changed → `runTenantExport`. An export failure says "edited but export failed; the old images
  are kept".
- **HTML single post**: snapshot `post.png`, `post.json`, `caption.md` and `source/<html>`. The agent
  may edit only the source HTML and the caption; restore anything else it touched. Re-export, copy
  slide-01 back as `post.png`, and restore everything on failure.
- **Image-model post**: reference 7.
- **Undo for single posts**: on success, `keepPrevious` stores the snapshot under `prev/` (**never as
  siblings**: the publisher sends every top-level PNG, so a sibling `post.prev.png` would go out as a
  second image). `swapPrevious` swaps current and previous, so pressing undo twice is a redo. A file
  that didn't exist before is removed.
- Writes are atomic (temp + rename). `touch()` the image afterwards: the viewer busts its cache on
  mtime, and a rename keeps the old mtime.

## 9. The product library and the daily proposal (`library` module)

- `library/products/<slug>/product.json` = `{name, description, price|null, url|null, category|null,
  tags[], created_at, updated_at, made:[{at, type, path, idea_id}], published:[{at, type, path,
  channel}]}`. Photos sit alongside it as `photo-NN.<ext>`, numbered after the highest existing one
  (so deleting photo-02 never makes photo-03 collide). `slug` and `images` are derived on read.
- `createProduct` refuses a same-name twin (409) and never merges. `updateProduct` changes only the
  fields sent; an empty price or url clears it. Writes are atomic.
- **Two histories, two facts.** `markMade` runs on a successful generation (a draft the owner may
  throw away). `markPublished(root, piecePath, {channel})` is called by the publisher on a real
  publish; it finds the product whose `made` contains that path, and a second channel within 10 minutes
  counts as one post. **"Never posted" means never PUBLISHED**, so a discarded draft never pushes a
  product out of the rotation.
- `pickProductForToday`: only products with ≥1 photo; first, never made and never published, oldest
  first; otherwise the least recently published, with ties broken by least recently made.
  `suggestFormat`: a carousel if there are ≥3 photos or the description is >220 chars, else a single
  post (a carousel when there's no `image-model`).
- `GET /proposal` → `{product, format, engine, reason, last_posted_at, last_made_at, blocked}`. One
  click POSTs `/generate {product_slug, type}`.
- **The product brief** in the generation prompt ("THE ONLY source of truth"): name, description,
  price ("not given — never mention a price"), link; every photo path **with its pixel size** (under
  ~800 px on the short side it is SMALL and must be shown whole, never cropped for a detail). Never
  invent a material, dimension, discount, delivery promise or feature. **No promises or guarantees.**
  **Never draw the product with CSS or SVG.** Each photo is used once, so N photos allow at most N photo
  slides.

## 10. Route contracts (the views depend on these)

| Route | Contract |
|---|---|
| `GET /gallery[?type=<format>]` | `[{type, slug, dir, cover, count, mtime, headline, text?}]`, newest first, for the enabled formats only; `cover` is the first PNG (or `poster.png`), `text` the first lines of a `.md` brief. Reads never throw. |
| `GET /piece?type=<format>&slug=<slug>` | For the Viewer. `type` maps to a collection (the table above); slug `^[a-z0-9][a-z0-9-]*$`, else 400. Returns `{type, slug, dir, images:[{path, mtime}] (sorted numerically), caption, video|null, title|null, text|null, edit}`. A `reel-idea` returns `text` (the brief's markdown) after checking that the real path sits directly under this tenant's `content/reels/`. `caption` comes from `readCaption`. For a single post, `edit = {kind:"html"|"image"|null, reason?, prev:{path, mtime, same}|null}` says how «edit» works on it and whether an undo version exists (`same` = only the caption changed last time). A missing piece → `{images:[], …}`, never a 500. |
| `GET /scripts` · `GET /scripts?slug=` · `POST /scripts {slug?, content}` · `DELETE /scripts?slug=` | Module `scripts`. The list is `[{slug, title (first heading, else first line ≤90 chars), mtime}]` newest first, from `content/scripts/*.md` (README skipped). A single script returns `{slug, content}`. POST creates or overwrites; the slug is sanitised to `[a-z0-9-]{1,60}` or generated. Every slug is stripped to `[a-z0-9-]` before it touches a path. |
| `POST /hooks {script}` | Module `scripts`. 403 in production; `brandGate`; `script` required (400) and cut to 6,000 chars. One-shot: `spawnTenantAgent(t, "text", {maxTurns: 1})`, the stdin error listener BEFORE the write (reference 3 §3), the prompt = `renderStrategyBlock("hooks")` + `brand/voice.md` and `brand/hooks.md` if they exist + the script in a quoted block + "write the 20 best hooks for this video in the brand voice, varied (proof, contrarian belief, a question, curiosity, regret), never opening on the topic itself; one per line, numbered 1–20, nothing before or after" (in the owner's language). Returns `{text}` (the numbered list) or `{error}` with an owner-language sentence when nothing came back. |
| `GET /library` · `POST /library` (JSON, or multipart with `photo` files) · `PATCH` · `DELETE` | Module `library`. Products CRUD (§9). **Upload**: multipart field `photo`, one or more files; allowed types png, jpeg, webp (by MIME type AND extension); ≤15 MB each; ≤20 photos per product; each saved as `photo-NN.<ext>`, numbered after the highest existing number (deleting photo-02 never makes photo-03 collide) and never overwriting. |
| `GET /library/photo?slug=&file=` | Serves one product photo: `slug` and `file` contain no `/`, the normalised path stays under `library/products/`, the extension is png/jpg/jpeg/webp, else 403. |

**The ScriptEditor** (Scripts view): a markdown textarea with a rendered preview, Save (`POST /scripts`),
and **«generate hooks»**, which posts the current text to `/hooks` and shows the 20 lines with a copy
button per line. It is a reader and editor for text; a script never opens the image Viewer.

## 11. System dependencies

Node + pnpm; Playwright Chromium (`pnpm exec playwright install chromium` once); the runtime agent CLI.
Optional engines: reference 7.

## 12. Lessons

- **No shell for the agent; the route scaffolds before and exports after.**
- **Never execute a file under a tenant.** Run the trusted exporter, passing the project dir as data.
- **One singleton job per tenant on `globalThis`**, bound by identity, with the stdin error listener.
- **A second click is always a 409 said out loud**, carrying the running job. Check the format gate
  first.
- **The route picks the slug**, free across every collection the piece may land in. Never trust a path
  the agent printed for scaffolded types; only `.md` outputs use the DONE line.
- **Clean up empty drafts on failure** so the retry isn't `-2`, but never a written brief.
- **An idea becomes `produced` only on success.**
- **A failed export turns the job red**; exit 2 ("no exporter") is informational.
- **Product truth rules come from real failures**: pixel sizes, no CSS-drawn products, one use per
  photo, no promises.
- **Stories look like the same series** as the carousels.
- **A font weight the family lacks kills the whole font request.** Await `document.fonts.ready` plus a
  settle.
- **Builder skills carry minimum phone-scale sizes, "fill the canvas", "≥3 layouts" and "nothing
  overlaps text"**, because the agent can't see the PNG and earlier outputs had half-empty slides,
  collisions and unreadable text.
- **Edit = snapshot → agent → diff → engine re-export → swap only on success.**

## Checkpoint (before Stage 6)

First: `node engine/tools/sync-tenant.mjs --all`, then `ls tenants/<id>/.claude/skills/carousel-builder/SKILL.md`
(and every other builder skill this tenant's formats need) **for every real tenant**. A missing skill
means generation silently runs without its rules.

On a **test copy** tenant with an approved kit (`node engine/tools/new-tenant.mjs zz-test --from <id>`):
approve one idea, generate a carousel from the Carousels view, and verify:
1. `content/carousels/<slug>/png/slide-01.png` exists at **2160×2700**.
2. **Open the PNG and look at it** (if your file reader shows images). Non-Latin text must render in
   the brand font, not a system fallback. If it fell back, the piece is missing its font `<link>` or
   asks for a weight the family lacks. **If you cannot view images, ask the user** to open the PNG and
   confirm the font, that text is legible at phone size, and that nothing overlaps.
3. The piece carries exactly the CTA the record specified, **and none at all if it was null**.
4. The idea flipped to `produced` with `produced_paths`, and the piece appears **in the Carousels view
   without a manual reload** (ask the user to confirm on their running dev server).
5. Force a failure (kill the job mid-run): the status did **not** flip, the empty folder is gone, and
   the dock shows the reason.
6. «Edit» the piece with a one-line change: the PNG updates; a noop request reports noop with a reason.
7. `rm -rf tenants/zz-test`.
