# Reference 4 — Builders + the HTML→PNG export engine

Each content format is built as **self-contained HTML** in the brand's design system, then screenshotted to PNG with headless Chromium (Playwright). One engine, many formats. The `/api/generate` background job (reference 3) spawns the agent to run the matching builder end-to-end.

## Fixed canvases (from `brand-kit.json.canvas`)
- carousel `1080×1350` · story/short `1080×1920` · presentation `1920×1080` (or full-screen responsive, live-presented) · square `1080×1080`. Use the kit's overrides if any.

## The scaffold script — `content-os/tools/scaffold.mjs`
`node tools/scaffold.mjs <carousel|story|presentation> <slug>` creates `content-os/<collection>/<slug>/` with `assets/` (copies the brand logo), a starter `<slug>.html`, and a ready-to-run `export.mjs`. Kebab-case slug validation.

**The starter HTML must be self-contained** (Playwright loads it over `file://` with no bundler): the scaffold **inlines** the same `:root{…}` design-token block AND a Google-fonts `<link href="https://fonts.googleapis.com/css2?family=<Display>&family=<Mono>&display=swap">` into every generated HTML. Do NOT try to `@import`/`<link>` the app's `design-tokens.css` across the tree — a `file://` relative path is brittle and the dev server won't exist during export. Copy the token values in; that's the "single source."

