# Reference 10: Calendar, publishing and the growth loop (Stage 9)

The promise is *idea → plan → produce → **publish** → **learn***. The calendar is the plan. Publishing
is the one action in the system that touches the outside world. The growth loop turns results into
next week's ideas.

**🔴 The rule: nothing ever posts to a live account without the owner's explicit click at that
moment.** Not "the owner configured it once", not "the owner approved a similar post yesterday". Every publish is its
own confirmation. Everything below enforces that rule in depth.

---

## 1. The calendar (`calendar` module, no external dependencies)

`content/planning/calendar.json` = `{events: Ev[]}`, where `Ev = {id, date:"YYYY-MM-DD", title,
pillar_id?, format?, status?, platform?, description?, content? (markdown), source?, piece?
("content/<collection>/<slug>")}`.
- Statuses: planned → drafted → filming → editing → produced → scheduled → published. **Only the
  publisher writes `scheduled` or `published`**; the chat agent may set only `planned` or `produced`.
- The format and platform pick-lists are fixed per build. **Casing is healed on read** (`carousel` →
  `Carousel`), because the chat agent writes this file by hand, and an unknown spelling renders as a
  value no picker can display.
- `GET` lists events; `POST {date, title, …}` validates `pillar_id` against the kit (400 with the valid
  list) and defaults to the first pillar; `PATCH {id, …}` merges; `DELETE ?id=`. `piece` is sanitized
  with `^content/[a-z-]+/[\w.-]+$`.
- The view: a month grid (configurable week start) with chips coloured by pillar (pillars loaded live
  from `/strategy`, never hardcoded), up to 3 chips per day plus "+N"; a board grouped by status; month
  stats (total, ahead, published); an edit modal (title, date, format, platform, pillar, status,
  description, a markdown body with a write/preview toggle, and a "made piece" preview that opens the
  Viewer); and the **queue panel** of really-scheduled posts when publishing exists.

## 2. Publishing tiers (pick what the user actually has)

| Tier | When | What you build |
|---|---|---|
| **Manual** (the default) | no scheduler | a publish panel per piece: the PNGs zipped for download (`jszip`), the caption in a copy box, the platform, and "mark as published" (which sets the calendar event and calls `markPublished`) |
| **Scheduler** | `BUFFER_API_KEY` + `CLOUDINARY_URL` | the same panel, plus publish now / schedule / queue through the engine's publish route, behind the owner's confirm click |

Don't build the scheduler tier speculatively: it is the only part of the OS that can do harm outside
the machine.

## 3. `publish.ts`: the Buffer GraphQL client

`POST https://api.buffer.com` with `Authorization: Bearer <key>` and `cache:"no-store"`. Throw on an
HTTP error or on `errors[]`. Check Buffer's current API docs before building; this was the shape when
it was measured:
- `bufferKey(env) = env.BUFFER_API_KEY || ""`. A tenant's own `.env.local` wins over the engine env, so
  one business can use a separate Buffer account.
- `listChannels(key)`: `account { organizations { id name } }`, then per org `channels(input:
  {organizationId}) { id name displayName service avatar isQueuePaused }`.
- `createPost(key, {channelId, service, text, media:[{url, video}], dueAt?, kind:"post"|"reel"|"story",
  title?})`: input `{channelId, text, schedulingType:"automatic", mode: dueAt ? "customScheduled" :
  "shareNow", dueAt?, assets: [{image:{url, metadata:{altText}}} | {video:{url, metadata:{thumbnailOffset:1000}}}],
  metadata?}`.
  - ⚠️ **The mutation returns a UNION.** Select `... on PostActionSuccess { post { id dueAt } }` and
    `... on MutationError { message }`, or a refusal decodes as an empty success.
  - ⚠️ `mode` **and** `schedulingType` are both required.
  - ⚠️ Instagram needs `metadata.instagram.type` (**post | reel | story; "carousel" is rejected**: a
    carousel IS a post with several images, max 10) **and** `shouldShareToFeed`. YouTube needs a title
    (≤95 chars) and a `categoryId`.
