# Reference 9 — The Assistant (chat) surface

A chat pane inside the OS that already knows the brand: it opens with the strategy block, so you can
ask "give me three hooks for this idea" without re-explaining who you are every time.

It is the easiest view to build badly, because a chat that *renders* looks finished. Every rule
below is a defect that shipped in the reference implementation and was caught by review — a
screenshot of an assistant printing literal `**bold**`, English text bidi-mangled inside an RTL page,
one ephemeral thread lost on reload, and a bounded box floating in an empty pane.

---

## 9a. Conversations are a real store, not component state

`content-os/chats.json`, owned by `app/src/lib/chats-core.mjs` — the **same** shape as the idea
store (reference 7b): atomic tmp+rename writes, a `globalThis` mutex, reads that never throw.

```jsonc
{ "version": 1, "updated_at": "<ISO>", "chats": [
  { "id": "<uuid>", "title": "…", "created_at": "", "updated_at": "",
    "messages": [ { "id": "<uuid>", "role": "user|assistant", "content": "", "ts": "", "error": false } ] } ] }
```

Exports: `readChats` · `writeChatsAtomic` · `withChats` · `deriveTitle` · `createChat` · `findChat` ·
`appendMessage` · `renameChat` · `deleteChat` · `listSummaries`.

- **`listSummaries` returns no message bodies.** The rail needs a title, a time and a count; sending
  every transcript to render a sidebar is the easiest accidental performance cliff here.
- **Title the chat from the first user message — but only while it is still untitled**, or a manual
  rename gets silently overwritten on the next send.
- `/api/chats` is plain CRUD: `GET` (summaries) · `GET ?id=` (one, with messages) · `POST` · `PATCH`
  (rename) · `DELETE ?id=` / `?all=1`. Every mutation through `withChats()`.

### ⭐ A corrupt store must be quarantined, never overwritten

`readChats` catching everything and returning an empty store makes reads total — which is right —
but it cannot tell **missing** (normal first run) from **unparseable** (a half-written file, a bad
hand-edit). If `withChats` then writes that empty store back, every conversation is gone. Reproduced:
2 chats → truncate the file → one message → the file holds exactly 1 chat and both originals are
unrecoverable. `chats.json` is the only copy of a transcript.

Distinguish the two cases on read, and quarantine before the first write in the degraded case:

```js
renameSync(p, `${p}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`);
```
**The idea store has the identical hazard** — fix it in both.

---

## 9b. The streaming contract

`/api/chat` spawns the agent CLI and streams SSE. Typed frames, one JSON object per `data:` line:

```
{ "type":"start", "chat_id":"…", "message_id":"…" }
{ "type":"delta", "text":"…" }
{ "type":"done",  "message_id":"…", "persisted":true }
{ "type":"error", "message":"…" }
```
Keep `data: [DONE]` as the final line so an older client still terminates.

- Append the **user** message before spawning; append the **assistant** message on the child's
  `close`. A turn that produced nothing is persisted with `error:true` — never leave a user message
  with no reply on disk.
- An unknown `chat_id` (deleted in another tab, a store that degraded) **recovers into a fresh chat**
  rather than 404-ing mid-typing — and ships the real id in the `start` frame.
- **`persisted:false` on the done frame** when the write failed. Otherwise the UI renders the reply
  as saved and it vanishes on reload — the failure mode that is hardest to explain after the fact.
- Cancellation: both `request.signal` and the stream's `cancel()` SIGTERM the child, and the normal
  close path still runs so partial text is kept.
- ⚠️ **Attach `child.stdin.on("error", …)` before writing the prompt** — reference 3's EPIPE trap.
  This route carries the biggest prompt in the system, so it hits the pipe limit first.

### ⭐ Disable the agent's tools, or it answers with an intention instead of an answer

The CLI you spawn is a **full coding agent running inside the user's repo** — it has file, search and
shell tools. Asked a content question it will reasonably decide to *go read the brand files first*.
That consumes the turn, and with a one-turn cap the run ends with `is_error: true` and no result, so
the user sees "no reply". Observed verbatim in the stream:

```
TEXT:   I'll ground these in the actual playbooks and his real builds before writing anything.
user, user      ← tool calls
RESULT  is_error=True | None
```

Telling it "you have no tools" in the system prompt does not work — it can see that it does. Take
them away:

```ts
spawn("claude", ["--print","--verbose","--output-format","stream-json",
                 "--max-turns","1","--tools",'""'], { cwd: ROOT, shell: true })
```
The whole corpus is already in the prompt, so tools buy nothing here and cost the answer.