## The export engine — per-piece `export.mjs`
Playwright chromium, headless, `deviceScaleFactor: 2`. Load the HTML `file://`, wait for `document.fonts.ready` **plus a ~1s settle** (fonts.ready resolves instantly if no font is linked → non-Latin/Arabic text renders in a fallback face, which is why the HTML must `<link>` its fonts), then screenshot **each `.slide`** to `png/slide-NN.png`:
```js
import path from "node:path"; import { fileURLToPath } from "node:url"; import { mkdir } from "node:fs/promises"; import { chromium } from "playwright";
const W = 1080, H = 1350;  // substitute the numeric canvas dims from brand-kit.json.canvas.<format> — do NOT leave symbolic
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = path.join(__dirname, "<slug>.html"); const out = path.join(__dirname, "png"); await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await page.goto(`file://${html}`, { waitUntil: "load" }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1000);
const n = await page.locator(".slide").count();
for (let i=0;i<n;i++){ const num=String(i+1).padStart(2,"0"); await page.locator(".slide").nth(i).screenshot({ path: path.join(out, `slide-${num}.png`), animations:"disabled" }); }
await browser.close();
```
**Playwright needs its browser binary** — installing the npm package does NOT download Chromium. Run `pnpm exec playwright install chromium` once (Stage 3.0 does this), or `chromium.launch()` throws "Executable doesn't exist". Install `playwright` at `content-os/app` (or symlink `content-os/node_modules` → the app's) so exports run from anywhere. Presentations **presented live** (a full-screen HTML deck driven by arrow keys / click) are NOT exported — they're opened in a browser.

## Builder specs (one per format, generated from the brand)
Each is a short spec the spawned generation agent follows. All of them: read `content-os/brand/` first, honor voice + no-gos, use the design tokens, respect RTL, **one CTA per piece** (default from the kit).

**Where they live + how the spawned agent loads them** (pick one and make the generation prompt match):
- **Claude Code target:** write each as a real installed skill `.claude/skills/<name>/SKILL.md`, and the prompt can say "use the **<name>** skill" (Claude auto-discovers it).
- **Any-agent target (Codex/Kimi/Cursor — no skills system):** write each as `content-os/builders/<name>.md` and make the prompt say "**Read `content-os/builders/<name>.md` and follow it** to build…". This is the portable default — never rely on a skill named only by string if the target agent can't discover skills.

- **carousel-builder** — multi-slide teaching post at the carousel canvas. Cover hook → value slides (one idea each) → CTA slide. Consistent header/footer with handle. Export PNGs.
- **story-builder** — 1080×1920 sequence: hook frame → value frames → CTA frame. Bold, legible, safe margins for platform UI. Export PNGs.
- **presentation-builder** — full-screen responsive HTML deck (not a fixed box), one slide visible at a time, fade between, driven by →/← or click (no on-screen buttons). Rich component library (title, big-text, cards, terminal, compare, steps). Live-presented; no PNG export.
- **script-builder** — a short-form video script + caption in the brand voice: proof-driven hook, one-idea-per-line body, one soft CTA. Save to `scripts/<slug>.md`.
- **thumbnail-builder** — a single on-brand thumbnail (uses the HTML engine so display text — especially non-Latin — renders correctly). Export one PNG.

## The generation prompt (built by `/api/generate`)

Three parts, in this order. The spawned agent's cwd is `content-os/` (ROOT), so **every path in the
prompt is relative to that cwd** — do NOT prefix `content-os/`.

**1. The strategy block** — `renderStrategyBlock(readKit(ROOT), "generate")` (reference 7a). Never a
hand-written summary in the route.

**2. The approved idea, rendered as an explicit brief.** The route already refused anything not
`approved` (reference 7d), so it has the whole record — pass it, not just `text`. This is most of the
quality difference between a good piece and a generic one:

```
## THE APPROVED IDEA — produce THIS, not your own interpretation
Idea: <text>
Pillar: <pillar_id> · Funnel stage: <funnel_stage> · Personas: <persona_ids>
Reinforces: <brand_associations>            ← the piece must visibly do this
Angle: <angle>
Suggested hook (his voice — improve only if you can beat it): <suggested_hook>
Stand on this proof — and nothing else: <proof_assets>
CTA: <suggested_cta_id ?? "NONE — this is deliberately a no-CTA piece. Do not add one.">
Why it earned a slot: <rationale>
Timeliness: <timeliness.level><expires_at ? " — expires <date>" : "">
```

**3. The task:**
> TASK: <use the **<builder>** skill / Read `builders/<builder>.md` and follow it> to build a complete <format>. Scaffold it (`node tools/scaffold.mjs <collection> <slug>`), build the slides in the design system, then export (`node <collection>/<slug>/export.mjs`). On the LAST line print `DONE → <path>`.

⚠️ **`suggested_cta_id: null` means no CTA.** Say so in the words above, explicitly. Left implicit,
the model reads a blank CTA field as an omission to helpfully fill and appends an invite to a piece
that was deliberately designed without one.

Note the export path is `node <collection>/<slug>/export.mjs` — NOT `node content-os/…` (from cwd=content-os that would resolve to `content-os/content-os/…` and always fail). The `DONE → <path>` line lets the client open the exact result.

## Optional: AI-edit a piece — `/api/edit`
Same background-job pattern: spawn the agent to edit `<collection>/<slug>/<slug>.html` per a natural-language change, then re-export. Prefix the prompt with `renderStrategyBlock(kit, "edit")` so a tweak can't drift the piece off-voice or off-palette. The viewer cache-busts by mtime so edits show without a manual refresh.

## Checkpoint before Stage 5

Approve one idea in the UI, generate a carousel from it, and verify **all four**:
1. `<collection>/<slug>/png/slide-01.png` exists at the right pixel dimensions (`deviceScaleFactor: 2`
   → a 1080×1350 canvas writes a **2160×2700** file)
2. **Open the PNG and look at it.** Non-Latin text must render in the brand display font — if it fell
   back to a system face, the exported HTML is missing its `<link>` to Google Fonts, and
   `document.fonts.ready` resolved instantly because there was no font to wait for
3. the piece carries exactly the CTA the record specified — **and none at all if it was `null`**
4. the idea's status flipped to `produced` with `produced_paths` populated

Then force a failure (rename `export.mjs`) and confirm the status did **not** flip. A failed run that
consumes the idea is worse than one that errors loudly.