- `scheduledPosts(key, channels)`: `posts(input:{organizationId, filter:{status:[scheduled], channelIds},
  sort:[{field:dueAt, direction:asc}]})`. `deletePost(key, id)`.
- `pieceMedia(root, rel)`: `rel` must start with `content/` and normalize inside it, and must be a
  directory. `reel.mp4`/`final.mp4` → one video; else every `.png` in `png/` (or the folder itself)
  except `poster.png`, **sorted numerically** (`slide-10` sorts before `slide-2` as a string, and a
  shuffled carousel is worse than a failed one). No media → 409.
- `readPieceCaption`: `caption.md`, else the caption field of the piece's JSON, else an
  `<!-- caption: … -->` comment. `pieceTitle`: `meta.json.title` → `post.json.headline` → the folder name.
- **The per-tenant channel map** `content/planning/publishing.json` = `{buffer_channels: [ids], updated}`.
  One Buffer account can hold every business's channels, so the API key may be shared; **the map is the
  isolation boundary**. Every POST re-checks that the channel is in the map AND still exists in Buffer.
- `scheduled.json` = a snapshot of this tenant's queue (`{updated, channels, posts}`), which the agent
  may READ. It is a read hint only: proposals are always checked against Buffer itself.
- `published.json` = `{entries: [{id, at, scheduled_for, platform, account, piece, media, text,
  submission_id, status: "scheduled"|"submitted"|"failed"|"unscheduled", error?}]}`. **Every attempt is
  logged, failures included.**

## 4. `media-host.mjs`: public URLs

**Buffer takes public URLs, not uploads, and it re-fetches them AT PUBLISH TIME** (the stored asset
source is your URL, not a copy). A post scheduled for days ahead therefore needs a **permanent**
https URL. Tunnels die, and quick-tunnel URLs change on restart.

`hostPublic(absPath, {tenantId, piece, env})` → `{url, video}` uses a **Cloudinary signed upload with
no SDK**: `CLOUDINARY_URL=cloudinary://<key>:<secret>@<cloud>`; `folder = "<app>/<tenantId>/<piece
sanitized>"`; `public_id` = the basename; `signature = sha1("folder=…&overwrite=true&public_id=…&timestamp=…"
+ secret)` (params alphabetical); multipart POST to `https://api.cloudinary.com/v1_1/<cloud>/<image|video>/upload`;
return `secure_url`.

> **The general lesson behind this.** When a third-party UI shows broken media while its API reports
> success, fetch the URL twice: once plain, and once with a browser `User-Agent` and `Accept: image/*`.
> Then compare `content-type`, size and magic bytes (`\x89PNG`). Tunnels (ngrok's free tier serves an
> HTML interstitial to browser-shaped requests), CDNs and hotlink protection all discriminate on exactly
> those headers, and none of them tell you. And **never tunnel the dashboard itself**: its routes spawn
> agents.

## 5. `proposals.mjs`: the chat's unforgeable «confirm» (ship `assets/proposals.mjs`)

Copy the asset verbatim and translate its `MESSAGES`. What follows is why it works this way.

The old design put the publish payload INSIDE the chat message, and the UI drew a working confirm
button for any message of that shape. The model's own reply, or a line written into `chats.json`,
could then render a live confirm with an agent-chosen caption, channel and time. Now:

- The store is `engine/app/.data/proposals.json`, **outside every tenant**, so `Read(../**)` already puts
  it out of the agent's reach. `.data/` writes its own `.gitignore` = `*`. It uses the same mutex and
  atomic writes; reads never throw (unreadable = empty = fail CLOSED); records are pruned 7 days after
  `expires_at`.
- A record: `{id:uuid, tenant, op:"publish"|"unschedule", chat_id, message_id:null→bound,
  status:"open"|"claimed"|"used", created_at, expires_at (+24 h), claimed_at?, used_at?, result?,
  last_error?, …op fields}`. Publish fields: `piece, channel_id, channel_name, channel_service, text,
  scheduledTime|null, unconnected?`. Unschedule fields: `post_id, post_text, post_due_at, channel…`.
