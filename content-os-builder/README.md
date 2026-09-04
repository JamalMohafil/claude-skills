# content-os-builder

A portable **skill** that builds a personalized **content operating system** for any creator or brand — a local dashboard (Strategy · Ideas · Radar · Carousels · Stories · Presentations · Scripts · Calendar · Gallery · Analytics · Inspiration · Growth · Assistant) with a live trend-radar, an HTML→PNG export engine, a design system, background AI generation, real Instagram/YouTube analytics (your posts, insights, comments, inline playback, click-to-transcribe), and a competitor study library.

It **interviews the user first** (brand colors, visual identity, platforms, voice, radar topics, no-gos) and then generates the whole OS around those answers. Nothing is hardcoded to one brand.

## The three ideas that make it more than a dashboard

**1. One brand kit, one renderer.** `brand-kit.json` is the only place the brand is defined, and a single `strategy-block.mjs` turns it into the prompt block that *every* AI surface reads — the app's routes and the scheduled cron alike, fresh on every request. Edit the JSON and what the whole system knows changes, with no route code touched. The kit is human-controlled: the AI reads it and may propose changes, never writes it.

**2. Structured data is stored structured.** `ideas.json` is the database — stable uuids, every taxonomy reference validated against the kit, atomic writes behind a mutex, and deterministic four-rule dedup so a daily radar re-surfacing the same story bumps `seen_count` instead of inserting a twin. Markdown files stay what they're good at: research logs for humans to read, never scraped to build a view.

**3. Nothing is produced unreviewed, and nothing is published unconfirmed.** Generation takes an `idea_id` whose status is `approved` — a free string is refused. Rejecting an idea requires a reason. And publishing to a live account requires an explicit go-ahead in the moment, enforced in three layers (a behavioural rule, an `ask` permission list in a *tracked* settings file, and a verify script that exits 1 if any write tool ever becomes auto-allowed). The dashboard has no publish endpoint at all.

## Use it in any AI coding agent

- **Claude Code** — it's a native skill. Just ask: *"build me a content OS"* (or run it by name). Claude reads `SKILL.md` and follows it.
- **Codex / Kimi / Cursor / any other agent with file + shell access** — copy this whole folder into the project, then tell the agent:
  > Read `content-os-builder/SKILL.md` and follow it. Start with the interview, don't build anything until it's confirmed.

  The instructions are plain markdown and agent-agnostic. What IS agent-specific — and is spelled out in `references/3-dashboard-app.md` ("Adapting to another agent") — is the generation-spawn: your agent's **binary**, its **streaming/JSON flag** (or plain-text mode), its **auto-approve flag**, and the **stdout parser** (Claude's `stream-json` shape differs from Codex/Cursor/Gemini). And if your agent can't invoke itself headlessly at all, generation falls back to **prompt-handoff** (the dashboard still works; you run the prompt yourself). The interview captures all of this up front.

## What's inside

| File | Purpose |
|---|---|
| `SKILL.md` | The master playbook: the golden rule (interview first), the intake questions, the 9 build stages, and the end-to-end walkthrough. |
| `references/1-interview.md` | The full intake interview + the `brand-kit.json` schema (single source of truth). |
| `references/2-brand-and-design.md` | Brand knowledge base + design tokens (palette derivation, light/dark, RTL rules). |
| `references/7-core-libs.md` | ⭐ **Build these first.** The one strategy renderer, the idea store (validation · atomic writes · dedup), the radar output contract, and the generation gate. |
| `references/3-dashboard-app.md` | The dashboard app blueprint + the **background-job pattern** (survives reload, Stop, reconnect). |
| `references/4-builders-and-export.md` | Per-format builders + the Playwright HTML→PNG export engine + the scaffold script. |
| `references/5-radar-and-calendar.md` | The trend-scout (on-demand + scheduled), its **health check**, and the interactive Notion-style calendar. |
| `references/8-publish-and-growth.md` | The publish panel + the no-auto-publish guarantee · **connector media** (why a draft arrives with the caption and no images, and the hosting/tunnel work that fixes it) · the Growth loop that turns results back into next week's ideas. |
| `references/9-assistant-chat.md` | The brand-aware chat: a conversation store, the SSE streaming contract, markdown + per-message direction, and the routing traps that make a send silently do nothing. |
| `references/6-analytics-and-inspiration.md` | Real Instagram/YouTube analytics, competitor study, inline playback, click-to-transcribe — with every verified API quirk and the traps that break each one. |

> Stage order and file numbers deliberately don't match — references 7 and 8 were added later and slot into the middle. `SKILL.md` has the table; follow that, not the filenames.

## Requirements

- An AI coding agent with **file-write + shell** access.
- Node ≥ 18 and a package manager (pnpm/npm) for the full dashboard. If those aren't available, the skill falls back to **Lite Mode** (brand kit + core libs + builders + radar + calendar as files/scripts + a single-file HTML viewer).
- A web-search capability for the radar (the agent's own tool).

## Output

Everything lands under `content-os/` in the target project: the brand kit + docs, the core libs, the dashboard app, the content collections, the calendar store, the idea store, and the radar feed. Run the dashboard with your package manager's `dev` in `content-os/app`.

## Status

The **architecture** is distilled from a content OS I run every day — the traps documented here (Tailwind v4 dropping the font `@import`, Playwright resolving fonts before `document.fonts.ready`, the Instagram `paging` object having no `next` key, a scheduled radar failing silently for weeks) are all bugs that actually happened and got fixed.

The **builder itself** has not yet been run start-to-finish on a fresh brand. Treat it as a well-specified playbook rather than a one-click installer, and run each stage's checkpoint as you go — they're there to catch exactly that.

Reference 9 is the newest and the most battle-tested: every rule in it came out of building the assistant for real, then having three adversarial reviewers and a live browser session take it apart — an unhandled `EPIPE` that killed the whole dev server, Arabic corrupted by a `TextDecoder` missing `{stream:true}`, a route change unmounting a component mid-request, and a disabled button that made a perfectly working backend look broken.
