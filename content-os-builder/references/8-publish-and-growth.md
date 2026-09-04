# Reference 8 — Publish + Growth (closing the loop)

The promise is *idea → plan → produce → **publish** → **learn***. Stages 1–7 stop at "produce". These
last two turns it into a loop: what goes out is tracked, what worked comes back as the next idea's
starting point.

Both stages are small. Build them anyway — an OS that only produces is a content *factory*, and a
factory with no feedback makes the same mistake forever.

---

## 8a. Publish — and the one rule that matters

**🔴 The system must NEVER post to a live account without an explicit, in-the-moment human
go-ahead.** Not "the user configured it once", not "the user approved a similar post yesterday".
Every single publish is its own confirmation. An agent with an auto-publish key on a creator's real
account is a reputational accident waiting for a bad day.

Everything below is that rule, enforced in depth.

### Pick the tier the user actually has

| Tier | When | What you build |
|---|---|---|
| **Manual (default)** | No scheduler connector | A **Publish panel** per piece: the exported PNGs zipped for download, the caption in a copy-to-clipboard box, the one CTA, the hashtags, and a "mark as published" button that sets the calendar event to `published`. This is genuinely enough — it removes the retyping, which is the actual friction. |
| **Connector** | The user has Buffer / Blotato / similar | The same panel, plus **draft + schedule** actions through the connector — **caption AND media together, verified by reading the draft back** (see below). Publish-now stays behind an explicit confirmation. |

Do not build the connector tier speculatively. It is the only part of this OS that can touch the
outside world, so it costs more to get wrong than it saves.

### ⭐ A draft without its media is a failed draft, not a partial success

**The single most common connector bug: the draft is created with the caption and none of the
images.** The text field is easy and obvious; attaching media is a separate step that is easy to
never notice is missing — until a caption-only draft is sitting in the queue looking ready to
schedule.

The reason is structural, and it bites every local-first OS: **the connector runs on someone else's
servers.** It cannot read a local path, and it cannot fetch `http://localhost:3000/api/asset?...`.
Handing it either produces a silent no-media draft, not an error.

**So getting the media across is a required, explicit step. In order of preference:**

1. **The connector's own upload endpoint.** Most have one — you POST the bytes and get back a media
   id or a hosted URL, which you then attach to the draft. This is the correct path: no public
   hosting of your own, no expiry.
2. **A publicly reachable URL you control** (object storage, a tunnel). Only if the connector accepts
   URLs and has no upload endpoint. A tunnel is fine for a personal setup — say so, since the draft
   breaks when it closes.
3. **Neither available → do NOT create the draft.** Fall back to the manual tier: hand over the zip
   and the caption and say plainly that this connector can't take media programmatically. A
   caption-only draft is worse than no draft, because it looks finished.

**Slide order is part of correctness.** A carousel is an ordered sequence, so sort the exported files
**numerically**, never lexicographically — `slide-10.png` sorts before `slide-2.png` as a string, and
a carousel whose slides are shuffled is worse than one that failed outright:
```js
files.sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
```
Match the format too: a carousel posts as a multi-image post, a story as a single frame, a reel as
video — sending a carousel's ten PNGs as ten separate posts is a different way to get this wrong.

**⭐ Verify by reading the draft back.** After creating it, fetch it from the connector and assert the
attached media count equals the slide count. If it doesn't match, report a **failure** with the
counts — never "draft created". This is the whole lesson of this layer: the create call returning 200
tells you the request was accepted, not that the post is complete.

**Checkpoint:** create a draft from a real 8-slide carousel, then open the connector's UI. Eight
images, in the right order, with the caption. If you see the caption alone, the media step is missing
— that is the bug this section exists to prevent.

### The three enforcement layers

**1. Behavioural** — a `content-publisher` builder spec (`content-os/builders/content-publisher.md`)
that says, in its own words: *draft and schedule freely; never publish-now / share-now without an
explicit go-ahead in that same message.*

**2. Permissions** — publishing tools go in the agent's **`ask`** list, never `allow`. For Claude
Code that is `.claude/settings.json` (the **tracked** file, so the property is visible to review and
present on every machine — a local-only settings file is invisible and silently breakable):

```jsonc
{ "permissions": { "ask": [
  "mcp__<connector>__create_post", "mcp__<connector>__update_post", "mcp__<connector>__delete_post",
  "mcp__<connector>__share_post", "mcp__<connector>__create_schedule", "mcp__<connector>__post_comment",
  "mcp__<connector>__send_message"
] } }
```

