# Reference 9: The assistant, its memory and its actions (Stage 8)

The assistant is a chat pane inside each workspace that already knows the business: every turn opens
with the strategy block, the brand docs and the workspace's memory. It **acts**: it has file tools
inside its tenant, and it can ask the engine to run actions (add an idea, start a scan, generate,
propose a publish). It never gets a shell, and it never writes engine-owned files.

It is the easiest view to build badly, because a chat that *renders* looks finished. Every rule below
is a defect that shipped once.

```
api/[tenant]/chat/route.ts     POST: one streamed assistant turn (SSE), then the engine runs the actions
api/[tenant]/chats/route.ts    GET/POST/PATCH/DELETE: the chat store (no AI)
src/lib/chats-core.mjs         the chat store (zero deps)
src/lib/agent-actions.mjs      the "hands" instructions · extractActions() · ownerAsked() · LANGUAGE_RULE
src/views/assistant.tsx        the rail + thread + composer + action rows + proposal cards
<tenant>/content/chats.json    conversations (engine-written only)
<tenant>/memory/MEMORY.md      the memory index (one line per memory file)
<tenant>/memory/{rules,people,decisions,projects,lessons,notes}/*.md
```

## 1. The chat store (`chats-core.mjs`)

```jsonc
{ "version": 1, "updated_at": "ISO|null",
  "chats": [ { "id": "<uuid>", "title": "…", "created_at": "", "updated_at": "", "mode": "interview",   // mode only for the brand interview
               "messages": [ { "id": "<uuid>", "role": "user|assistant", "content": "", "ts": "", "error": false } ] } ] }
```
It has the same guarantees as the idea store: `crypto.randomUUID()` ids, atomic temp + rename writes,
a promise-chain mutex on `globalThis.__chatsMutex`, and reads that never throw.
- **A corrupt store is quarantined, never overwritten.** ENOENT → empty. An unparseable file → empty
  and marked DEGRADED (a non-enumerable flag), and the first write renames the bad file to
  `chats.json.corrupt-<iso>`. This was reproduced: with two chats, truncate the file, send one message,
  and both originals were gone. `chats.json` is the only copy of a transcript.
- A stored message without an id gets a DERIVED id (`<chat id>:<index>`), never a fresh uuid on read;
  otherwise reads disagree with each other and churn the React keys.
- **Set the title from the first user message only while it is still the placeholder**, so a manual
  rename is never overwritten. `deriveTitle`: strip zero-width and bidi marks, take the first non-empty
  line, collapse whitespace, ≤48 chars, cut at a word boundary.
- **`listSummaries` returns no message bodies**: `{id, title, created_at, updated_at, message_count,
  preview(≤140)}`, sorted by updated desc then id. Sending every transcript to render a sidebar is the
  easiest performance cliff here.
- `/api/[tenant]/chats`: `GET` → `{chats}`; `GET ?id=` → `{chat}` or 404; `POST {title?, mode?}` → 201;
  `PATCH {id, title}`; `DELETE ?id=` or `?all=1`. A broken store on GET returns an empty list with a
  `warning`, never a 500.

## 2. The streamed turn: `POST /api/[tenant]/chat {chat_id, message}`

403 in production. Module `assistant`.
1. **Persist the user message BEFORE spawning.** An unknown `chat_id` (deleted in another tab) creates
   a fresh chat instead of a 404, and the real id is sent in the `start` frame.
2. **Window the history**: drop error and empty messages, keep the last 12 verbatim, and count the
   rest as `omitted`. Flattening the whole thread into every prompt drowned the question; hiding the
   omission made the model confabulate the missing part.
3. Build the prompt (§3) and spawn the **`chat` profile** (file tools inside the tenant, no shell),
   `maxTurns: 14`, streaming, with the reference-3 spawning checklist.
4. Stream SSE (§4) while parsing stdout (§5).
5. On close or error → `settle()` (§6).

## 3. Prompt assembly (rebuilt PER REQUEST, so a brand or memory edit applies on the next message)

