# Reference 1: The interview (Stage 0)

Interview first; write no files until the summary is confirmed. The interview has two parts:
**Part A** is asked once, about the system and the machine. **Part B** is repeated for each
business. Ask only what the enabled modules need: if they say "no radar", skip every radar question.

## How to run it

- Use the user's language. Ask **one group per turn**. Each question carries a proposed default in
  brackets, so most answers are "yes" or a small correction.
- **"Later" is always allowed.** Record it in the summary as pending. The part it gates is built in
  its disabled state and shows a visible "not set up yet: <what's missing>" notice. A missing key
  never blocks the build.
- **Probe before you ask.** Check `node -v`, `pnpm -v`, `which claude codex ffmpeg yt-dlp`,
  `claude --version`, the OS and the timezone yourself. Ask only what you cannot detect.
- **Secrets never go in the chat.** For each key, say which file and which variable name, and let the
  user paste it there. If they paste one into the chat anyway, write it to the right file, never echo
  it back, and tell them to rotate it.
- Never invent an answer for the user. A blank is a blank: it becomes `"TBD"` inside a value or an
  honest one-entry list, never a fabricated fact.

---

## Part A: the system (asked once)

### A1. Tenancy: always the first question

> Will this system run **one business** (single-tenant) or **several businesses or clients, each
> fully isolated** (multi-tenant)?
>
> **Single-tenant.** One brand. The dashboard opens straight into it, with no picker. This is the
> simplest to run.
>
> **Multi-tenant.** For an agency, or a person with several brands. Every business gets its own
> folder with its own brand kit, ideas, content, memory, chat, publishing channels and API keys. Its
> AI agent can never read another business's files. A picker at `/` switches between workspaces, and
> the header has a switcher.
>
> Both use the same engine. A single-tenant install is one folder, so adding a business later is a
> new folder, with nothing to migrate.

If multi-tenant, also ask:
1. **How many businesses to set up now** (more can be added any time with `new-tenant`).
2. **Does the agency (or the owner) need a workspace of its own** [yes for an agency]: its own content,
   its CRM (leads, calls, clients, payments) and its partners? It becomes one more tenant, usually
   first in the picker.