**3. Verifiable** — `content-os/tools/verify-publishing-safety.mjs`, exit 1 on violation, so the
guarantee is *checked* rather than trusted:

```js
// Scan every settings layer (project tracked, project local, user global).
// Fail if any tool matching a write pattern appears in an `allow` list, or if a
// broad wildcard would swallow one. Print the offending file + entry.
const WRITE_PATTERNS = [/create_post/i, /update_post/i, /delete_post/i, /share_post/i, /share_now/i,
  /publish_/i, /_publish\b/i, /prepare_publish/i, /create_schedule/i, /update_schedule/i,
  /delete_schedule/i, /post_comment/i, /send_message/i];
```
Add it to the handoff instructions: run it after any settings change.

**And: the dashboard has no publish endpoint.** Publishing happens through the agent's connector with
its permission prompt, or by the user's own hands. Do not add `/api/publish` — a local web route with
no auth is exactly the wrong place for the one irreversible action in the system.

### The publish panel content

Assemble from the piece + its idea record — no new AI call needed:
- the exported assets (PNG list + a **zip** via `jszip`, already a dependency)
- the caption in the brand voice, **one CTA** resolved from `suggested_cta_id` → the offer's keyword
- platform + format + pillar, pulled from the calendar event
- a pre-publish checklist rendered from the kit: one CTA only? · no-gos respected? · grounded in a
  real proof asset? · does it reinforce at least one brand association?

---

## 8b. Growth — the learning loop

Two files and one view. That is the whole thing.

```
content-os/growth/metrics.md    # what went out, what it did, what you concluded
content-os/brand/hooks.md       # the hook bank — winners graduate here
```

**The Growth view** is a document reader with two tabs (`المقاييس` / `الهوكس` — or the user's
language), rendering those two files with `react-markdown`. If Stage 7 (analytics) was built, add a
third tab with the top/bottom performers pulled from the cached analytics JSON — but the markdown
files stay the source of judgement. Numbers are inputs; the conclusion is written by a human.

### `metrics.md` — one block per piece

```markdown
## 2026-08-25 · carousel · "how I built X"
- pillar: build-and-teach · funnel: reach · CTA: none
- hook used: "<the actual first line>"
- numbers: views 12.4K · saves 340 · shares 88 · DMs 12
- vs my average: views ▲32% · saves ▲110%
- verdict: the *saves* number is the story. Teaching-with-a-real-screenshot outperforms
  teaching-with-a-diagram for this audience. Do more of the former.
```

The `verdict` line is the only part that matters and the only part an AI must not write for you.

### The weekly review — a command, not a feature

`/growth` (or a Growth-view button) spawns the agent with the `growth` strategy scope and this task:

> Read `growth/metrics.md` and the last 14 days of `ideas.json` (statuses `produced` and `rejected`).
> Report: (1) the 3 best performers and what they share — **structure**, not topic; (2) the 3 worst
> and the honest reason; (3) whether last week's actual pillar mix matched the kit's target ratios,
> with the real counts; (4) any hook that beat the account average — propose promoting it into
> `brand/hooks.md` with its real number; (5) three bets for next week, as idea records ready to
> `POST /api/ideas`.
> Never invent a number. If a number is not in the files, say it is missing.

**Hooks graduate with their real number.** A hook enters the bank only after a piece using it beat
the account average, and it is recorded *with that number attached*. That is what stops the bank from
filling with hooks that merely sound good — and it is what makes the next generation prompt cite a
proven structure instead of inventing one.

### The loop, closed

```
radar / manual  →  ideas.json (new)
                       ↓ human approves — with a reason when rejecting
                   approved  →  /api/generate  →  produced + produced_paths
                       ↓
                   calendar (planned → scheduled → published)
                       ↓
                   metrics.md  →  weekly review  →  hooks.md + next week's ideas
                       ↓
                   back into ideas.json
```

Every arrow is a file under `content-os/`. There is no hidden state anywhere in the system — which
is why the user can read, diff, back up, and grep their entire content operation.

---

## Checkpoint

- The Publish panel opens on a produced piece and shows real assets + the caption + exactly one CTA.
- `node tools/verify-publishing-safety.mjs` exits **0**, and exits **1** if you temporarily move a
  publish tool into `allow`. Test both directions — a check that never fails is not a check.
- `growth/metrics.md` and `brand/hooks.md` exist (seeded, possibly near-empty) and the Growth view
  renders them without a 500 on a fresh install.