```
You are the senior content assistant for <business name> (workspace "<id>").
<renderStrategyBlock("chat")>   ← or DRAFT_HEADER (reference 4 §3) when there is no approved kit AND
                                  (chat.mode === "interview" or brand_status === "draft")
---
## THE DETAILED CORPUS (reference — the structured strategy above governs)
<tenant CLAUDE.md> · <each brand/*.md as "--- brand/<f> ---\n…"> · <loadMemory()>
<the vault block, optional (reference 12): ≤4,000 chars, only notes tagged with THIS workspace>
RULES:
- FILE tools inside this workspace only (no shell, no web). The corpus is already loaded: don't re-read it;
  read a file only when the answer needs something not above. Never end a turn on an intention
  ("let me check…"): finish, then answer.
- Missing or thin context → say which part in ONE line, then answer from what IS there.
- Tie suggestions to real proof in the kit; never invent a number, result or client detail — ask.
- You know ONE business. Asked about any other business or brand, say plainly you have no information
  about it here.
- [library module] Products exist ONLY as library/products/*/product.json.
- A strategy change is only ever a PROPOSAL; never edit brand/strategy.json.
## TODAY  <todayBlock()>
<agentHandsInstructions({tenantId, modules, formats})>
<interviewInstructions(...) — only when chat.mode === "interview" (reference 4)>
---
<LANGUAGE_RULE>
<the rendered conversation>
```
- **Never pair the fallback with the interview.** With no approved kit, `renderStrategyBlock` returns
  `FALLBACK` ("refuse CTAs, voice, sales copy…"), which flatly contradicts interview instructions that
  ask the agent to draft voice, offers and CTAs. An interview chat (or any chat while a draft is
  pending) gets `DRAFT_HEADER` instead, and the agent can read the pending draft.
- **`todayBlock()`** uses the server clock: `Now: YYYY-MM-DD HH:MM (UTC±hh:mm), <weekday>` + "Never
  compute a weekday yourself; read it from this table" + 15 lines of `YYYY-MM-DD <weekday> (today|tomorrow)`
  in English and the owner's language. With no date, the agent once inferred "today" from file names
  and put a Friday on a Thursday.
- **The language rule is the LAST line before the conversation**: "Reply in the owner's language
  (<dialect>) when they write in it, even though these instructions are in English." Buried mid-prompt
  under a long English corpus, it lost, and a question in Arabic came back entirely in English. Repeat
  it at the end of the hands instructions too.
- `renderConversation(window, omitted)`: a first message alone → the raw text. Otherwise:
  `[Context note: N earlier messages are NOT included below. If the answer depends on them, say so and
  ask — never guess.]` + `Conversation so far:` + `The user's latest message: …`.

### Memory loading (`loadMemory(root)`)

