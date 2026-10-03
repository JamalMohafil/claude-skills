# Reference 13: Routing maps, `CLAUDE.md` and `AGENTS.md` (Stage 12)

Every law file (the engine root, each tenant, the vault) has the same shape: who you are, what's true,
the hard rules, and a **Routing Map** (`Need | Path | Rule`). An agent reads the map and opens only what
the task needs, instead of globbing the tree, which burns context and finds the wrong copy.

- **`AGENTS.md` is a symlink to `CLAUDE.md`** (`ln -s CLAUDE.md AGENTS.md`), so Claude Code and Codex
  read the same law and the two can never drift. Say so in the first lines, and edit only `CLAUDE.md`.
  Where the OS refuses symlinks (native Windows without Developer Mode), it is a generated copy whose
  first line says so; `sync-tenant.mjs` refreshes tenant copies, and the engine root's and the vault's
  copies are refreshed by hand the same way (header line + the CLAUDE.md bytes).
- **Both are write-denied to every spawned agent.** `CLAUDE.md` is loaded into every prompt, so a write
  would be a persistent injection.
- **Update the maps whenever you add a module, a route or a file type.** A map that lies is worse than
  none. The last stage of the build re-reads the tree and fixes every map.

## 1. The engine root `CLAUDE.md` (template)

