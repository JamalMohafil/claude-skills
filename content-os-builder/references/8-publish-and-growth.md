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

**Publishing goes through the connector's MCP tools, driven by the agent — not from a route in the
dashboard.** That is already the rule: the dashboard has no publish endpoint.

⚠️ **But an MCP is a wrapper over the same API — it does not add capabilities the API lacks.** Read
its tool schema before assuming otherwise. Connectors split into two kinds, and which one you have
decides the entire media design:

| | |
|---|---|
| **Has an upload tool** (e.g. Blotato) | Three-call sequence below. Nothing to host, nothing to expire. |
| **Has none** (e.g. Buffer) | It takes **public URLs only**, so you must host the files yourself → **§8b**, which is a much bigger job than it looks. |

**⭐ Where an upload tool exists, it is a THREE-call sequence, and the create call looks
self-sufficient — which is the trap.**
`create_post` takes `text` and `mediaUrls` and returns 200 on its own, so an agent calls it alone and
ships a caption with no images. Real example (Blotato; Buffer and others follow the same shape):

```
1. <connector>_create_presigned_upload_url({ filename: "slide-01.png" })
       → { presignedUrl, publicUrl }
2. curl -X PUT "<presignedUrl>" --data-binary "@<abs path to slide-01.png>"
       ← THE STEP EVERYONE SKIPS. Raw bytes, PUT, not JSON and not multipart.
3. <connector>_create_post({ …, mediaUrls: [publicUrl, publicUrl, …] })
```
Repeat 1–2 per slide, collect the `publicUrl`s **in slide order**, then make one create call with all
of them — for Instagram and LinkedIn a carousel is one post with many URLs, not many posts.

That tool's own description says it outright: *"The upload step is REQUIRED before the local file can
be used"* and *"Do NOT try to send the file directly to create_post"*. **Read the connector's tool
descriptions before wiring it** — the sequence is documented there and nowhere else.

**If the connector has no upload tool**, you are on the public-URL path — read **§8b in full** before
writing any of it. **And if you can neither upload nor host, do NOT create the draft.** Fall back to
the manual tier, hand over the zip and the caption, and say plainly that this connector cannot take
media programmatically. A caption-only draft is worse than no draft, because it looks finished.

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

## 8b. Connector media — the public-URL problem (Buffer, and anything like it)

The connector tier looks done when a draft appears in the dashboard's target app. It isn't. **Text
posts work on the first try and media does not**, and the failure is invisible from the API side —
which is exactly why it costs a debugging session.

### The three facts that shape the whole design

1. **Buffer has no upload endpoint.** Documented, not inferred (`developers.buffer.com/guides/hosting-media.html`).
   Assets are `[{ image: { url } }]` and `url` must be a **public, unauthenticated https** file.
   Probing `upload.buffer.com`, `/1/media/upload.json` and `/upload` all return
   `Unsupported Content-Type` — the endpoint is GraphQL-only.
2. **The MCP does not change this.** The Buffer MCP's `create_post` takes the same
   `assets: [{ image: { url } }]` with the note *"url is a direct file URL"* — no file, path or
   base64 parameter. It is a wrapper over the same API. **Check the MCP's schema before assuming it
   adds a capability the REST/GraphQL API lacks** — usually it does not.
3. **The URL is stored verbatim and re-fetched AT PUBLISH TIME.** Verified: the created asset's
   `source` came back as our own tunnel URL, not a Buffer CDN copy. So a tunnel that dies between
   drafting and publishing produces a post with no images. Say this in the UI; it is not a footnote.

### ⭐ The ngrok interstitial trap — the bug that eats an afternoon

Symptom: the draft is created successfully, the API returns the correct image dimensions
(`2160×2700`), `attached: 9` — **and every thumbnail renders broken in the connector's web UI.**
Everything server-side says success, so you go looking in the wrong layer.

Cause: **ngrok's free tier serves an HTML interstitial to browser-shaped requests.** The connector's
*backend* fetches with a plain user-agent and gets the file. The connector's *UI* loads assets in
`<img>` tags and gets the warning page.

The diagnostic — two curls at the same URL, and the difference is the whole answer:

```bash
# what the connector's SERVER sends
curl -sI "$URL/slide-01.png"
#   200  image/png       1426829 bytes   OK

# what the connector's UI sends
curl -s "$URL/slide-01.png" \
  -H 'User-Agent: Mozilla/5.0 ... Chrome/140.0 Safari/537.36' \
  -H 'Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
#   200  text/html       2803 bytes      BROKEN  <!DOCTYPE html> ...
```