⚠️ **The `'""'` is quoted on purpose.** With `shell: true`, Node joins the args into a command string
and a bare `""` **vanishes entirely** — the CLI then dies with
`option '--tools <tools...>' argument missing`, which the route reports as a generic "no reply".
Passing the two-character string `'""'` puts literal quotes on the command line for the shell to
strip back into one empty argument. Check your agent's own flag name and empty-value syntax first;
generation/radar routes still NEED their tools, so this applies to the chat route only.

Also add to the system prompt: *you are single-turn with no tools; never answer with an intention
like "let me check the files" — answer now, and if context is missing say so in one line and answer
from what you have.* Belt and braces: the flag removes the capability, the prompt removes the urge.

### Three streaming bugs that are invisible until they aren't

**1. Never split a chunk directly.** `dec.decode(value).split("\n")` drops any frame that straddles a
chunk boundary — silently, into a `catch {}`. Carry the partial line:
```ts
buf += dec.decode(value, { stream: true });
const lines = buf.split("\n"); buf = lines.pop() ?? "";
```
**2. `{ stream: true }` is not optional.** Without it a split multi-byte sequence decodes to `U+FFFD`.
Latin text mostly survives this; Arabic does not — it is ~2 bytes per character, so boundaries land
mid-character constantly. Measured on a 3-byte-chunked stream:
```
without: ��رح��ا يا ج��ال — نص ع��بي ط��يل
with   : مرحبا يا جمال — نص عربي طويل
```
This was the real cause of replies that "came back cut off" — not the model.

**3. Emit the streamed text or the final-result fallback, never both.** Hold the result and decide
once, after the child is done. And test with `.trim()`, not truthiness: a text block containing only
`"\n"` is falsy-adjacent but not falsy, so it suppresses the fallback and persists an empty turn that
the client renders as an error — one turn with two contradictory representations.

---

## 9c. Rendering: markdown, direction, and the pane

- **Render assistant messages as markdown** (`react-markdown` + `remark-gfm` inside your
  `.markdown-body` class). The model replies in markdown whether or not you render it; skip this and
  the user reads literal `**bold**` and backticks. User messages stay plain text with
  `whitespace-pre-wrap`.

- **⭐ Direction is per-message, and this is the one sanctioned exception** to "never set `dir` on a
  component" (reference 2c). An all-English reply inside an RTL page is exactly the documented case
  where the bidi algorithm visibly fails — trailing punctuation jumps to the visual start
  (`?do you want to work on`) and inline code mangles.