Collect every `*.md` under `memory/` (depth ≤4, skipping dotfiles and `MEMORY.md`), sorted.
- Total ≤ **40,000 chars** → load every file whole (`--- memory/<rel> ---`).
- Bigger → `syncMemoryIndex()`, then load `memory/MEMORY.md` (labelled "the index: Read the files the
  question needs; don't Read them all") plus every file under `memory/rules/` whole, capped at
  **150,000 chars**. Announce skipped rule files ("N rule files not loaded (size cap); Read them from
  memory/rules/").
- `syncMemoryIndex()`: the ENGINE appends a line for any memory file whose path is missing from the
  index (`- [<basename>](<path>) — <first heading, ≤120 chars>`), and creates the index if needed, so
  nothing the agent wrote becomes invisible once memory outgrows a full load.

## 4. SSE frames (`text/event-stream`, `Cache-Control: no-cache, no-store`, `X-Accel-Buffering: no`)

```
data: {"type":"start","chat_id":"<real id>","message_id":"<provisional uuid>"}
data: {"type":"delta","text":"…"}
data: {"type":"draft","ok":true} | {"type":"draft","ok":false,"errors":[…]}      (interview chats only)
data: {"type":"actions","note":"<✓/✗/▶/◆ lines>","message_id":"<stored id of the note>"}
data: {"type":"error","message":"…"}
data: {"type":"done","message_id":"<stored id>","persisted":true|false}
data: [DONE]
```
**`persisted:false`** when the store write failed; otherwise the UI shows a reply that vanishes on reload.

## 5. Parsing the agent's stream

- `stdout.setEncoding("utf8")`, accumulate, split on `\n`, keep the trailing partial line, and flush on
  `end`. `chunk.toString()` corrupts a multi-byte character split across chunks, and splitting each
  chunk directly drops half-lines (whole paragraphs went missing that way).
- **Narration hold-back.** With file tools, the CLI emits a short text block ("Checking whether the
  handle is already tracked.") and then the tool call it announced, in a separate event with the same
  message id. Streamed as-is, that aside reached the owner glued onto the real answer. Hold each text
  block until the next event: if it is ≤300 chars and followed by a `tool_use` in the same message, it
  is narration. Never show it, but still scan it for action blocks. Otherwise, flush it as a `delta`.
- `type:"result"`: flush, then HOLD the result and `is_error`. Never emit it while streaming.
- Cancellation: both `request.signal` aborting and the stream's `cancel()` SIGTERM the child, and the
  normal close path still runs, so partial text persists.

## 6. `settle()`

1. Decide ONCE, after close: `text = streamed.trim() ? streamed : ""`. If it is empty and a non-error
   held `result` exists, emit that once and use it. Otherwise this is an error turn ("stopped before
   anything arrived" or "no reply: send again", plus the first line of stderr). Use `.trim()`, not
   truthiness: a whitespace-only block once persisted an empty "success" while the client drew an error.
2. Persist the assistant message (failures included, with `error:true`).
3. Interview chats: `extractDraftBlock` → `writeDraft` (reference 4). On failure, append a note listing
   the problems and send a `draft` frame with the errors.
4. Engine actions (not on error turns): `extractActions([...narration, text].join("\n\n"))`, then run up
   to **5** in order. More than 5 → a ✗ line saying the rest were not run. Persist the report lines as
   ONE assistant note message, bind any proposals to that note's stored id, start the job watchers, and
   send the `actions` frame.
5. `error` frame if failed; `done`; `[DONE]`; close.

## 7. The agent's hands (`agent-actions.mjs`)

### 7.1 File duties (told in `agentHandsInstructions`)

- Work silently: no text before or between tool calls; the owner sees only the final answer. Glob
  always with an explicit `path`.
- **Design changes** → edit `brand/templates/carousel.html` / `story.html` (create one from the newest
  project if missing, with the `{{slug}} {{accent}} {{handle}}` placeholders). Lasting build rules go
  in `brand/carousel-rules.md` / `story-rules.md`. When the owner changes a **size or colour**, edit the
  template AND write the exact value into the rules file as a dated floor. The builder re-sizes type to
  fit the text and once shrank a headline the owner had just enlarged. Say that already-made pieces
  keep their look. Skills are read-only.
- **Memory** → when the owner states a preference, fact or decision, or corrects you: one short dated
  file per topic in `memory/rules/` (binding, always loaded), `people/`, `decisions/` (decision + why),
  `projects/`, `lessons/` (what broke + the fix) or `notes/`; add `- [title](folder/file.md) — what it
  says` to `memory/MEMORY.md`; update an existing topic file instead of writing a twin.
- **Partners** → a business that is not this one → `work/partners/<slug>.md` (reference 11).
- **CRM** → `work/crm/*.json` is read-only: read it to answer; changes go through the CRM page.
- **Ideas** → `content/ideas.json` is read-only; change it only through the `idea` action.
- **Competitors** → `content/analytics/competitors.json` is megabytes: never read it whole and never
  edit it. Grep the handle before an add.
- **Calendar** → `content/planning/calendar.json` may be edited directly, with only the vocabularies the
  calendar view knows. `status` is only `planned` or `produced`, never `scheduled` or `published`:
  those mean the scheduler really did it, and an agent faking them made the plan lie. **Scheduling means
  a calendar entry only**: offer "make it now?" and wait. Human fields never carry internal ids.
- **Publishing** → only PROPOSE, with `publish` / `unschedule`. Always emit the block when asked (the
  engine decides whether publishing is connected). "This one" = the last `‹piece:…›` token in the chat.
  Never write a ◆ line or a proposal token yourself, and never say something was published.

### 7.2 The `os-action` protocol

The agent writes fenced blocks (language `os-action`), one JSON object each, anywhere in its reply.
`extractActions(text)` = the regex ```` ```os-action\s*\n([\s\S]*?)\n``` ````, then `JSON.parse`,
keeping only objects with a string `action`. Malformed blocks are skipped, never guessed. The agent
must not write engine-owned files, so it **asks**; the route executes, and writes one report line per
action as its own message, so the NEXT turn knows what really happened.

| action | fields | the engine does (every check server-side) |
|---|---|---|
| `idea` op `add` | `text, pillar_id, persona_ids[], shape_id?, core_lesson?, angle?, funnel_stage?, approve?` | needs `ideas` + a readable kit; soft validation; `insertIdea` under the mutex (dedup + saturation); `approve:true` is honoured only if `ownerAsked(msg, "approve")`; remembers `lastIdeaId` |
| `idea` op `approve` / `reject` | `id` (full, or a unique prefix of ≥8 chars), `reason` (reject, ≥3 chars) | approve requires `ownerAsked`; an unverified radar idea can't be approved |
| `generate` | `type`, `idea_id` (approved, or `"new"` = lastIdeaId) or `product_slug`, `notes?` | type ∈ formats; engine present; brand approved; `ownerAsked(msg, "generate")`; no running job. The brief = the idea + **the owner's last 3 messages verbatim, labelled as the owner's words** + the agent's `notes`, **labelled as its own summary, which never overrides the idea record or the kit** |
| `radar` / `competitor_ideas` | `post_ids?` (≤10) | module + brand approved + no running scan → starts the job |
| `competitor` op `add` / `remove` | `platform, handle, note?` / `id` or `handle` | a server-to-server call to the SAME route the UI uses, sending `Origin: http://127.0.0.1:<port>` so the proxy guard accepts it |
| `publish` / `unschedule` | `piece, platform?, channel_id?, at?, caption?` / `post_id` | creates a **proposal**, never sends (reference 10) |

Report lines (in the owner's language): `✓` done · `✗` refused or failed (with the reason, and for an
`ownerAsked` refusal, the words that unlock it) · `▶` a job started, ending with `‹job:<8 hex>›` · `◆`
a proposal, ending with `‹proposal:<uuid>›`.

> Why the brief labels matter: the agent once put a CTA into its `notes`, the brief called that "what
> the owner said", and the builder overrode the idea record with it.

### 7.3 `ownerAsked(message, "approve"|"generate")`: a deterministic floor

The agent reads text other people wrote (competitor captions and transcripts, radar sources). An
instruction planted there must not be able to approve an idea or start a paid run on a turn where the
owner asked for neither.
- `yes` = the message is ≤60 chars and starts with a short affirmative (in the owner's language plus
  ok/okay/yes/yep/sure/go), followed by the end, a space or punctuation. Use a lookahead with
  `[\p{P}\p{S}]` and the `u` flag: non-Latin letters are not `\w`, so `\b` never fires after them.
- approve: `yes || ASK_APPROVE || ASK_MAKE || FORMAT_WORD`.
- generate: if `ASK_SCHEDULE` matches and `ASK_MAKE` doesn't → false (scheduling is a calendar entry,
  not a production run); else `yes || ASK_MAKE || FORMAT_WORD`.
- The regexes cover approve verbs, make/generate/create/build verbs, format nouns and schedule words,
  each in English and the owner's language.

It is deliberately generous: a false "yes" only falls back to the agent's judgement, and a false "no"
is reported in the chat with the words that unlock it.

### 7.4 Job outcomes come back into the chat

The chat used to promise "I'll tell you when it's done" and then never mentioned a failure. Now
`watchJob(t, chatId, {kind, job, tag, label})` polls every 4 s (`unref()`), reading the tenant's job
from the `globalThis` store:
- the job is no longer running → `outcomeNote()`;
- the store now holds a DIFFERENT job object → "✗ <label>: cancelled ‹job:tag›" (bound by identity, so
  a newer job never reports as this one);
- more than 2 h → "✗ still running after two hours; check the job panel".

The note is appended to the chat. A finished generation reads `✓ finished <label>: «title»
‹piece:<content/...folder>|<preview png>› ‹job:tag›`. A failure gives the job's last ✗ line, with paths
stripped. A radar run gives "✓ N ideas added · M duplicates", or, for a failure, **exactly** "0 kept / N
rejected by source verification" when that's what happened.

## 8. The chat UI (`views/assistant.tsx`)

- **The URL owns the open chat**: `/<tenant>/assistant/<chat-id>`. `/assistant` alone IS the new-chat
  screen. Never auto-open the newest chat there: the auto-open effect re-fires when the id returns to
  null, which is exactly what "new chat" does, so the button bounced straight back and looked dead.
- **⭐ Never navigate while a turn is in flight.** Moving `/assistant` → `/assistant/<id>` changes the
  catch-all segment, so the framework **remounts the view mid-request**: every ref resets (the
  in-flight guard included) and the reply renders into a dead tree. Typing into an existing chat works,
  so it looks like "only the starter buttons are broken". Park the new id and navigate in `finally`.
  How to confirm it: drive the page with a browser tool, and look for a `GET /chats?id=` firing
  *during* the send. That request can only happen on a remount.
- Skip the message re-fetch while a turn is in flight (the URL catching up would race the optimistic
  bubble and the stream). Guard `send` with a `useRef`, not the streaming state, because a second Enter
  lands before `setState` does.
- Read SSE with `TextDecoder` `{stream: true}` and a carried line buffer. Without `stream:true`, a split
  multi-byte sequence decodes to U+FFFD; Latin mostly survives, Arabic does not, and that was the real
  cause of replies that "came back cut off". Handle `start` (adopt the server id), `delta` (append live,
  never accumulate-then-set), `draft` (an approve card linking to strategy, or an "incomplete" card),
  `actions` (keep the note and its stored id), `error`, and `done` (`persisted:false` → mark the bubble
  "not saved").
- Assistant messages render as **markdown** (`react-markdown` + `remark-gfm`); fenced `os-action` and
  `strategy-draft` blocks are folded into a `<details>`; code blocks are LTR. **Per-message direction
  via `detectDir()`** is the one sanctioned per-element `dir`: strip code, inline code, URLs **and an
  unclosed fence** (mid-stream the closer hasn't arrived yet) before counting RTL-script letters
  (Hebrew, Arabic, Syriac, Thaana, N'Ko: reference 5 §8), return `"ltr"` only for mostly-Latin text,
  otherwise `undefined` so it inherits.
- A message whose every non-empty line starts with ✓ ✗ ▶ ◆ renders as compact **action rows** (green,
  red, blue, amber). `‹job:x›` is stripped; `‹piece:folder|png›` becomes a thumbnail chip with «open»;
  `‹proposal:uuid›` becomes a `ProposalCard` drawn from the server's record (reference 10).
- While any `▶ … ‹job:x›` from the last 3 h has no matching ✓/✗, re-fetch the open chat every 5 s; this
  stops by itself.
- **Starter prompts are built from the tenant's modules and formats** (max 6), never a generic list. A
  brand-not-approved banner offers "start the brand interview" (`?start=interview` auto-starts once).
- The rail: summaries, inline rename, delete with confirm. **The delete gate is scoped to the chat that
  is streaming**: `disabled={streaming && c.id === activeId}`, with a title saying why. A global gate
  made every trash icon go inert during any reply, and deletion looked broken.
- Full height, not a floating box (`flex h-full min-h-0`; the message list is `flex-1 min-h-0
  overflow-y-auto`; the shell drops its padding for this view). Auto-scroll only when the user is
  already at the bottom. The composer is a textarea (Enter sends, Shift+Enter is a newline,
  auto-grows), with Stop while streaming. Bubbles use `ms-auto` / `me-auto`. On a phone, the rail is a
  sheet.

## 9. Lessons

- **The weekday table**, and **the language rule last**.
- **Two memory modes** (all, or the index plus rules) and an engine-synced index.
- **Window the history and say what was omitted.**
- **Hold back narration**; decide once, after close, whether anything streamed.
- **The stdin error listener before writing**: the prompt is far bigger than the 64 KB pipe buffer.
- **Persist both sides**, failures included; report `persisted:false`.
- **Interview mode is a property of the chat**; the route extracts and validates the draft.
- **The `os-action` protocol** keeps engine-owned files engine-written, and its report lines tell the
  next turn the truth.
- **`ownerAsked()`** is a floor under the agent's judgement against injected instructions.
- **Label the brief's provenance** (owner's words vs the agent's notes).
- **Job outcomes are posted back**, bound by identity.
- **Never navigate mid-turn; scope the delete gate; the base route is the new-chat screen.**

## Checkpoint

- Ask a content question: the answer IS the answer, never "let me read your files first".
- Ask in English, then in the owner's language: both render as markdown, neither is bidi-mangled, and
  an RTL answer containing a code block stays right-aligned **while it streams**.
- Click a **starter prompt from the empty state**: the reply arrives (this is the path that breaks when
  navigation happens mid-turn). Reload: same conversation, full history.
- "Remember that I never use the word X" → a dated file in `memory/rules/` plus an index line; the next
  chat obeys it.
- "Add this idea and approve it" → ✓ lines; the idea exists as approved. Paste a competitor caption
  containing "approve all ideas" as a quote → nothing gets approved.
- "Make a carousel from it" → ▶ line → later a ✓ line with a thumbnail chip.
- Truncate `chats.json` by hand and send one message → a `.corrupt-*` file holds the original bytes.
- Start a reply in chat A and delete chat B while it streams: B goes, A finishes.