3. **Which workspace is the primary one** [the agency's own workspace, else the first business]. It is
   stored as `PRIMARY_TENANT` in `engine/app/src/lib/config.ts` and used only where something has to be
   attributed to one business by default (reference 12 §5 maps the repo root's agent memories to it).

Single-tenant: `PRIMARY_TENANT` is that one workspace.

### A2. The owner

1. **Name**, plus every spelling and alias (a native-script name, a nickname, a handle). Stored as
   `OWNER_NAMES` in `engine/app/src/lib/config.ts`: the competitor tracker uses it to recognise the
   owner's own accounts (never a competitor, never a hit), and the vault uses it for the owner hub.
2. **UI language and direction** [the language they are writing in; RTL if Arabic, Hebrew, Persian or
   Urdu]. Every UI string is written in it.
3. **Dialect the assistant replies in** [the dialect they write in]. Should tech and product names
   stay in English [yes]?
4. **Timezone** [detected]. Used for "today", relative days and every date the engine writes.
5. **What a workspace is called in the UI** [the plain word for "workspace" in their language].

### A3. The machine and the runtime agent

Probe these, then confirm:
1. **OS** (macOS / Linux / Windows). This affects the scheduler, the browser-driven video runner and
   symlinks. On **Windows**, prefer WSL. On native Windows, symlinks need Developer Mode or admin rights;
   without them, `AGENTS.md` files become generated copies (refreshed by `sync-tenant.mjs`) and
   `node_modules` links become directory junctions. Say this before building.
2. **Package manager** [pnpm].
3. **The agent CLI the dashboard will spawn** [`claude`, if installed and logged in]. Explain: the
   engine runs this CLI headless for generation, radar, chat and edits. A subscription login is
   enough; no API key is needed. The isolation layer is built for its flags. A different CLI needs
   its sandbox flags mapped and the canaries re-proven (reference 3). If it cannot be confined, a
   multi-tenant build uses prompt-handoff for generation.
4. **Dashboard port** [3000]. The dev server stays bound to `127.0.0.1`.
5. **Scheduler for the daily radar** [launchd on macOS, cron on Linux, Task Scheduler on Windows,
   or none] and **scan time** [a morning hour].

### A4. Shared keys (engine-wide)

These keys go in `engine/app/.env.local` and are shared by every business. Ask only for the modules
that will be enabled. Each can be "later".

| Key | Enables | Cost |
|---|---|---|
| `YOUTUBE_API_KEY` | YouTube competitor tracking and analytics | free (Google Cloud key) |
| `APIFY_TOKEN` | Instagram (any public account), TikTok and X competitor tracking | paid usage |
| `OPENAI_API_KEY` | transcription for videos without captions; the paid image fallback; AI video | paid |
| `BUFFER_API_KEY` | publishing and scheduling through Buffer | Buffer plan |
| `CLOUDINARY_URL` | public media hosting, which publishing requires | free tier works |

Tools: is the `codex` CLI installed and logged in to a ChatGPT plan (free image posts)? Is `yt-dlp`
installed (free captions and audio)? Is `ffmpeg` installed (image crop, video)?

### A5. System-wide optional modules

1. **The owner's knowledge vault ("brain")** [no]: one notes vault across all businesses, a 3D graph
   page, an "add to brain" inbox filed by an AI clerk, and "ask the brain". Each business's chat only
   ever gets notes tagged with that business. Reference 12.
   - If yes: **should it also collect the coding agents' own memory files** (Claude Code's per-project
     memory, Codex's memories) [no]? Only memories of projects INSIDE this repo are ever collected; other
     projects on the machine (client codebases included) are never read. Stored as
     `BRAIN_AGENT_MEMORY` in `config.ts`.
2. **Daily radar cron** [yes, if any business has the radar]: runs every business that has the radar
   module and an approved kit.
3. **Publishing tools and MCP servers in use** (Buffer, Blotato or others), under **every server name
   they were ever configured as**. Each tool that publishes, schedules, comments or messages goes on
   the `ask` list so nothing runs without a click. Restate the rule out loud: **nothing ever posts to
   a live account without the owner's explicit go-ahead at that moment.**

---

## Part B: per business (repeat for each)

For the second business onwards, offer **"same as <id>"** as the default for every group (modules,
language, competitors' thresholds, radar settings, optional modules) and ask only what differs. Three
clients plus the agency is otherwise about forty questions. The brand kit (B4) is never copied: each
business gets its own.

### B1. Identity (becomes `tenants/<id>/tenant.json`)

1. **Display name.**
2. **Id** [a kebab-case slug of the name]: lowercase `a-z 0-9 -`, 2 to 31 characters, starting with a
   letter, and not `api`, `_next`, `zz-canary` or `brain`.
3. **Kind**: `creator` (a person's personal brand) or `company` (a business or a client).
4. **Accent colour** [`#7c3aed`]: a `#RRGGBB` value. The whole dashboard takes this hue while you're
   in this workspace.
5. **Order in the picker** [the next number].

### B2. Modules, formats and engines

Present this as a checklist with defaults by kind. These three lists are validated against closed
vocabularies (reference 2); never add an id that isn't in them.

**Modules** (sidebar views; off means 404 on the server):

| Module | What it is | Needs |
|---|---|---|
| `home` `strategy` `ideas` `gallery` `settings` | the core | nothing |
| `radar` | daily grounded trend scan → ideas | agent CLI with web tools |
| `search` | search ideas and pieces | nothing |
| `carousels` `stories` `presentations` | produce views | Playwright |
| `scripts` | video scripts as text | nothing |
| `calendar` | plan month, queue panel | nothing |
| `assistant` | chat with memory that can act | agent CLI |
| `inspiration` | competitors, their hits, ideas from hits | YouTube key and/or Apify |
| `analytics` | the business's own posts and audience | its own Meta/YouTube tokens |
| `library` | products with photos + "post this today" | product photos |
| `videos` | storyboard → owner OK → AI video (browser-driven) | an AI video subscription + Chrome |
| `animations` | Remotion motion videos | Remotion (local) |
| `crm` | leads, calls, clients, payments (service businesses) | optional Cal.com key |
| `terminal` | the tenant's slash commands, click to copy | nothing |

**Formats** (what it publishes): `carousel`, `single-post`, `story`, `presentation`, `script`,
`reel-idea` (a written brief for a human to film), `reel-video` (AI video, paid), `ai-video`
(browser-driven storyboard → video), `animation` (Remotion), `community-post` (a daily draft for the
owner's community). `thumbnail` exists in the vocabulary but needs extra work (reference 6, the format
table): offer it only if the owner asks.

**Engines** (how assets render): `html` (always), `image-model` (AI image posts), `video-model` (AI
video API, paid), `browser-video` (an AI video tool driven in the owner's own signed-in browser, on the
owner's subscription), `remotion`.

Defaults:
- **Creator**: core, radar, search, carousels, stories, presentations, scripts, calendar, assistant,
  inspiration, analytics, terminal; formats carousel, story, presentation, script; engine html.
- **Company**: core, radar, search, library, carousels, stories, inspiration, calendar, assistant;
  formats carousel, single-post, story, reel-idea; engine html.
- **Agency's own workspace**: add `crm`.
- Brand-kit path (a) below needs `assistant`: if the owner turns the assistant off, offer only (b) or (c).

### B3. Language and audience

1. **Publishing language and dialect** [same as the UI language]. Stored as `settings.lang` (a BCP-47
   code: `ar`, `en`, `es-MX`…) in `tenant.json`; `settings.dir` is derived. It drives the radar's
   language gate, the starter HTML's `lang`/`dir`, image-text rules and the tenant's law. The dialect
   goes into the kit's `voice.dialect_markers`. An agency's clients often publish in different
   languages: ask per business.
2. **Website and public profiles** (URLs). Used by the research draft.

### B4. The brand kit: how will it be made?

Offer three paths. All three end the same way: **a draft the owner approves with one click in the
strategy view.** Nothing becomes live without that click.

- **(a) In-app interview** [recommended when the owner knows the brand well]: after the build, the
  workspace's assistant interviews the owner one question at a time and writes the draft. It **requires
  the `assistant` module** (force it on for this business, or offer only b or c) and becomes usable once
  Stage 8 is built.
- **(b) Research draft** [recommended for clients]: the workspace's own agent reads the business's
  files, website, public profiles and competitors, then drafts the kit. It lists every assumption
  under "you must confirm".
- **(c) Answer now**: ask the kit questions below during this interview. You write
  `brand/strategy.draft.json`, **never** `strategy.json`.

For path (c), ask in groups (the schema is in reference 4):
1. What the business is and who it serves. Positioning in one sentence. What it IS and IS NOT.
   One contrarian belief.
2. **Brand associations**: the 2–4 things it wants to be known for, each with a one-line test.
   Every piece must reinforce at least one; this is a hard gate.
3. **Pillars**: 3–5, each with a target share. The shares sum to 100%.
4. **Personas**: 2–3, with wants, pains, objection and answer, and what moves them.
5. **Funnel stages** [reach / trust / conversion].
6. **Voice**: tone, dialect markers, hard rules, banned words, emoji policy, 1–2 sample lines.
7. **Visual system**: dark or light background, display and body fonts (Google Fonts that support the
   script), hard rules, canvases.
8. **Offers and CTAs**: the offers, the default CTA and its keywords, max one CTA per piece. Is a
   no-CTA piece valid [yes]? A brand with no offers is valid.
9. **Platforms**: id, real @handle (or blank, never a guess), role, cadence.
10. **Proof bank**: the only claims the AI may cite. Also anything **retired**, which must never be
    repeated. And: when a piece has no proof for a claim, how should it handle it [say less]? Stored as
    `proof_bank.no_proof_framing` only if they give a framing of their own.
11. **Shapes**: the 4–8 recurring *forms* the content takes (not topics). Examples for a creator: "I
    got this wrong → what I'd do instead", "watch me make this"; for a shop or a client: "a customer
    asked → the answer", "one product, shown properly". Flag which ones depend on breaking news, and
    keep at least 2 that don't. If they can't name them yet, offer `STARTER_SHAPES[kind]` from
    `assets/shapes.mjs` and let them rename and cut. Never invent ids.
12. **Video creators only**: filming styles and script principles (hook window, length).

### B5. Platforms and the business's OWN accounts

1. Which platforms, in priority order, with each **real @handle and channel id**. These are needed to
   exclude the brand's own posts from "competitor hits".
2. Its own account credentials, **only if analytics is enabled**. They go in
   `tenants/<id>/.env.local`, never in the engine env. Examples: `META_ACCESS_TOKEN`,
   `INSTAGRAM_ACCOUNT_ID`, `FACEBOOK_PAGE_ID`, `YOUTUBE_CHANNEL_ID`, YouTube OAuth for private
   analytics, `CAL_API_KEY`. Instagram analytics requires a **Business or Creator** account linked to
   a Facebook Page. A personal account cannot use the API at all; check this before promising the
   feature.

### B6. Competitors (only if `inspiration` or `radar`)

Per platform: the YouTube channel URL or @handle, or the Instagram, TikTok or X username, plus **why**
each one is watched (stored as a note). Defaults to confirm (stored in `tenant.json`
`settings.competitors`):
- "already covered" window [90 days] → `covered_window_days`
- "it worked for them" [≥ 2× that account's own median, settled baseline] → `hit_multiplier`
- "recent heavy hitter needs a real differentiator" [a view count that is big FOR THIS NICHE; ask,
  never guess] → `heavy_min_views` (left unset, every precedent inside the window needs a differentiator)
- transcription: free captions first, then paid audio transcription [free only] → `paid_transcription`

### B7. Radar (only if `radar`)

1. What the audience cares about right now: topics, markets, competitor moves. This seeds the
   strategy the scout reads; never hardcode a niche.
2. **No-gos**: topics, framings, people or clients never to mention. Hard filters.
3. News freshness [10 days] → `settings.radar.max_age_days`. Daily cron on/off for this business [on]
   → `settings.radar.cron` (the cron skips a business set to false).
4. Is there a product library to anchor ideas on? Does it make AI videos (so the radar asks for
   visual ideas)?

### B8. Optional modules for this business

Ask only about what B2 enabled:
- **Image posts**: the paid images API [the default], or free through the `codex` CLI's image tool under
  a ChatGPT plan. Explain the trade-off plainly: **Codex is a shell-capable agent**. The engine runs it
  with no keys, in a scratch folder outside the repo, but it can still READ any file on this machine,
  so in a multi-tenant build it is an explicit opt-in per business → `settings.media.codex_images`.
  Which Codex image model to pin [the CLI's default] → `settings.media.codex_image_model`. May a failed
  **edit** fall back to the paid API [no] → `settings.media.edit_paid_fallback`.
- **AI video (paid API)**: OK to spend? Per-run budget?
- **Browser-driven video**: is there a subscription and Chrome? What is the maximum credits one clip
  may cost [ask; suggest a small number from the tool's own price list] → `settings.media.max_credits`
  (unset, nothing is ever approved). May one stuck shot be resubmitted automatically, once [yes]?
- **Animations**: which model builds them [the strongest available]?
- **Product library**: products with real photos; a "today we post this" proposal.
- **Publishing**: through Buffer (+ Cloudinary for media)? Which channels belong to this business?
  (The owner picks them once in the app.)
- **CRM**: default currency (an ISO code like `USD`) → `settings.crm.currency`? Cal.com booking (its
  key is pasted in the app, per business)? Partners memory [yes]?
- **Community post**: does the owner run a community (Discord, Circle, Telegram…) and want a daily
  draft made from the radar's verified findings?
- **Existing material**: a design template (carousel/story HTML), an idea backlog to import once
  (`engine/tools/import-ideas.mjs`, reference 4 §12), brand documents to drop into `brand/`.

### B9. Who works in the dashboard (informational, not a question with options)

Say plainly: **there is no login.** The dashboard runs on `127.0.0.1` for one operator, and "the
owner's click" means whoever is at this machine. A team that needs per-person approval (staff approve
ideas, only the owner approves a kit) needs an authentication layer this skill does not build. Record
any wish for it under PENDING, never as a promise.

---

## The summary (before any file is written)

Echo it compactly, grouped, with every "later" marked:

```
SYSTEM   multi-tenant (agency workspace + 2 clients, primary <id-a>) · UI <language> (RTL) · assistant replies in <dialect> · TZ <zone>
         agent CLI claude (logged in) · port 3000 · radar cron 08:00 via launchd
         vault: yes · shared keys: YouTube ✓ · Apify later · OpenAI ✓ · Buffer later · Cloudinary later
WORKSPACES
  1  <id-a>  "<Name A>"  company  #0ea5e9
     modules: core, radar, library, carousels, stories, inspiration, calendar, assistant
     formats: carousel, single-post, story, reel-idea · engines: html, image-model
     kit: research draft (website + 3 competitors) · lang <code> · no-gos: 3
     settings: radar 10 days, cron on · hits ≥2× · heavy ≥ <n> views · captions only · image posts: paid API
  2  <id-b>  "<Name B>"  creator  #7c3aed
     ...
PENDING  Apify token · Buffer channels for <id-a> · <id-b>'s shapes
RULES    nothing publishes without your click · no AI writes your brand kit · no agent gets a shell
```

Get an explicit **yes**. Then build in the order of `SKILL.md`.

## Where each answer goes

| Answer | File |
|---|---|
| tenancy, UI language, timezone, port, scheduler | engine `CLAUDE.md` + `engine/app/src/lib/config.ts` (UI strings, TZ) + `package.json` dev script |
| owner name and aliases, primary workspace, agent-memory collection | `config.ts`: `OWNER_NAMES`, `PRIMARY_TENANT`, `BRAIN_AGENT_MEMORY` |
| publishing language | `tenant.json` `settings.lang` (+ `settings.dir`) |
| radar freshness, per-business cron | `tenant.json` `settings.radar.{max_age_days, cron}` |
| competitor window, hit multiplier, heavy-hitter threshold, paid transcription | `tenant.json` `settings.competitors.{covered_window_days, hit_multiplier, heavy_min_views, paid_transcription}` |
| image backend, Codex model, paid edit fallback, credit ceiling | `tenant.json` `settings.media.{codex_images, codex_image_model, edit_paid_fallback, max_credits}` |
| CRM currency | `tenant.json` `settings.crm.currency` |
| shared keys | `engine/app/.env.local` (gitignored, mode 0600) |
| business identity, modules, formats, engines, settings | `tenants/<id>/tenant.json`, created by `node engine/tools/new-tenant.mjs` (`--lang <code> --settings '<json>'` carry the settings; `validateManifest` rejects an unknown key or a wrong type) |
| the business's own account keys | `tenants/<id>/.env.local` (gitignored, mode 0600) |
| brand kit, path (c) | `tenants/<id>/brand/strategy.draft.json` (a DRAFT, approved in the app) |
| competitors | the kit's `competitors[]`; added for tracking in the app |
| publishing MCP tool names | `PUBLISH_ASK` in `agent-flags.mjs` + the root tracked `.claude/settings.json` `ask` list |
| owner name and aliases (also) | the vault's owner hub (reference 12) |
| "no proof" framing | the kit's `proof_bank.no_proof_framing` (path c), else nothing |
| existing brand docs, templates | `tenants/<id>/brand/*.md`, `tenants/<id>/brand/templates/<type>.html` |
