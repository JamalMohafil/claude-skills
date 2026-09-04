---
name: content-os-builder
description: Build a personalized "content OS" for any creator/brand — a local dashboard app (Strategy · Ideas · Radar · Carousels · Stories · Presentations · Scripts · Calendar · Gallery · Analytics · Inspiration · Growth · a brand-aware chat Assistant) — every view a real route, built on one machine-readable brand kit that every AI surface reads, a validated + deduplicated idea store with an approve-before-generate review queue, a live trend-radar, an HTML→PNG export engine, a design system, background AI generation, real Instagram/YouTube analytics (posts, insights, comments, inline playback, click-to-transcribe) and a competitor study library. WORKS WITH ANY CODING AGENT (Claude Code, Codex, Kimi, Cursor…). It ALWAYS runs a brand intake interview FIRST (colors, visual identity, platforms, voice, radar topics, no-gos, API credentials, competitors), then generates the whole OS around the answers. Use when someone says "build me a content OS / content system", "make me something like jamal-os", "a dashboard to run my content", "track my posts and competitors", or "an AI content operating system for my brand".
---

# Content OS Builder

You are an AI coding agent (Claude Code, Codex, Kimi, Cursor, or similar) with **file-write and shell access**. Your job: build the user a **personalized content operating system** — a local web dashboard that turns *idea → plan → produce → publish → learn* into one machine, styled and scoped entirely to **their** brand.

This skill is a **playbook**, not a fixed template. You will INTERVIEW the user, then GENERATE their OS from the answers. Never hardcode another brand's identity, colors, voice, or topics — everything comes from the interview.