```markdown
# <App name> — Engine Manual

> `AGENTS.md` is a symlink to this file. Claude Code reads CLAUDE.md, Codex reads AGENTS.md, and they
> can never drift. Edit CLAUDE.md only.

<One paragraph: a multi-tenant (or single-tenant) content OS. Every business lives in tenants/<id>/
with its brand kit, content, skills, memory and keys. This root and engine/app are the one shared engine.
The root carries no business's voice or content rules; those live only inside each tenant folder.>

## Core operating rules
- **Don't read the codebase to find things.** Use the Routing Map below and open only those files.
  Grep inside them; never glob the whole tree.
- <UI language> for every UI string; the owner speaks <language/dialect>.
- **<pm>** only. **Never run the dev server**; the owner runs it. Verify with `pnpm exec tsc --noEmit`,
  `pnpm lint`, `pnpm build`, `node --test engine/tools/tests/*.test.mjs` and a REAL run of what changed.
- Spawned agents never get a shell; every spawn goes through `agent-spawn.ts`; never
  `--dangerously-skip-permissions`. A tenant never sees another tenant's files, memory or keys.
- AI never writes a tenant's `brand/strategy.json` (only the owner's Approve). Nothing publishes
  without the owner's click. Never print a secret; keys live in `.env.local` files (gitignored).
- No invented numbers, clients, results or first-person claims: in code defaults, prompts or content.
- RTL: never hardcode `dir`; use logical properties.
- Never delete the owner's data to "clean up"; test on a temporary copy tenant and remove it after.

## Routing Map — the engine
Paths under `engine/app/` unless they start with `engine/` or `tenants/`.

| Need | Path | Rule |
|---|---|---|
| Dashboard shell, which view renders | `src/app/[tenant]/[[...view]]/page.tsx` + `src/views/registry.ts` | a new tab = `View` in `src/lib/types.ts` + registry + NAV + a `case` + `MODULE_IDS` in `src/lib/tenant.mjs` + the tenant's `tenant.json` |
| Workspace picker (`/`) | `src/app/page.tsx` | forwards when there is one tenant |
| One tab's UI | `src/views/<view>.tsx` · produce views → `src/components/Produce.tsx` · open a piece → `Viewer.tsx` · jobs → `JobDock.tsx` | UI strings in <language> |
| Design tokens, shared UI | `src/app/globals.css` · `src/components/ui.tsx` · `Icon.tsx` | dark default, `:root.light` overrides |
| Tenants, manifests, modules, formats, engines, per-business settings, env | `src/lib/tenant.mjs` (+ `tenant.ts`) | per-tenant keys go in `ACCOUNT_KEYS`; every per-business number goes in `tenant.json` `settings` (validated) |
| Create, copy, re-sync tenants | `engine/tools/new-tenant.mjs` (`--from` = test copy) · `engine/tools/sync-tenant.mjs` | run `sync-tenant --all` after editing tenant skills, `PUBLISH_ASK` or the deny lists |
| Same-origin API guard | `src/proxy.ts` | never loosen |
| Spawning agents, confinement | `src/lib/agent-spawn.ts` · `src/lib/agent-flags.mjs` | no shell · engine-owned files in `ENGINE_WRITES_DENY` · run `verify-tenants.mjs` after touching |
| Brand kit → prompt text | `src/lib/strategy-core.mjs` (+ `strategy.ts`) | one renderer for app and cron |
| Brand interview / research draft / approval | `brand-interview.mjs` · `brand-research.mjs` · `strategy-approve.mjs` · `api/[tenant]/strategy/**` · `views/strategy.tsx` | approval signs the exact draft bytes |
| Idea store | `src/lib/ideas-core.mjs` · `shapes.mjs` · `api/[tenant]/ideas/` · `views/ideas.tsx` · `IdeaCard.tsx` · CLI `engine/tools/{ideas,import-ideas}.mjs` | unverified radar ideas can't be approved or generated |
| Radar | `radar-jobs.ts` · `radar-contract.mjs` · `radar-verify.mjs` + `extract-json.mjs` · `radar-ingest-core.mjs` · `api/[tenant]/radar/**` · cron `engine/tools/radar-cron.sh` | every idea engine-verified against its real source; the verifier's sentences live in its `REASONS` |
| Competitors, transcripts, precedent | `competitors.ts` · `apify.mjs` · `api/[tenant]/{inspiration,competitors,transcribe}/` · `engine/tools/{bulk-transcribe,build-covered}.mjs` | transcripts, never captions |
| Generating any piece | `src/lib/gen-jobs.ts` · `api/[tenant]/generate/` · `scaffold-core.mjs` · `scripts/export-project.mjs` | one job per tenant; the route scaffolds and exports, the agent only writes |
| Viewer data, gallery, scripts, hooks | `api/[tenant]/{piece,gallery,scripts,hooks}/` · `components/{Viewer,ScriptEditor}.tsx` | a script opens the ScriptEditor, never the image Viewer |
| Social images and videos | `api/[tenant]/{img,video,media}/` | host allowlist; cache key = host + path; resolved URLs cached per tenant |
| Editing a made piece | `api/[tenant]/edit/` · `edit-core.mjs` | re-export after the agent; roll back on failure |
| <each enabled media engine> | `image-generation.mjs` · `video-generation.mjs` · `browser-video.ts` + `scripts/video-run.mjs` · `animation.ts` + `scripts/render-animation.mjs` | <its one rule> |
| Product library + proposal | `library-core.mjs` · `api/[tenant]/{library,proposal}/` | "posted" = published, not drafted |
| Publishing | `publish.ts` · `media-host.mjs` · `proposals.mjs` · `api/[tenant]/publish/` · `PublishPanel.tsx` | owner's click only; chat proposals are server-side |
| Chat assistant | `api/[tenant]/chat/` · `agent-actions.mjs` · `chats-core.mjs` · `views/assistant.tsx` | memory: small = all, big = index + rules |
| CRM, partners | `crm-core.mjs` · `api/[tenant]/crm/` · `views/crm.tsx` · data `tenants/<id>/work/crm/` | the numbers are computed, never stored |
| Calendar | `api/[tenant]/calendar/` · `views/calendar.tsx` | agents set only planned/produced |
| Skills shipped to tenants | `engine/skills/tenant/<skill>/` → copied into `tenants/<id>/.claude/skills/` | edit the engine copy, then re-copy |
| CLI tools, verification | `engine/tools/*.mjs` (every one takes `--tenant`) · `verify-tenants.mjs` · `verify-publishing-safety.mjs` · `engine/tools/tests/` | run both verifiers after touching agents or publishing |
| A business's own law, data and memory | `tenants/<id>/CLAUDE.md` (its own Routing Map) | content work happens inside the tenant folder |
| The owner's vault | `brain/CLAUDE.md` · `brain-core.mjs` · `brain-sync.mjs` · `brain-agent.ts` · `src/app/brain/` · CLI `engine/tools/brain.mjs` | `brain/sources/**` is generated; never hand-edit |

## Tenant layout
<the tree from reference 2 §3>

## Working rules
<how to add a tenant (`new-tenant.mjs`), a module, a format; the verification commands>
```

## 2. A tenant's `CLAUDE.md` (template; `new-tenant.mjs` writes the stub)

```markdown
# <Name> — <one-line what it is>

You are the content agent for <Name> only. You know nothing about any other business. If asked about
another business, say plainly that you have no information about it here.

## What it is
The approved brand kit is `brand/strategy.json`: read it before any piece. If it does not exist, the
kit is not approved yet. A draft may be waiting in `brand/strategy.draft.json`; never treat a draft as
approved.
<optionally: one or two facts the OWNER stated in the interview that cannot go stale with the kit
(what it sells, where). Nothing invented, and never the kit's status.>

## Hard rules
- Never invent products, prices, numbers, clients, results or personal habits.
- The kit's `no_gos.hard` are hard rules too, under any framing.

## Brand kit
`brand/strategy.json` is law once approved. Until then it is a draft (`brand/strategy.draft.json`)
that only the owner can approve. You never write either file.

## Core operating rules
- Read the Routing Map and open only what the task needs.
- Glob and Grep: ALWAYS pass an explicit `path`. A path-less Glob returns "No files found" even when
  files exist.
- Reply in <language/dialect>.
- Engine-owned files are read-only for you: `content/ideas.json`, `content/chats.json`, the brand kit and
  draft, `content/planning/{publishing,scheduled,published}.json`, `work/crm/**`, `CLAUDE.md`,
  `AGENTS.md`, `.claude/**`. Ask for changes through the chat's actions.
- You have no shell. The engine exports and renders after you finish.

## Routing Map
| Need | Path | Rule |
|---|---|---|
| Brand law | `brand/strategy.json` · the draft files | read before ANY piece; never write it |
| Brand docs, templates | `brand/*.md` · `brand/templates/*.html` · `brand/*-rules.md` | a design change = the template AND the rules file |
| Ideas | `content/ideas.json` | change only through the chat's idea action |
| Made pieces | `content/<collection>/<slug>/` | the engine exports; never run a command |
| Calendar, publishing | `content/planning/*.json` | publishing is the owner's click |
| Competitors, transcripts | `content/analytics/*.json` · `research/competitors/covered.json` | huge: Grep, never Read whole |
| Radar | `research/radar/` | the engine writes feed.md and verifies every idea |
| Memory | `memory/MEMORY.md` → `memory/{rules,people,decisions,projects,lessons,notes}/` | one file per topic + one index line; rules/ always loaded |
| Partners | `work/partners/<slug>.md` | only what the owner said |
| Products | `library/products/<slug>/product.json` + photos | a product not here does not exist |
| Skills | `.claude/skills/<skill>/SKILL.md` | read the skill before its task; read-only |
```

**Keep it neutral about the kit's state.** This file is written once (by `new-tenant`, or by you
during the build) and no agent may write it at runtime, so a line like "brand kit not created yet" or a
pasted copy of the kit's no-gos would stay in every prompt long after the owner approves or changes the
kit in the app. Point at `brand/strategy.json` instead; the kit itself is rendered fresh into every
prompt.

## 3. `memory/MEMORY.md` (the memory index)

```markdown
# Memory index — <Name>
One line per memory file: `- [title](folder/file.md) — what it says`. rules/ is always loaded.

- [Never use the word X](rules/2026-01-05-banned-word.md) — the owner banned X in every caption
```
The chat agent writes the files and their index lines; the engine appends any line the agent forgot
(reference 9 §3).

## 4. The vault's `CLAUDE.md`

The law in reference 12 §2, plus a map: `wiki/people|companies|products|concepts`, `meetings/`,
`projects/`, `notes/` = curated (write here); `sources/<source>/` = generated (read only); `inbox/` = the
engine's; then the filing and answering procedures.

## 5. The repo-root tracked `.claude/settings.json`

```json
{ "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": { "ask": ["<every publish/schedule/comment/message MCP tool, under every server name>"] } }
```
No `allow` list for any write-shaped tool. `verify-publishing-safety.mjs` checks this file.

## Checkpoint

- `ls -l AGENTS.md tenants/*/AGENTS.md brain/AGENTS.md` shows symlinks to `CLAUDE.md` (or, on a system
  that refuses symlinks, files whose first line is the generated-copy header and whose rest equals
  `CLAUDE.md`).
- No tenant `CLAUDE.md` mentions the kit's approval state or copies kit content.
- Every path in every Routing Map exists (write a tiny script that extracts the backticked paths from
  the tables and tests them; fix or remove every miss).
- `verify-tenants.mjs` canary 5 confirms the chat agent cannot write `CLAUDE.md`.