```ts
function detectDir(text: string): "ltr" | undefined {
  const t = text
    .replace(/```[\s\S]*?```/g, " ")   // closed fences
    .replace(/```[\s\S]*$/, " ")       // an UNCLOSED fence — mid-stream the closer hasn't arrived
    .replace(/`[^`]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ");
  const ar = (t.match(/[؀-ۿ]/g) || []).length;
  const la = (t.match(/[A-Za-z]/g) || []).length;
  return la > 0 && ar < la * 0.15 ? "ltr" : undefined;   // never "rtl", never "auto"
}
```
  Strip code and URLs **before** counting — they are always Latin and would flip an Arabic reply.
  Returning `undefined` (not `"rtl"`) lets the element inherit, which is the rule. Apply it to the
  message **content** element only. Code blocks are always `dir="ltr"` — that is universally correct,
  not the exception.
  ⚠️ The unclosed-fence line matters because `detectDir` re-runs on every streamed chunk: without it,
  an Arabic answer containing a code block left-aligns while the fence is open and snaps back when it
  closes. Also audit your markdown CSS for physical values — a `text-align: right` on table cells
  overrides the ltr exception and is a logical-property violation anyway.

- **Full height, not a floating box.** The view fills its pane: `flex h-full min-h-0`, a fixed-width
  conversation rail, and a `flex-1 min-w-0` thread whose message list is `flex-1 min-h-0
  overflow-y-auto`. The shell must drop its padding for this one view.

- **Stream into the DOM as it arrives.** Accumulating the whole reply and calling `setState` once at
  the end means the user stares at nothing and then gets a wall of text. Append per delta.

- **Auto-scroll only when already at the bottom.** Track "is the user near the bottom" on scroll and
  pin only then, or you yank the view away from someone reading scrollback.

- Composer is a **textarea** (Enter sends, Shift+Enter newlines, auto-grows), a **Stop** button while
  streaming, and bubbles use logical properties (`ms-auto` / `me-auto`) — never `ml-`/`mr-`.

---

## 9d. ⭐ The URL owns the open conversation

Each conversation is a route: `/assistant/<chat-id>` (reference 3's catch-all supplies the
sub-segment). Reload, back, and a pasted link all land on the same conversation. `chatId` is a
**prop derived from the path**, never a second copy in state.

Use `router.replace` — never `push` — whenever you are *correcting* the address (adopting a
server-recovered id, redirecting away from a deleted chat), so the back button doesn't walk through
synthetic steps the user never took.

**The base route `/assistant` IS the new-conversation screen.** Do not "helpfully" auto-open the most
recent chat there:

> The auto-open effect depends on `chatId`, so it re-fires the instant `chatId` returns to `null` —
> which is exactly what the «new chat» button does. The button navigates to `/assistant` and is
> bounced straight back to the newest conversation. It looks like a dead button, and the cause is
> three components away from the symptom. An empty base route is the honest meaning and has no race.

### ⭐⭐ Never navigate while a turn is in flight — the routing change unmounts you

This is the subtlest bug in the whole surface, and it presents as "the button does nothing".

Sending from the empty state creates a chat and the obvious next line is `nav(id)` so the URL names
it. But moving `/assistant` → `/assistant/<id>` **changes the catch-all segment, so the framework
unmounts and remounts the component mid-request.** Every ref resets — the in-flight guard included —
the fresh instance re-fetches the chat, and the streaming reply renders into a dead tree. Typing a
message into an existing chat works fine (no navigation), so it looks like "only the starter buttons
are broken", which sends you hunting in entirely the wrong place.

**Park the id and navigate in the `finally`, once the turn is done:**
```ts
let createdId: string | null = null;
...
if (!id) { id = await createChat(); createdId = id; }        // do NOT nav here
...
if (f.type === "start" && f.chat_id !== id) { id = f.chat_id; createdId = f.chat_id; }
...
finally { …; if (createdId) nav(createdId, true); }          // safe: a remount now costs nothing
```
**How to confirm it rather than guess:** drive the real page with a browser tool and read the
network log. A `GET /api/chats?id=…` firing *during* the send is proof the guard ref reset, which
can only happen on a remount. That single request is what turned a week of theories into a fix.

### The delete gate must be scoped to the streaming chat, not global

`disabled={stream !== null}` on the delete button looks safe and is a bug: while ANY reply streams,
the trash icon goes inert on **every** row. It dims slightly, nothing happens, nothing explains why
— and the user concludes deletion is broken, when the store was never asked. Scope it:
`disabled={stream !== null && c.id === activeId}`, and give the disabled state a title that says
what to do. Only the conversation actually streaming needs protecting — deleting *that* one
mid-turn grafts the finishing reply onto whatever opens next.

> Debugging note that generalises: when a mutation "does nothing", verify the **store** before
> touching the UI, and verify the UI before rewriting the store. Here the API, the file on disk and
> a scripted delete were all correct on the first try; four rounds of backend suspicion cost real
> time. A disabled control is silent by default — make every guard say why it is refusing.

Two more state hazards in the same area:
- **Skip the message re-fetch while a turn is in flight.** Mid-send the URL *catches up* to a chat
  you are already rendering (created on first send, or adopted from the `start` frame). Re-fetching
  there races the optimistic user bubble and the live stream and can blank both.
- **Guard `send` with a `useRef`, not the streaming state.** `setStream("")` lands after the
  create-chat `await`, so a second Enter still sees `stream === null` and forks a second chat.

---

## Checkpoint

- Ask something in English, then something in Arabic: both render as markdown, neither is
  bidi-mangled, and an Arabic answer containing a code block stays right-aligned **while it streams**.
- Reload mid-conversation → same conversation, full history.
- Click «new chat» → a genuinely empty screen that **stays** empty.
- Send, then reload → the reply is still there. Kill the agent CLI mid-stream → partial text persists
  and the UI leaves no stuck spinner.
- Truncate `chats.json` by hand, send one message → a `.corrupt-*` file exists and still holds the
  original bytes.
- Click a **starter prompt from the empty state** — the reply must arrive. This is the path that
  breaks when navigation happens mid-turn, and the only one that does.
- Start a reply in chat A, then delete chat B while it streams — B must go, A must finish.
- `grep -c 'stdin.on("error"' src/app/api/*/route.ts` → ≥1 for every spawn route.
- Ask a plain content question: the answer must BE the answer, never "let me read your files first".