> The reference implementation this is distilled from is "jamal-os" (an Arabic applied-AI creator's OS). You are recreating that *architecture*, reskinned for the current user. If this skill lives inside a repo that already has an `engine/` app, you may clone + reskin it instead of building from scratch (see Stage 4).

---

## The golden rule: INTERVIEW FIRST, BUILD SECOND

**Do NOT write a single file until the intake interview is complete and the user has confirmed the summary.** The whole value is personalization. Skipping the interview produces a generic clone, which is a failure.

Run the interview conversationally (ask in the user's language), accept short answers, offer sensible defaults, and let them say "use defaults for the rest." Then echo a compact summary and get a "yes" before building.

The full question set + the `brand-kit.json` schema is in **`references/1-interview.md`**. The condensed intake (ask all of these) is:

1. **Identity** — brand/creator name, @handle(s), one line on what you do, niche, primary language (+ any secondary), is the primary language RTL (Arabic/Hebrew/Farsi)?
2. **Audience** — who you serve, their level (beginner→pro), the topics/interests you cover.
3. **Voice** — tone/register (formal? casual? a specific dialect?), 2–3 do's, 2–3 don'ts, emoji policy, one or two sample lines that "sound like you."
4. **Visual identity** — primary color, accent color, light or dark default (or both), background feel (flat / gradient / editorial), display font, mono/code font, path to a logo or profile image if any. (Optional: a second palette for print/booklets.)
5. **Platforms** — which platforms, in priority order; which formats you post (Reel, Carousel, Story, YouTube long, Short, Presentation, Post, TikTok…); any custom canvas sizes.
6. **Strategy** — your content pillars and their ratio (e.g. 70% teaching / 20% journey / 10% offer), the **2–4 things you want to be known for** (each with a one-line test — this becomes a hard gate on every idea), your funnel stages, your offers, your default CTA, whether it's "one CTA per piece", whether a **no-CTA piece is acceptable**, and the destination you funnel to (community / product / newsletter).
7. **Radar** — the topics/keywords the trend-radar should scout, the sources/competitors/handles to watch, the daily scan time, and hard filters/no-gos (topics to NEVER touch).
8. **Grounding & goals** — real projects/ventures to ground content in, the **proof points you can actually stand behind** (the only things the AI may cite), anything you've **retired and never want repeated**, and the goal metric (followers, subs, revenue).
9. **Analytics & competitors** *(the "never open the app again" layer — optional but high value)* — do you want your own posts + insights + comments pulled in? Which accounts (Instagram Business/Creator? YouTube channel?). Do you have (or can you create) a Meta app + IG Business account, a YouTube API key, an OpenAI key for transcription? Which competitors/creators do you want to study? Should transcription use free YouTube captions where available (cheaper) or always OpenAI?
10. **Ops** — package manager (pnpm/npm), does your agent have shell access + can run a local dev server, **can your agent invoke itself headlessly** (a `claude --print`-style CLI a Node process can `spawn` — this decides whether generation runs automatically or falls back to prompt-handoff), is there a scheduler available (cron/launchd/Task Scheduler), any connectors to wire (Notion, Buffer — optional), and do you want the OS to **draft/schedule posts** or just hand you the assets (default)? Either way state the rule back: nothing is ever posted to a live account without an explicit go-ahead at that moment.

Store every answer in **`content-os/brand-kit.json`** (schema in reference 1). This file is the single source of truth the whole build reads from.

---

## Build stages (after the interview is confirmed)

Work top-to-bottom. **Read the matching reference file before starting a stage**, and **run that
stage's checkpoint before moving on** — each reference ends with one. A stage that "looks done" but
fails its checkpoint fails everything built on top of it, three stages later, somewhere unrelated.
After each stage tell the user what you did in one line.

> Stage numbers and reference-file numbers are **not** the same sequence — references 7 and 8 were
> added later and slot into the middle. Follow this table, not the filenames.

| Stage | What | Reference |
|---|---|---|
| 0 | Probe capabilities | *(below)* |
| 1 | Brand kit | `1-interview.md` |
| 2 | Brand docs + design tokens | `2-brand-and-design.md` |
| **3** | **⭐ Core libs — strategy renderer, idea store, radar contract** | **`7-core-libs.md`** |
| 4 | The dashboard app | `3-dashboard-app.md` |
| 5 | Generation + export engine | `4-builders-and-export.md` |
| 6 | Radar + calendar | `5-radar-and-calendar.md` |
| 7 | Publish + Growth | `8-publish-and-growth.md` |
| 8 | **Assistant (chat)** *(optional but high value)* | **`9-assistant-chat.md`** |
| 9 | Analytics + Inspiration *(optional)* | `6-analytics-and-inspiration.md` |
| 10 | Verify + handoff | *(below)* |

**Stage 0 — Prerequisites (probe three INDEPENDENT capabilities, don't assume).** These are separate axes — test each and pick the matching mode:
1. **Node ≥ 18 + package manager?** No → **Lite Mode** (files + scripts, no web app).
2. **Playwright/Chromium installs?** Try `pnpm dlx playwright install chromium`. Fails → keep the app but **export HTML only** (no PNG rendering).
3. **Can your agent invoke itself headlessly?** (a `claude --print`-style non-interactive CLI that Node can `spawn`.) Many can't — Cursor's composer, Kimi/IDE-plugin chats, sandboxes that forbid child processes. Get this from the Ops interview answer. No → keep the app but degrade generation/radar to **prompt-handoff** (reference 3). This is orthogonal to Next.js/Playwright — an agent with both can still lack self-spawn.

**Stage 1 — Brand kit.** Write `content-os/brand-kit.json` from the interview — **with real ids** on pillars, personas, funnel stages, associations and offers; those exact strings become the validated taxonomy in Stage 3. → `references/1-interview.md`

**Stage 2 — Brand knowledge base + design tokens.** Generate `content-os/brand/` docs (`identity.md`, `voice.md`, `strategy.md`, `visual-system.md`, `no-gos.md`) and the design-token CSS (colors light/dark, fonts, RTL) from the answers. → `references/2-brand-and-design.md`

**⭐ Stage 3 — The core libs. Build these BEFORE any view.** Four zero-dependency ESM modules in `app/src/lib/`: the **ONE strategy renderer** (`brand-kit.json` → a prompt block per scope, shared by the app *and* the cron), the **idea store** (`ideas.json` — uuids, taxonomy validation, atomic writes, deterministic dedup, statuses), and the **radar output contract + ingest**. Everything downstream imports them. Skip this stage and you will parse markdown, drift five copies of the brand summary, and re-insert the same idea daily. → `references/7-core-libs.md`

**Stage 4 — The dashboard app.** START with the **Stage 3.0 bootstrap** (the exact `create-next-app` command + the Tailwind-**v4** setup — no `tailwind.config.js`) before writing any feature; a weak model that skips it ships an unstyled or non-existent app. Then build the sidebar + views, filesystem-as-database API routes (each try/catch → empty default, and seed the empty data files), dark/light theme, RTL if needed, URL-hash navigation, inline SVG icons (NO emoji in the UI chrome). Ideas is a **review queue** (approve / reject-with-a-reason), and Strategy is **read-only**. → `references/3-dashboard-app.md`

**Stage 5 — Background AI generation + the export engine.** The Produce views (Carousels/Stories/Presentations) are **one reused component** that shows approved ideas on top and the produced pieces of that collection below, refreshing itself when a job ends — an idea must visibly *become* a piece in the same screen. Wire the `/api/generate` (and `/api/radar`) **background-job** pattern (survives reload, has Stop, reconnects), the Playwright HTML→PNG export engine, the scaffold script, and the per-format builder specs (carousel/story/presentation/script/thumbnail). Generation is **gated on an approved idea** and takes an `idea_id`, never a free string. → `references/4-builders-and-export.md`

**Stage 6 — Radar + interactive calendar.** The scout prompt from the strategy renderer + the user's topics/sources/no-gos, emitting **structured JSON against the contract**; the on-demand `/api/radar` route; a scheduled daily run (cron/launchd/Task Scheduler) that ingests through the same code path as the app; and a **health check with a visible banner** — a scheduled job nobody watches fails silently, which is the failure mode that actually happens. Then the Notion-style month calendar backed by a JSON store, with rich items (title, type, platform, pillar, status, description, markdown body). Optionally wire read-only connectors (Notion import) if the user has them. → `references/5-radar-and-calendar.md`

**Stage 7 — Publish + Growth (close the loop).** The publish panel (assets + caption + one CTA + a pre-publish checklist), the **three-layer no-auto-publish guarantee** and its verify script, **and — if a connector is wired — media that actually reaches the draft** (a connector runs on remote servers and cannot read a local path or `localhost`; a caption-only draft is a failure, not a partial success). If the connector has **no upload tool** (Buffer does not), you are hosting the files yourself: read reference 8b before writing a line of it — it carries a security rule (never tunnel the dashboard, its generate route runs an agent with permissions skipped) and a failure mode where every server-side signal reports success while the images render broken. then the Growth view — metrics, the weekly review, and hooks that graduate into the bank **with their real number**. Without this the OS produces forever and learns nothing. → `references/8-publish-and-growth.md`

**Stage 8 — The Assistant (chat) surface** *(optional, but the highest-value view per line of code).* A chat pane that opens with the strategy block, so the user can ask for hooks or a rewrite without re-explaining their brand. Conversations are a real store (`chats.json`), each one a real route (`/assistant/<id>`), replies render as markdown with per-message direction, and the agent runs **with its tools disabled** so it answers instead of announcing it will go read files. → `references/9-assistant-chat.md`

**Stage 9 — Analytics + Inspiration + Transcription** *(only if the user gave credentials in Q9 — otherwise skip and say so).* Their own posts with real insights, comments, inline playback, click-to-transcribe; an account-level audience tab; a competitor library with hooks, public numbers, playback and transcripts. **Two deliverables: the grids AND the post detail window that opens on click** — the window is the half that gets skipped, and without it a competitor library teaches nothing (their captions are often just the keyword gate; the value is in the transcript). **Validate every credential live BEFORE building on it** (a dead Meta token is the #1 blocker) and tell the user exactly how to fix any that fail. → `references/6-analytics-and-inspiration.md`

**Stage 10 — Verify + handoff.** Typecheck (`tsc --noEmit`) — and prefer typecheck over a full build if the user has a dev server running, since building wipes `.next`. **Never start a dev server to "verify"** — the user runs that. Run the **end-to-end walkthrough** below, then print how to run it (`<pm> dev` in `content-os/app`), where assets land, how the radar scheduler was installed and how to remove it, and remind them to **rotate any API key pasted into the chat**.

### The Stage 10 walkthrough — do all nine, in order

Per-stage checkpoints catch broken parts. This catches a broken *loop*, which is a different failure.

1. `node tools/strategy-block.mjs radar | head -20` → the brand's real positioning, **not** the fallback
2. Run the radar once → `radar/runs/<id>.json` exists, `ideas.json` grew. Run it **again** → the same stories come back **deduplicated**, not inserted
2b. **Break it on purpose** — rename `brand-kit.json`, run the cron script: it must abort *before* spending a scan, log a `fail` row, and raise the banner in the UI. Restore, confirm the banner clears
3. Try to generate from a `new` idea → **409**. Approve it → generation runs
4. The piece exports at the right dimensions, in the brand font, with exactly the CTA the record specified (**or none**, if it was null) — **and it appears in that format's own view without a manual reload**. An empty Carousels tab after a successful job is the #1 build failure: the view was never wired to the filesystem
5. The idea flipped to `produced`; the calendar event moves planned → published; the publish panel shows real assets
6. If the assistant was built: a starter prompt from the empty state gets a reply (the path that breaks when navigation happens mid-turn), Arabic and English both render un-mangled, and a reload keeps the conversation
7. If analytics was built: clicking a card — **your own AND a competitor's** — opens the detail window, plays, and transcribes
8. If a publishing connector was wired: a draft made from an 8-slide carousel arrives with **8 images in the right order**, not the caption alone — and **open it in the connector's own web UI**, because an API that reports `attached: 8` can still be showing eight broken thumbnails (reference 8b)
9. `node tools/verify-publishing-safety.mjs` exits 0 — and exits 1 when you temporarily move a publish tool into `allow`

Report honestly which of the six passed. **Do not report the build as done with a failing step
unmentioned** — say which one failed and what you tried.

---

## Degradation matrix (don't collapse these into one yes/no)

Capabilities are independent (Stage 0). Pick the highest tier each supports:
- **Full** — Node + Playwright + self-spawn: the whole OS as described.
- **HTML-only export** — Node + self-spawn, but Playwright/Chromium won't install: build the app, generation writes the HTML pieces but skips the PNG screenshot step (deliver/preview the HTML).
- **Prompt-handoff generation** — Node app builds, but the agent can't spawn itself: the Generate/Radar/Edit buttons write the composed prompt to `content-os/<collection>/<slug>/PROMPT.md` (or a modal/clipboard); the user runs their agent on it; an "I ran it — refresh" button re-scans. Dashboard is a full planning/viewing/calendar surface with manual generation. (See reference 3.)
- **Lite Mode** — no Node app at all (below).

## Lite Mode (no web app possible)

If a full web app isn't feasible, still deliver a real content OS as **files + scripts**:
- `content-os/brand/` knowledge base + `design-tokens.css` (Stage 2, unchanged).
- **The core libs anyway** (Stage 3 / reference 7) — they are plain ESM with zero dependencies and need no app. `node tools/strategy-block.mjs generate` prints the brand block to paste into any chat, and `ideas.json` + `tools/radar-ingest.mjs` still give you a deduplicated, validated idea store from the CLI. This is the highest-value part of the OS and it survives having no dashboard.
- Per-format **builder skills** (markdown specs) + self-contained **HTML templates** the agent fills per piece; export to PNG via a headless-browser script *if available*, else deliver the HTML.
- A **radar** command: a prompt the agent runs (with its own web-search tool) that writes a structured run to `content-os/radar/runs/<id>.json`, ingested by `tools/radar-ingest.mjs`; `radar/feed.md` stays the human log.
- A **calendar** as `content-os/calendar.json` + a tiny static HTML viewer (single file, no build step).
- `growth/metrics.md` + the weekly-review prompt (reference 8c) — the learning loop needs no app either.
Everything else (voice, no-gos, pillars, CTAs) still comes from the interview. Tell the user which parts are file-based vs app-based.

---

## Non-negotiables (carry these into whatever you generate)

- **Personalization only.** Every color, font, voice rule, pillar, CTA, radar topic, and no-go comes from `brand-kit.json`. No leftover reference-brand values.
- **⭐ One source of truth, one renderer.** `brand-kit.json` is the only place the brand is defined, and `strategy-block.mjs` is the only thing that turns it into a prompt. Every AI surface — app routes *and* the cron — imports that one renderer and reads the kit fresh per request. **Never hand-write a brand summary into a route.** Five summaries drift silently the first time a pillar changes.
- **⭐ The kit is human-controlled.** The AI reads it and may propose changes; it must never write it. Serve it GET-only. A system that can rewrite its own guardrails has none.
- **⭐ Structured data is stored structured.** `ideas.json` is the database; markdown files are research records for humans to read. Never scrape prose to build a view.
- **⭐ Nothing gets produced unreviewed, and nothing gets published unconfirmed.** Generation requires an idea whose status is `approved`; publishing to a live account requires an explicit go-ahead in that moment, every time.
- **Never invent.** No fabricated numbers, results, features, or client details — anywhere, in any generated piece. The proof bank in the kit is the whole list of what may be cited. A piece with no proof says less, it doesn't make things up.
- **Respect the user's no-gos** in the radar prompt, the voice docs, and any generation prompt — as hard filters.
- **RTL correctness** if the primary language is RTL: set `dir` at the root, use logical CSS properties, never hardcode `dir` per element, never apply negative letter-spacing to Arabic. (See reference 2.)
- **Local-only AI actions.** Routes that spawn a coding agent or skip permissions must be **guarded to local/dev** (return 403 in production) — they run the user's own agent CLI on their machine. And the dashboard has **no publish endpoint**.
- **The filesystem is the database.** No DB/ORM. API routes read/write real files under `content-os/` and are non-cached (`force-dynamic` / `no-store`).
- **⭐ A control that refuses must say why.** Every disabled button, skipped guard and early return needs a visible reason. A silently inert control is indistinguishable from a broken backend, and that mistake costs hours of debugging in the wrong layer.
- **Verify by typecheck/build, not by the dev server.** Never start a long-running dev server to "check" — the user runs that.

Start by reading `references/1-interview.md`, then run the interview.