- `createProposal(tenantId, fields)` creates an unbound record. `bindProposals(tenantId, ids, {chat_id,
  message_id})` binds only unbound records of this tenant and chat. `getProposal(tenantId, id,
  {messageId})` returns null unless the id is uuid-shaped, the tenant matches, the record is bound, AND
  `messageId` equals the binding (a token copied elsewhere resolves to nothing).
- `claimProposal(…)` is **atomic**: 404 unknown/foreign/unbound/wrong message · 400 wrong op · 410 expired ·
  409 used or claimed → otherwise `claimed`. A double click sends once.
- `settleProposal(…, {ok})`: ok → `used` + result; failure → back to `open` with `last_error`, so the
  same card can retry.

**Chat-side validation** (`publish` / `unschedule` actions): a persisted chat is required. Map platform
names and aliases to Buffer's `service`. **No Buffer key**: an unschedule → ✗; a publish still validates
the piece and creates an `unconnected:true` proposal with no channel, so the owner sees exactly what
WOULD go out. **With a key**: the tenant's channel map must be non-empty; the channels are listed live
and filtered to the map; an unschedule's post must be in THIS tenant's live scheduled posts; a publish
picks the channel by `channel_id`, or by platform (exactly one mapped channel on that network; more than
one → ask which). `at` must parse and be ≥5 minutes in the future. The caption is the owner's text or the
piece's own caption. The report line is `◆ publish|schedule «title» on <network> · <channel> · <when>
‹proposal:<id>›`.

## 6. `/api/[tenant]/publish`: the only code that talks to Buffer

- `GET` → `{configured, hosting, channels (mapped and existing), all, mapped, scheduled, log (last 50),
  error}`; it also rewrites the `scheduled.json` snapshot. Without a key → empty lists.
- `GET ?piece=<rel>` → `{caption}`. `GET ?proposal=<id>&message=<msgId>` → the stored record for the
  card (channel, title, time, full caption, media count + preview) plus a `blocked` reason computed
  **now** ("not connected; confirming will send nothing", "proposed before connecting; ask again"). It
  makes no Buffer call.
- `PUT {channels:[ids], confirm:true}` keeps only ids that exist in Buffer and writes the map.
- `POST {piece, channelId, text, scheduledTime?, confirm:true}` (the panel) or `{proposal_id,
  message_id, confirm:true}` (the chat card; **every field comes from the stored record, and the body
  can change nothing**). 403 in production · 409 with no key · 400 without `confirm:true`. For a
  proposal: claim it; a stored time less than 60 s away → 409 "the time has passed, ask again". The
  channel must be in the map (403) and exist in Buffer (404). Then `pieceMedia` → the caption → `kind`
  (a video → reel; under `content/stories/` → story; else post) → host ≤10 files → `createPost` → log
  `scheduled|submitted` → `markPublished(root, piece, {channel})` (a product counts as posted only on a
  real publish) → settle the proposal. Any failure → log `failed` + 502 + settle (which re-opens the
  proposal).
- `DELETE ?id=<postId>&confirm=1` or `{proposal_id, message_id, confirm:true}`: the post must be in this
  tenant's live scheduled posts (404 otherwise) → `deletePost` → log `unscheduled` → refresh the
  snapshot → settle.

## 7. The UI

- **PublishPanel** (in the piece Viewer): not configured → an instructions card (which key, which file);
  no mapped channels → a channel picker (toggle pills, saved via PUT); else channel pills, a caption
  textarea **pre-filled with the piece's own caption** (the server would send that caption anyway, so
  nothing goes out unseen), a `datetime-local` (empty = now), and a button that is disabled, with the
  reason, when media hosting isn't configured. Then a **confirm step** naming the network, channel,
  time and caption ("this goes to a real account").
- **The queue panel** (in the calendar): this tenant's scheduled posts, each with a two-step «unschedule».
- **ProposalCard** (in the chat): fetched from `GET ?proposal&message`. An unknown id → "no stored
  proposal; nothing can be sent from here". It shows what, network, channel, when, the title, the media
  count and a preview thumbnail, the caption, and any `blocked` warning. Then by status: used → "done";
  expired → "ask again"; claimed → "running…"; open → a confirm button that POSTs (or DELETEs) with
  `{proposal_id, message_id, confirm:true}`.

## 8. The safety layers, and proving them

1. **Behavioural**: the chat may only propose; the agent is told never to say something was published.
   Any `content-publisher` skill states "never publish without an in-the-moment go-ahead".
2. **Permissions**: every publish, schedule, comment and message MCP tool is in `ask` (never `allow`):
   in `PUBLISH_ASK` (inline, for spawned agents), in each tenant's settings, and in the repo-root
   **tracked** `.claude/settings.json`.
3. **The route**: `confirm:true` + a stored proposal or the panel's confirm + loopback + the proxy guard
   + 403 in production.
4. **Verifiable**: `node engine/tools/verify-publishing-safety.mjs [--json]` exits 1 if:
   - any settings layer (root tracked, root local, user, each tenant) has a write-shaped tool in
     `allow` (create/update/delete/share post, schedule, comment, send_message, publish, automation,
     buy, boost, campaign, deploy), or a broad wildcard that would swallow one;
   - a tenant's ask list names no such tool, or the root tracked settings lack the ask policy;
   - the engine's inline settings allow a write tool, or fail to ask for the scheduler tools under every
     server name;
   - `proxy.ts` is missing, lacks the `/api/:path*` matcher, or lacks the origin and cross-site checks;
   - a tenant's `content-publisher` skill (if any) no longer states the never-without-go-ahead rule.

   **Break each check on purpose and confirm it exits 1.** A check that has never fired is not a check.

## 9. The growth loop

```
content/analytics/metrics.md   one block per published piece: what went out, what it did, the verdict
brand/hooks.md                 the hook bank: winners graduate here, WITH their real number
```
- `metrics.md` per piece: date · format · title; pillar · funnel · CTA; the hook used; the numbers; vs
  the account average (▲/▼); and a **verdict** line. **The verdict is written by a human**; an AI must
  not write it.
- **The weekly review** is a chat starter (or a button) that spawns the agent with the `chat` scope and
  this task: read `metrics.md` and the last 14 days of `ideas.json` (produced and rejected); report the 3
  best performers and what they share (**structure, not topic**), the 3 worst and the honest reason,
  whether the actual pillar mix matched the kit's target shares (with real counts), any hook that beat
  the account average (propose promoting it into `hooks.md` **with its real number**), and three bets for
  next week as `idea` add actions. Never invent a number: if it's not in the files, say it's missing.
- **Hooks graduate with their number.** A hook enters the bank only after a piece using it beat the
  account average, recorded with that number attached. This stops the bank filling with hooks that
  merely sound good.

```
radar / competitors / manual / chat → ideas.json (new) → approve (or reject with a reason)
  → generate → produced → calendar → publish (owner's click) → published.json + markPublished
  → analytics → metrics.md verdict → weekly review → hooks.md + next week's ideas → ideas.json
```

## 10. Lessons

- **Unforgeable proposals**: stored outside the tenants, bound to one message id, single-use with an
  atomic claim and a TTL; a failure re-opens.
- **Validate against the scheduler itself**, never against a file the agent can write.
- **Unconnected proposals still render**, with a `blocked` reason computed when fetched.
- **The channel map is the boundary** when one scheduler account holds several businesses.
- **A permanent media URL**, because the scheduler re-fetches at publish time.
- **Every attempt is logged**; a product is "posted" only on a real publish.
- **The panel pre-fills the piece's own caption**; the confirm step names everything.
- **A caption-only draft is a failure**, not a partial success: assert the media count when reading back.
- **Calendar `scheduled`/`published` statuses come only from the publisher.**

## Checkpoint

- Manual tier: the panel opens on a produced piece, the zip downloads with the slides in order, and
  "mark as published" updates the calendar.
- Scheduler tier: pick the channels; schedule a real 8-slide carousel ≥10 minutes ahead to a test
  channel; **open it in Buffer's own web UI**: 8 images, in order, with the caption (never trust an API
  count alone). Unschedule it from the queue panel.
- In the chat: "schedule this for tomorrow at 10" → a ◆ card; confirm → it lands; a second click → "done";
  copy the token into another message → "no stored proposal".
- `verify-publishing-safety.mjs` exits 0, and exits 1 when you temporarily move a publish tool into `allow`.