`ngrok-skip-browser-warning: true` bypasses it — **and is useless here, because an `<img>` tag
cannot send custom headers.**

**Fix: use a Cloudflare quick tunnel, not ngrok.**
```bash
cloudflared tunnel --url http://127.0.0.1:<port> --no-autoupdate
```
No interstitial, no account, free. Same browser-shaped request returns a real PNG (check the magic
bytes `\x89PNG\r\n\x1a\n`, not just the status code — a 200 proves nothing here).

> **Generalise this.** Whenever a third-party UI shows broken media while its API reports success,
> fetch the same URL twice — once plain, once with a browser `User-Agent` + `Accept: image/*` — and
> compare `content_type` and size. Tunnels, CDNs and hotlink protection all discriminate on exactly
> those headers, and none of them tell you they are doing it.

### ⭐ Never tunnel the dashboard — tunnel a separate read-only file server

The obvious move is to expose the dev server, since it already serves the images. **Do not.**
`/api/generate` and `/api/radar` spawn the agent CLI with `--dangerously-skip-permissions`, and their
guard only trips on `NODE_ENV === "production"`. A public tunnel to the dev server lets anyone with
the URL run an agent on the user's machine.

Ship `tools/media-server.mjs` instead: a zero-dependency server that serves **only** `*.png` under
`<collection>/<slug>/png/`. Path shape validated segment by segment, realpath containment, no
directory listing, `GET`/`HEAD` only. Prove the blast radius rather than asserting it:

```
/carousels/<slug>/png/slide-01.png  200      <- the only thing reachable
/brand-kit.json                     404
/app/.env.local                     404
/api/generate                       404
/carousels/<slug>/<slug>.html       404
POST anything                       405
```

### Resolving the public base (never hard-code it)

Quick-tunnel URLs change on every restart, so hard-coding one is a trap. Resolve in this order:

1. `MEDIA_PUBLIC_BASE` — permanent hosting (Vercel Blob, R2, any public bucket). Always wins.
2. `.media-base` — written by `tools/start-media-tunnel.sh` (cloudflared).
3. A running ngrok session — **still works, but return a `note` warning that its interstitial will
   render images broken in the connector UI.** A degraded path that explains itself beats one that
   silently reproduces the original bug.

Refuse `localhost` / `127.0.0.1` URLs outright in the client — otherwise you create a draft that
publishes with no images and nothing surfaces the cause.

### Draft-only by construction, and checkable

The connector is the only part of the OS that touches the outside world, so the safety has to live in
the code shape, not in the prompt:

- `saveToDraft: true`, `mode: "addToQueue"` and `schedulingType` are **hard-coded inside the client**,
  never taken from the caller. The string `shareNow` appears nowhere in the file.
- The route **refuses** a caller-supplied `mode` / `dueAt` / `schedulingType` with **403 and a visible
  reason** — not a silent strip.
- After creation, assert the returned `status === "draft"` and that `assets.length` matches what you
  sent; throw loudly otherwise. A zero-image draft that reports success is the failure mode here.
- Extend `verify-publishing-safety.mjs` with these as assertions, then **break each one on purpose and
  confirm it exits 1**. A check that has never fired is not a check.

### Schema gotchas worth writing down (Buffer, 2026)

| Gotcha | Reality |
|---|---|
| Endpoint | `https://api.buffer.com/` — `graph.buffer.com` 401s; legacy `api.bufferapp.com` rejects public tokens (retires 2027-02-01) |
| `createPost` return | A **union** (`PostActionSuccess \| NotFoundError \| ...`). Spread every error arm or a refusal decodes as an empty success |
| Required inputs | `mode` **and** `schedulingType` are non-null even for a draft |
| Instagram | `metadata.instagram.type` **and** `shouldShareToFeed` both required |
| Instagram types | `post \| story \| reel` only — **`carousel` is rejected**; a carousel *is* a `post` with several images (cap 10) |
| Reading assets back | `ImageAsset` exposes `source`/`thumbnail`, **not** `url`/`thumbnailUrl` |

### Checkpoint

- Create a draft with images, then **open it in the connector's web UI** — do not trust `attached: N`.
  This is the only step that catches the interstitial class of bug.
- `curl` the asset URL with a browser `User-Agent` and confirm `content_type: image/png` **and** PNG
  magic bytes.
- Kill the tunnel, then create a draft: it must refuse with an actionable message, not attach zero
  images silently.

---

## 8c. Growth — the learning loop

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
