---
name: content-os-builder
description: Build a local AI "content operating system" for one business or many isolated businesses (an agency's clients). One Next.js engine plus one folder per business, with an owner-approved brand kit, an approve-before-generate idea store, a grounded trend radar, competitor tracking, HTML→PNG export, optional AI image/video/animation, a chat assistant with memory, owner-confirmed publishing, a CRM and an optional knowledge-vault graph. Every spawned AI agent is confined (no shell, no access to other businesses). Works with any coding agent (Claude Code, Codex, Cursor, Kimi…). It ALWAYS interviews first, starting with "one business or several isolated ones?", then builds. Use when someone wants a system to run their or their clients' content ("build me a content OS", "something like my friend's content OS", "a dashboard to run my content", "a system to run my clients' content", "an AI content OS for my agency"), even if they never say "content OS".
---

# Content OS Builder

You are an AI coding agent with **file-write and shell access**. You will build the user a local
**content operating system**: a dashboard that runs *idea → approve → produce → publish → learn* for
one business, or for several businesses kept strictly apart. The user is often an agency running
content for clients, or a creator with more than one brand.

This skill is a **playbook, not a template**. You interview the user, then build from the answers.
Every name, colour, voice rule, competitor and key comes from the interview. Nothing in this skill is
anyone's real brand, and nothing you build may contain values the user did not give you.

## What you are building, in one paragraph

**One engine plus N business folders.** The engine is `engine/app` (Next.js App Router, React,
TypeScript strict, Tailwind v4, pnpm), the trusted scripts it runs, and the CLI tools in
`engine/tools`. Each business is a **tenant**: `tenants/<id>/`, holding its manifest, its brand kit,
its ideas and pieces, its memory, its skills and its own account keys. Every API route resolves
exactly one tenant and reads or writes only inside its folder. **The filesystem is the database**:
there is no DB and no ORM. AI work is done by the user's own coding-agent CLI (normally `claude`),
spawned headless with `cwd` set to the tenant folder, **with no shell** and with inline deny rules
that keep it inside that folder. The agent only writes words and code. The engine does everything
that executes: scaffolding, exporting, rendering and publishing. A **single-tenant** install is the
same engine with exactly one tenant folder. There is no separate "single-brand" code path.

---

## The golden rule: INTERVIEW FIRST, BUILD SECOND

**Write no file until the interview is done and the user has confirmed the summary.** The value of
the system is that it is theirs. A generic clone is a failed build.

- Ask in the user's language, **one group of questions per turn**, with a sensible default proposed
  for each question so they can answer "yes" or adjust.
- They may say **"later"** to any question, or "use defaults for the rest". Record a "later" item as
  pending and build the part it gates in its disabled state, with a visible "not set up yet" notice.
- **Never ask for secrets in the chat.** Tell them which variable goes in which file and let them
  paste it there. If they paste one anyway, put it in the right file, never echo it back, and tell
  them to rotate it.
- End with a compact summary and get an explicit **yes**.

**The very first question is tenancy:**

> Will this system run **one business** (single-tenant) or **several businesses or clients, each
> fully isolated** (multi-tenant)?
> - **Single-tenant.** One brand. The dashboard opens straight into it.
> - **Multi-tenant.** An agency or a person with several brands. Each business gets its own folder:
>   its own brand kit, ideas, content, memory, chat, publishing channels and keys. Its AI agent can
>   never read another business's files. A picker at `/` switches between them.
>
> Both use the same engine, and single-tenant is simply one folder. Adding a business later means
> adding a folder; nothing has to be migrated.

The full question set (system questions once, then per-business questions), the defaults and how each
answer maps to a file are in **`references/1-interview.md`**. Read it before asking anything.

---

## What ships as code (`assets/`)

Most of this system you generate from the references. **Eleven files are copied verbatim**, because
each one has edge cases that were measured in production (or is a security boundary) and a fresh
re-derivation from prose gets it quietly wrong. Copy them unchanged, then edit only the places marked
`EDIT:` (owner-language sentences, language data, the publish-tool list). The references explain *why*
each one works the way it does; the asset is *how*.

| Asset | Copy to | What it is |
|---|---|---|
| `assets/tenant.mjs` | `engine/app/src/lib/tenant.mjs` | Tenant discovery, manifest + per-business `settings` validation, the path-traversal guard, per-tenant env (account keys are never inherited) |
| `assets/agent-flags.mjs` | `engine/app/src/lib/agent-flags.mjs` | The only place agent confinement is built: profiles, inline deny rules, the env allowlists |
| `assets/proxy.ts` | `engine/app/src/proxy.ts` | The same-origin guard in front of every `/api` route (loopback host, no cross-site requests, JSON or multipart bodies only) |
| `assets/export-project.mjs` | `engine/app/scripts/export-project.mjs` | The trusted HTML→PNG exporter with a default-deny request firewall |
| `assets/shapes.mjs` | `engine/app/src/lib/shapes.mjs` | The two anti-repetition axes text dedup cannot see (shape and lesson) + starter shapes per kind |
| `assets/ideas-core.mjs` | `engine/app/src/lib/ideas-core.mjs` | The idea store: validation against the kit, deterministic dedup, quarantine, atomic writes, the mutex |
| `assets/extract-json.mjs` | `engine/app/src/lib/extract-json.mjs` | The one tolerant JSON reader the radar verifier and the ingest share |
| `assets/radar-verify.mjs` | `engine/app/src/lib/radar-verify.mjs` | The radar's grounding check: SSRF-guarded fetch, page dates, quote shingles, language gate, unproven numbers |
| `assets/proposals.mjs` | `engine/app/src/lib/proposals.mjs` | The chat's unforgeable publish proposals: bound to one message, single use, atomic claim |
| `assets/new-tenant.mjs` | `engine/tools/new-tenant.mjs` | Scaffolds a valid, empty, gated tenant folder, all or nothing; `--from` makes a throwaway test copy |
| `assets/sync-tenant.mjs` | `engine/tools/sync-tenant.mjs` | Re-applies the engine's skills and settings to existing tenants (run it after editing either) |

`ideas-core.mjs` imports `./strategy-core.mjs`, which you write from reference 4 §3. Everything else the
assets import is another asset.

---

## Build order

Work top to bottom. **Before each stage, read its reference. Before moving on, run that reference's
checkpoint.** A stage that "looks done" but fails its checkpoint breaks something three stages later,
somewhere unrelated. After each stage, tell the user what you did in one line.

| # | Stage | Reference | Always? |
|---|---|---|---|
| 0 | Probe the machine, run the interview, confirm the summary | `1-interview.md` | yes |
| 1 | Engine skeleton: repo layout, Next bootstrap, copy ALL the assets, tenancy core, `new-tenant`, the tenant folders | `2-architecture-and-tenancy.md` | yes |
| 2 | Security: agent confinement, spawn helper, proxy guard, env isolation, `verify-tenants`; then `sync-tenant --all` | `3-security-and-agents.md` | yes |
| 3 | Brand kit (schema, renderer, interview, research draft, approval) and the idea store (+ shape and lesson axes) | `4-brand-kit-and-ideas.md` | yes |
| 4 | Dashboard shell + design system: picker, tenant shell, home, strategy, ideas, settings, tokens, RTL, phone layout | `5-dashboard-and-design.md` | yes |
| 5 | Production: generation jobs, scaffold, trusted export, «edit», builder skills, product library, the produce/gallery/scripts views; then `sync-tenant --all` | `6-production-and-export.md` | yes (library optional) |
| 6 | Media engines: AI image posts, AI video, browser-driven video, Remotion animations | `7-media-engines.md` | optional, per engine |
| 7 | Radar + competitors + transcripts + precedent index + own analytics + community post | `8-radar-competitors-and-analytics.md` | radar yes; the rest optional |
| 8 | Chat assistant: streamed turns, memory, the agent's actions, interview mode | `9-assistant-and-memory.md` | strongly recommended |
| 9 | Calendar, publishing (owner-confirmed), growth loop | `10-publishing-calendar-and-growth.md` | calendar yes; publishing optional |
| 10 | CRM + partners (service businesses) | `11-crm-and-partners.md` | optional |
| 11 | The owner's knowledge vault ("brain") + 3D graph | `12-brain.md` | optional |
| 12 | Routing maps, `CLAUDE.md` / `AGENTS.md` for the engine, every tenant and the vault | `13-routing-maps-and-agents-md.md` | yes |
| 13 | Verification: the full checklist, then the handoff | `14-verification.md` | yes |

Build only the optional stages the interview enabled. A module that is off is **off on the server**
(its routes return 404 for that tenant), not just hidden in the sidebar. **Each view is built in the
stage that builds its route** (reference 5 §4 lists which); the shell treats a 404 from a route that is
off or not built yet as "empty", never as an error.

### Stage 0: probe, don't assume

Test each of these on its own. They are independent:
1. **Node ≥ 20 and pnpm** (or the package manager the user chose). If Node is missing, ask the user to
   install it (nothing here runs without Node). If Node works but the Next app cannot be installed,
   use **Lite Mode** (below).
2. **Symlinks.** Create one in a temp dir (`ln -s` / `fs.symlinkSync`). On Windows without Developer Mode
   or admin rights this fails: `new-tenant.mjs` then writes `AGENTS.md` as a generated copy and links
   `node_modules` with a directory junction, and `verify-tenants` accepts both. Recommend WSL when it
   is available; it behaves like Linux.
3. **The runtime agent CLI.** Can a Node process spawn it headless (`claude --print` style), and is it
   logged in? Does it support a closed tool list, inline settings with deny rules and a
   non-interactive permission mode? The confinement layer is written for the `claude` CLI. For any
   other CLI, read "Adapting to another agent CLI" in reference 3. **If the agent cannot be confined,
   generation for a multi-tenant system must degrade to prompt-handoff**, because an unconfined agent
   can read every business.
4. **Optional tools**, only if the interview enabled the module that needs them: `ffmpeg`, `yt-dlp`,
   the `codex` CLI, Google Chrome.
5. **Playwright Chromium** is probed in the Stage 1 checkpoint, after the bootstrap installs it. If it
   will not install, use **HTML-only export**.

### Degradation matrix (never collapse it into one yes/no)

- **Full.** Node, Playwright and a confinable agent CLI: everything as specified.
- **HTML-only export.** Playwright will not install: pieces are written as HTML and previewed as HTML.
- **Prompt-handoff generation.** The agent cannot spawn headless, or cannot be confined: Generate,
  Radar and Edit write the composed prompt to `<piece>/PROMPT.md` and show it; the user runs their
  agent on it, then presses "I ran it, refresh". Every other part of the dashboard works normally.
- **Lite Mode.** Node works but the Next app cannot be installed: build the tenant folders, the
  zero-dependency core libraries (`tenant.mjs`, `strategy-core.mjs`, `strategy-approve.mjs`,
  `ideas-core.mjs`, `shapes.mjs`) and their CLI tools: `new-tenant`, `strategy-block`, `approve-kit`
  (prints the draft's sha256, then approves exactly those bytes) and `ideas` (list / add / approve /
  reject), all specified in reference 4 §12. Brand approval and the idea store then work from the
  terminal. Tell the user which parts are app-based and which are file-based.

### Definition of done

You are done only when **reference 14's checklist passes**: typecheck, lint, build, unit tests,
`verify-tenants` (with its real-CLI canaries), `verify-publishing-safety` when publishing exists, a
real generation from an approved idea, and screenshots of the key screens. **Report honestly which
items passed.** Never report a build as done while a failing step goes unmentioned.

---

## Single-tenant vs multi-tenant: what actually changes

| Concern | Multi-tenant | Single-tenant |
|---|---|---|
| Folder layout | `tenants/<id>/` × N (often the agency's own workspace + one per client) | `tenants/<id>/` × 1 (the same layout, so adding a second business later costs nothing) |
| `/` | Picker: one card per business (+ the vault card) | Redirects to `/<only-id>` when exactly one valid tenant exists |
| Header | Workspace switcher | Business name only, no dropdown |
| Agent confinement, deny rules, no shell | Required | **Still required**: it keeps the agent out of the engine source, the repo-root secrets and the settings |
| Account keys | Each tenant's own `.env.local` | Still the tenant's `.env.local`, never the engine env, so a second business can never inherit them |
| CLI tools | `--tenant <id>` required, no default | Still required (a shell alias is fine) |
| Canaries | Real tenant = victim, throwaway `zz-canary` = attacker | Same: the verifier creates its own attacker |

In the UI a tenant is called a **"workspace"** (in the user's language), never "tenant".

---

## Non-negotiables

Carry every one of these into what you generate. Each has its reason, because a rule without a reason
gets "simplified" away.

- **⭐ Personalization only.** Every value comes from the interview. Never leave a value from an
  example, from this skill, or from another business in code defaults, prompts or templates. A
  default in code silently brands every tenant whose kit omits that field. Per-business numbers
  (freshness, thresholds, currency, credit ceilings, the publishing language) live in `tenant.json`
  `settings`; the only defaults in code are the neutral operational ones the interview proposes
  (`DEFAULT_SETTINGS`), and anything the owner was not asked stays unset, never guessed.
- **⭐ No default tenant, anywhere.** Routes, CLI tools and the cron must name a tenant. A forgotten
  tenant has to fail loudly; the alternative is silently reading or writing another business's data.
- **⭐ No spawned agent ever gets a shell.** A child process such as `node` runs with the operator's
  full filesystem access, and no CLI flag confines it. This was measured: a tenant agent with a shell
  read another tenant's files. So the **route** scaffolds before the spawn and runs the trusted
  exporter or renderer after it. The agent writes words and code; the engine executes. Never emit
  `--dangerously-skip-permissions`. The one shell-capable helper the skill allows, the optional free
  Codex image backend, is named as such, opt-in per business, and runs with no keys in a scratch
  directory outside the repo (reference 7 §1).
- **⭐ Confinement is inline and engine-owned.** Pass deny rules as inline `--settings` JSON, never as
  a path to a settings file the agent can edit. One injected turn could otherwise disarm the next
  spawn.
- **⭐ Agents and renderers get an env allowlist, never the tenant's keys.** Account-bound keys come
  only from that tenant's `.env.local`. Inheriting the engine env once made every company tenant read
  the owner's own social audience as its own.
- **⭐ The API is local and guarded.** Bind dev to `127.0.0.1`, put the same-origin proxy in front of
  `/api`, and return 403 from every spawning, publishing or paying route when
  `NODE_ENV === "production"`. The API has no login, so these are the only things keeping any website
  the owner visits from driving it, and "the owner's click" means whoever is at this machine: never
  promise per-person approval.
- **⭐ Skills and settings are copied, so they are re-synced.** A tenant gets the engine's skills and
  settings when it is created; after any edit to `engine/skills/tenant/*`, `PUBLISH_ASK` or the deny
  lists, run `node engine/tools/sync-tenant.mjs --all`. Agents cannot fix a stale copy themselves.
- **⭐ The brand kit is human-controlled.** The AI drafts it and the engine validates it; only the
  owner's **Approve** click makes it live, and approval signs the exact bytes the owner reviewed (sha256).
  No agent can write `brand/strategy.json`. Until a kit is approved the tenant is gated: generate and
  radar return 409.
- **⭐ One renderer, read fresh.** `strategy-core.mjs` turns the kit into the prompt block for every
  AI surface: app routes and cron alike, on every request. Never hand-write a brand summary into a
  route; five copies drift the first time a pillar changes.
- **⭐ Structured data is stored structured.** `ideas.json` is the database (uuids, validated
  taxonomy, atomic writes, a mutex, deterministic dedup). Markdown files are for humans and are never
  scraped to build a view.
- **⭐ Variety is checked on its own axes.** Text dedup compares wording. `shape_id` (the form an idea
  takes) and `core_lesson` (what it teaches) are gated separately, per idea and per radar run, because
  a store can fill with dozens of ideas of one form, or six ideas teaching one lesson, while every
  similarity rule reports it clean.
- **⭐ The engine, not the model, decides what is real.** Every radar idea is re-fetched, dated and
  quote-checked by code before it reaches the store. The verified stamp is written by the engine
  only. Competitors are studied from transcripts, never captions.
- **⭐ Nothing is produced unreviewed, and nothing is published unconfirmed.** Generation takes the id
  of an `approved` idea. Publishing happens only on the owner's click in that moment. The chat can
  only *propose*, into a store the engine owns.
- **⭐ Never invent.** No fabricated numbers, results, clients, prices, product details or
  first-person habits, in code defaults, prompts or content. The proof bank and the product library
  are the whole list of what may be claimed.
- **⭐ Silent failure is the real bug.** Every scheduled or background job reports its health on
  screen (a banner, not a log file). A failure folder nobody opens is not a safety net.
- **⭐ A record with fields renders as fields, and a control that refuses says why.** Use chips,
  badges and pull-quotes, never a stringified record. A disabled button carries its reason. Show the
  owner a sentence in their language, never an error code.
- **⭐ Isolation is proven, not assumed.** Real-CLI canaries start with a positive control and assert
  on disk (sha256), never on what the model says.
- **RTL is first-class.** Set `dir` once at `<html>`, use logical properties only, never put letter
  spacing on Arabic, and fix bidi glitches in the content (reference 5).
- **Never run the dev server yourself.** Verify with typecheck, lint, build, tests and real runs of
  the CLI tools. The user starts `pnpm dev` and shows you the result.

## How you work while building

- Use the user's package manager. Pin versions where a reference pins them.
- Generate tests next to the core libraries (`node --test engine/tools/tests/*.test.mjs`) as you
  write them. The verifier and the canaries are part of the product, not an extra.
- Never print, log or commit a secret. Make sure `.gitignore` covers `.env`, `.env.local`,
  `**/.env.local`, `**/.env.*.local`, `node_modules/`, generated PNG/MP4 and `engine/app/.data/`.
- Ask before anything paid (a paid image or video API, transcription, Apify) runs for the first time.
- Test on a temporary copy tenant and remove it afterwards: `node engine/tools/new-tenant.mjs zz-test
  --from <id>` copies the manifest, `brand/` and `library/` (never `.env.local`, chats, ideas or
  publishing records); `rm -rf tenants/zz-test` when done. Never delete the user's data to clean up.

Start by reading `references/1-interview.md`, run Stage 0, then ask the tenancy question.
