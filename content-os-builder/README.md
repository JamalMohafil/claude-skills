# content-os-builder

A skill that makes your AI coding agent build you a **content operating system**: a local dashboard
that runs *idea → approve → produce → publish → learn* for **one business, or for many businesses kept
strictly apart** (an agency's clients, or a person with several brands).

It **interviews you first**, and the first question is: *one business, or several isolated
businesses?* Then it builds the whole system around your answers. Nothing is hardcoded to anyone's
brand.

## What you get

- **A workspace per business**, each with its own brand kit, ideas, content, memory, chat, publishing
  channels and API keys. A picker switches between them, and each workspace takes its own accent colour.
  With one business there's no picker: it opens straight in.
- **A brand kit the AI drafts and you approve.** It can be drafted by an in-app interview, or by an
  agent that researches the business's own files, website and competitors and lists every assumption
  for you to confirm. Nothing becomes the brand until you click **Approve**, and nothing is generated
  for a business until its kit is approved.
- **An idea queue**: deduplicated, validated against the kit, and guarded against repetition (the same
  form or the same lesson over and over). Nothing gets produced until you approve the idea.
- **A grounded trend radar** (daily, or on demand). Every idea's source is re-opened, dated and
  quote-checked **by code** before it reaches you. Social posts, the brand's own pages, paid placements
  and stale news are dropped, with the reason shown.
- **Competitor tracking**: YouTube, Instagram, TikTok and X. It finds each competitor's posts that beat
  that account's own median, transcribes them (studied from transcripts, not captions), and turns them
  into ideas with a real differentiator.
- **Production**: carousels, stories, presentations, scripts and single posts as HTML exported to PNG,
  plus optional AI image posts, AI video, browser-driven AI video (storyboard → your OK → video) and
  Remotion animations. «Edit» any piece in plain words, with undo.
- **A chat assistant per workspace** that knows the brand, remembers what you tell it, and can act: add
  and approve ideas, start scans, generate, and *propose* a post you confirm with one click.
- **Publishing through Buffer** (optional), only on your click, to the channels you picked for that
  workspace. Plus a calendar and a growth loop.
- **An agency CRM** (optional): leads, calls (with Cal.com), clients, payments, specs and partners. The
  funnel numbers are computed, never typed in.
- **An owner "brain"** (optional): one knowledge vault across all your businesses, shown as a 3D graph.
  Each business's assistant only ever sees the notes tagged with that business.

## Safety, by design

- **No AI agent ever gets a shell**, and each one is confined to its own business folder. This is
  proven by real canary tests: a throwaway "attacker" workspace tries to read and write another one, and
  every check is made on disk.
- **No AI can write your brand kit**, your idea store, your CRM or your publishing records. It can only
  propose; the engine validates; you approve.
- **Nothing publishes without your click at that moment.**
- **Keys stay where they belong.** Each business's own account keys live in its own `.env.local` and
  are never shared with another business or handed to an agent.
- The dashboard runs on your machine only (`127.0.0.1`), behind a guard that refuses any other
  website's requests.

## Install

**Claude Code.** Put the folder in your skills directory:
```bash
git clone <this repo> && cp -r <repo>/content-os-builder ~/.claude/skills/
# or, for one project only: cp -r <repo>/content-os-builder <project>/.claude/skills/
```
Then, in a new empty folder, ask: **"run content-os-builder"** or **"build me a content OS"**.

**Codex, Cursor, Kimi or any agent with file and shell access.** Copy the folder into your project (or
your agent's skills folder, if it has one) and say:
> Read `content-os-builder/SKILL.md` and follow it. Start with the interview; don't build anything until I confirm the summary.

## What you need

**Always:**
- macOS or Linux (on Windows, WSL is recommended; native Windows works with symlink fallbacks).
- Node ≥ 20 and pnpm.
- Playwright's Chromium (the build installs it).
- **An agent CLI the dashboard can run in the background.** It is built for **Claude Code** (`claude`):
  a normal subscription login is enough, no API key needed. Another CLI works only if it can be confined
  in the same way (no shell, a fixed tool list, deny rules it can't edit); the skill explains how to map
  it and re-prove isolation. If it can't be confined, generation falls back to "copy this prompt into
  your agent".

**Per optional module** (every key can be "later"; the module just shows "not set up yet"):

| Module | You need | Cost |
|---|---|---|
| Trend radar | nothing extra (your agent's web search) | your agent plan |
| YouTube competitors / analytics | `YOUTUBE_API_KEY` | free |
| Instagram / TikTok / X competitors | `APIFY_TOKEN` | paid usage (Apify) |
| Transcribing videos without captions | `OPENAI_API_KEY`, `yt-dlp` | paid per minute (captions are free) |
| Your own Instagram analytics | a Business/Creator account + a Meta app token (per business) | free |
| AI image posts | `OPENAI_API_KEY` (paid, the default), or the `codex` CLI logged in to ChatGPT (free, opt-in per business: it is a shell-capable agent); `ffmpeg` | paid / free |
| AI video (API) | `OPENAI_API_KEY`, `ffmpeg` | paid per clip |
| Browser-driven AI video | a subscription to an AI video tool, Google Chrome, `ffmpeg` | your subscription's credits |
| Animations | Remotion (installed locally) | free |
| Publishing | `BUFFER_API_KEY` + `CLOUDINARY_URL` (media hosting) | Buffer plan; Cloudinary free tier |
| CRM bookings | a Cal.com API key (per business, pasted in the app) | free |
| The brain vault | nothing extra | free |

Never paste a key into the chat: the builder tells you which file each one goes in. If you paste one
anyway, rotate it.

## What the build looks like

1. **The interview**: tenancy first; then you (UI language, timezone); then each business (name,
   colour, modules, how its brand kit is made, platforms, competitors, no-gos). You can answer "later"
   to anything.
2. **The build**, in order: engine → isolation and security → brand kit and idea store → dashboard and
   design → production and export → your optional modules → chat → publishing → CRM → vault → routing
   maps.
3. **Verification**: typecheck, build, unit tests, isolation canaries, publishing safety, one real
   generated piece, and screenshots. The builder reports honestly which checks passed.

The builder never starts the dev server itself. When it's done, you run `cd engine/app && pnpm dev`
and open the dashboard. Each workspace's first step is "approve your brand kit".

## What's inside

| File | Purpose |
|---|---|
| `SKILL.md` | The playbook: interview first, the build order, single vs multi-tenant, the non-negotiables |
| `references/1-interview.md` | Every interview question (system, then per business) and where each answer goes |
| `references/2-architecture-and-tenancy.md` | Engine vs tenant folders, the manifest, the bootstrap, `new-tenant`, single-tenant mode |
| `references/3-security-and-agents.md` | Agent confinement, the spawn helper, the API guard, env isolation, the canary verifier |
| `references/4-brand-kit-and-ideas.md` | The brand kit schema, the one prompt renderer, interview/research/approval, the idea store |
| `references/5-dashboard-and-design.md` | The picker, the workspace shell, views, design tokens, RTL, phone layout |
| `references/6-production-and-export.md` | Generation jobs, scaffolding, the trusted exporter, «edit», builder skills, the product library |
| `references/7-media-engines.md` | AI image posts, AI video, browser-driven video, Remotion animations |
| `references/8-radar-competitors-and-analytics.md` | The grounded radar, its verifier and health, competitors, transcripts, analytics |
| `references/9-assistant-and-memory.md` | The chat: streaming, memory, actions, the safety floor against injected instructions |
| `references/10-publishing-calendar-and-growth.md` | The calendar, owner-confirmed publishing, media hosting, the growth loop |
| `references/11-crm-and-partners.md` | Leads, calls, clients, payments, Cal.com sync, partners |
| `references/12-brain.md` | The owner's knowledge vault, sync, search, filing and asking agents, the 3D graph |
| `references/13-routing-maps-and-agents-md.md` | `CLAUDE.md` / `AGENTS.md` templates and routing maps |
| `references/14-verification.md` | The definition of done |
| `assets/*.mjs`, `assets/proxy.ts` | Eleven files copied into the build verbatim: tenancy and per-business settings, confinement, the API guard, the exporter, the variety gates, the idea store, the radar verifier and its JSON reader, publish proposals, `new-tenant` and `sync-tenant` |

## Status

The architecture, and every lesson in the references, come from a content OS that runs several
businesses in production. Each rule records the bug that made it necessary. The code assets are taken
from that system and generalised for any business and language (owner-facing sentences and language
data sit in marked `EDIT:` blocks); `sync-tenant.mjs`, the per-business `settings` and a few hardening
steps (the exporter's narrower file scope, the loopback fetch rules) go beyond it. The playbook as a
whole is a specification: run each stage's checkpoint as you go, because that is what catches a weaker
model's shortcuts.

There is no login: the dashboard is a local tool for one operator, and "your click" means whoever is at
that machine. Per-person approval for a team needs an authentication layer this skill does not build.

RTL languages (Arabic, Hebrew, Persian, Urdu) are first-class: direction is set once at the root,
layouts use logical properties, Arabic text is never letter-spaced, and on-video text is rendered in a
real browser because ffmpeg cannot shape it.
