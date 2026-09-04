# Reference 3 — The dashboard app

A local Next.js (App Router) app under `content-os/app/`. **The filesystem is the database** — every route reads/writes real files under the repo. No DB, no ORM.

Stack: **Next.js (App Router) · React · TypeScript (strict) · Tailwind v4**. Package manager per the kit.

> **Prerequisite: build reference 7 first.** `ideas-core.mjs`, `strategy-block.mjs` and the radar
> contract live in `app/src/lib/` and every route below imports them. Building views before the
> store exists means writing the data layer twice.

---

## Stage 3.0 — bootstrap the app FIRST (do not skip)

A weak model cannot "build the dashboard" until the project exists. Create it explicitly.

```bash
cd content-os
pnpm dlx create-next-app@latest app --ts --app --tailwind --eslint --src-dir --import-alias "@/*" --no-turbopack
cd app
pnpm add react-markdown remark-gfm jszip
pnpm add -D playwright
pnpm exec playwright install chromium   # installs the BROWSER binary — the npm package alone does NOT
```
(Use `npm`/`yarn` equivalents if that's the kit's PM. If `create-next-app` isn't available, create the files manually — see the minimal set below.)

**This is Tailwind v4 — NOT v3.** Do not create a `tailwind.config.js` and do not use `@tailwind base/components/utilities`. v4 setup is:
- `postcss.config.mjs` → `export default { plugins: { "@tailwindcss/postcss": {} } };`
- `src/app/globals.css` first lines (order matters):
  ```css
  @import url('https://fonts.googleapis.com/css2?family=<Display>&family=<Mono>&display=swap'); /* MUST be the very first line */
  @import "tailwindcss";
  @import "./design-tokens.css";
  ```
  The Google-fonts `@import` must be the **first rule in the file** or Lightning CSS (v4) silently drops it and the brand fonts never load.

Minimal deps in `package.json` if building by hand: `next react react-dom` + dev `typescript @types/* tailwindcss @tailwindcss/postcss` + `react-markdown remark-gfm jszip` + dev `playwright`. `tsconfig.json` with `"strict": true`. Verify the app compiles (`pnpm build`) before adding features.

## Structure
```
content-os/
  brand-kit.json   brand/   assets/                # brand-kit.json = the ONE strategy source (ref 7)
  ideas.json                                       # ⭐ the idea STORE (ref 7b) — the database
  radar/feed.md  radar/runs/  radar/failed/        # human log · structured runs · preserved failures
  calendar.json   growth/metrics.md                # SEED these (see "first-load" below)
  carousels/<slug>/  stories/<slug>/  presentations/<slug>/  scripts/<slug>.md  thumbnails/<slug>/
  builders/          # the per-format builder specs the generation agent reads (see reference 4)
  tools/             # scaffold.mjs, radar-cron.sh, strategy-block.mjs, radar-ingest.mjs, verify-publishing-safety.mjs
  app/               # the Next.js dashboard (created above)
    src/lib/         # ⭐ strategy-block.mjs, ideas-core.mjs, radar-contract.mjs, radar-ingest.mjs (ref 7)
    src/app/ page.tsx layout.tsx globals.css design-tokens.css api/*/route.ts
```
`ROOT` in each route = the `content-os/` dir: `const ROOT = join(process.cwd(), "..")` (routes run from `app/`, so one `..`). Every route: `export const runtime = "nodejs"; export const dynamic = "force-dynamic";` and respond `no-store`.

## Views (sidebar, grouped) — include only the ones the user's formats/platforms need
Home · **Strategy** (read-only render of `brand-kit.json` — no edit affordances anywhere) · **Ideas** (the review queue: filter by status/pillar/persona, approve, reject-with-a-reason, then Generate) · Radar · Search · Carousels · Stories · Presentations · **Scripts** (markdown, NOT images — its own reader; never route scripts to the image gallery) · Gallery · **Analytics** + **Inspiration** (only if API credentials were given → reference 6) · Calendar · **Growth** (two markdown tabs: metrics + the hook bank → reference 8b) · Brand · (optional) Assistant/Terminal/Settings.

**Ideas is the centre of gravity, not a list.** It is where a human decides what gets made, so it
needs: status filter chips with counts, the idea's hook/angle/proof visible without opening anything,
a `seen_count` badge when the radar keeps resurfacing it, **Approve** / **Reject** (reject opens a
required reason box), and Generate buttons that are **disabled until status is `approved`** — the
route enforces it with a 409, but a button that 409s is a bug you shipped, not a guardrail.

## ⭐ The Produce views — where an idea becomes a piece

Carousels / Stories / Presentations are **not** three empty tabs. They are **one component reused per
collection**, and each one closes the loop: an approved idea goes in the top, a finished piece comes
out the bottom, in the same screen.

```tsx
<Produce kind="carousel" />   <Produce kind="story" />   <Produce kind="presentation" />
```

**Top half — the ideas you can produce right now.** `GET /api/ideas?status=approved`, showing only
ideas not yet produced in *this* format. Each row: the text, the hook, the pillar, and a single
**Generate** button that POSTs `{ idea_id, type: kind }`. Nothing else needs to be on that button —
the route pulls the whole record (reference 7d).

**Bottom half — the pieces already produced in this collection.** `GET /api/gallery?type=<kind>` →
`[{type, slug, cover, count, mtime}]`. Each card: the cover PNG (through `/api/asset`), the slug, the
slide count and the date. Click opens the media viewer with all slides.

**When the job finishes, this grid must refresh itself.** Poll `/api/generate`; the moment status
leaves `running`, re-fetch **both** halves once (guard by `startedAt` so a reconnect doesn't loop).
Without this the piece is on disk and the screen still says empty — which reads as "generation is
broken" when it worked perfectly.

### The three ways "it generated but nothing appeared" actually happens

1. **The grid only lists pieces that have a cover.** If the agent wrote the HTML but the export step
   never ran, the folder exists with no `png/` — and a cover-only filter renders nothing. **List the
   piece anyway**, with a "built, not exported" badge and a **Re-export** button that runs
   `node <collection>/<slug>/export.mjs`. A half-finished piece the user can see and fix beats an
   empty screen they cannot explain.
2. **The piece landed in the wrong collection.** The scaffold takes the collection as an argument, so
   the generation prompt must pass the same `kind` the button was for. Verify the folder: a carousel
   must be at `carousels/<slug>/`, never `content/carousels/` or the app directory.
3. **The view was never wired to the filesystem at all** — it renders a static empty state because
   nobody specified what it lists. This is the most common one; it is why this section exists.

### The contract that ties it together

The generation agent prints `DONE → <path>` as its last line (reference 4). Parse it from the job
log to open the exact result. **If the job ends `done` without that line, treat it as suspect**: say
so in the UI and re-scan the collection rather than reporting success — the run may have written the
HTML and stopped short of the export.

**Checkpoint:** approve an idea → press Generate on the Carousels view → when the job ends, the piece
appears **in that same view without a manual reload**, its PNGs open in the viewer, and the idea's
status is now `produced`. Repeat for one other format to prove the component is genuinely reused and
not three divergent copies.

## Conventions that avoid real bugs (learned the hard way)
- **Inline SVG icons**, not emoji, in the UI chrome. A small icon map + `<Icon n="..."/>`.
- **Render every `.md`** (scripts, brand docs, calendar body preview) with `react-markdown` + `remark-gfm` (installed above). Don't hand-roll markdown.
- **⭐ Every view is a REAL route, and the URL is the single source of truth for "where am I".**
  Do NOT use hash navigation (`location.hash = view` + a `hashchange` listener). It looks equivalent
  and is not: the address bar shows a bare origin, links can't be shared or middle-clicked, and you
  end up with `view` in React state *and* in the hash — two sources of truth that drift, which is
  why that approach needs a "skip the first write on mount so it doesn't clobber the restored hash"
  hack. If you find yourself writing that hack, you picked the wrong mechanism.
  Since the whole dashboard is one client component, one **optional catch-all** segment serves every
  view — no per-view folder duplication:
  ```
  app/[[...view]]/page.tsx     ← the entire dashboard; there is NO app/page.tsx (it would conflict)
  ```
  ```tsx
  const pathname = usePathname(); const router = useRouter();
  const parts = (pathname || "/").split("/").filter(Boolean);
  const slug = parts[0] || "home";
  const view: View = (slug in META ? slug : "home") as View;   // DERIVED — never mirrored into state
  const sub  = parts[1] ?? null;                                // a detail id, e.g. /assistant/<chat-id>
  const setView = useCallback((v: View) => { router.push(v === "home" ? "/" : `/${v}`); }, [router]);
  ```
  - Static `api/*` route handlers win over the catch-all, so `/api/...` is **not** swallowed — verify
    it in the build output, which must list each `/api/*` separately alongside `ƒ /[[...view]]`.
  - Sidebar items are `<Link href>`, not `<button onClick>` — middle-click, ctrl-click and hover
    preview only work on a real anchor.
  - An unknown slug renders home; `router.replace("/")` so the address bar stops lying about it.
    Strip a sub-segment on views that have no detail page (`/ideas/junk` → `/ideas`).
  - **A detail view puts its id in the path too** — `/assistant/<chat-id>`, not internal state. Use
    `router.replace` (never `push`) whenever you are *correcting* the address — auto-opening the
    newest item, adopting a server-recovered id — so the back button doesn't walk through synthetic
    steps the user never took.
- **Media viewer** lists ALL slides of a piece and cache-busts images with `&v=<mtime>` so a re-exported slide actually refreshes (same URL caches stale otherwise).
- **Asset route** serves only `.png` under the content dir and blocks path traversal. The scripts route sanitizes the slug (`replace(/[^a-z0-9-]/gi,"")`) before reading.
- **First-load safety:** every filesystem READ route must tolerate a missing file — wrap the read in try/catch and return an empty default (`{events:[]}`, `[]`, `""`), **never throw**. On a fresh build the files don't exist yet, so also **seed** `calendar.json` = `{"events":[]}`, `ideas.json` = `{"version":1,"updated_at":null,"ideas":[]}`, an empty `radar/feed.md`, and an empty `growth/metrics.md` during the build, or the first page open 500s.
- **⭐ Never parse markdown to build the Ideas view.** Ideas come from `ideas.json` via
  `ideas-core.mjs` (reference 7b). `radar/feed.md` is a *human research log* — it is written for the
  user to read, never scraped. If you find yourself writing rules like "match only top-level list
  items, skip indented sub-bullets, skip lines starting with `[`", stop: you are reconstructing a
  schema out of prose, and every one of those rules exists only to undo damage the format caused.
  The scout emits structured JSON against a contract (reference 7c); the ingest validates it.

## API routes (thin, filesystem-backed, all try/catch → empty default)
`ideas` (**full CRUD over `ideas.json` via `ideas-core.mjs`** — GET with filters · POST validate+dedup+insert · PATCH partial merge · DELETE archives, `?permanent=1` really removes; **rejecting requires a `rejection_reason` or 400**), `strategy` (**GET-only**, serves `brand-kit.json` read-only — no POST/PATCH/DELETE by design), `gallery` (list pieces `{type,slug,cover,count,mtime}`; **must accept `?type=carousel|story|presentation` so each Produce view can list only its own collection**, and must still list a piece whose `png/` is missing so a failed export is visible rather than silently absent), `piece` (all PNGs of one piece, with mtime), `asset` (serve a guarded PNG), `doc` (read a brand/metrics md), `scripts` (list + read `scripts/*.md`, slug-sanitized), `calendar` (GET/POST/PATCH/DELETE over `calendar.json`), `radar/health` (**reads `radar/health.tsv` → `{last_run_at,last_status,consecutive_failures,days_since_success,stale}`; the Radar and Home views render it as a banner** — reference 5a-bis), `generate` + `radar` (+ optional `edit`, `chat`) — the background-job pattern below.

**Every AI route starts its prompt with the strategy block** (reference 7a), read fresh per request:
```ts
import { readKit, renderStrategyBlock } from "@/lib/strategy-block.mjs";
const prompt = `${renderStrategyBlock(readKit(ROOT), "generate")}\n\n---\n\n${task}`;
```
Never inline a hand-written brand summary into a route. Five routes with five summaries drift the
first time the user edits a pillar, and nothing tells you they have.

**`/api/generate` is gated on an approved idea** — it takes an `idea_id`, not a free string
(404 unknown · 409 not `approved`), injects the full record as an explicit brief, and sets
`status:"produced"` **only on success**. Full rules + the escape hatch: reference 7d.

---

## The background-job pattern (the most important part — get it exactly right)

Any route that spawns the coding-agent CLI to build something (`generate`, `radar`, `edit`) **must run as a server-side background job**, not a request-scoped stream. Otherwise navigating away or reloading kills it and the user loses the work.

Rules: (1) state on **`globalThis`** (survives HMR); (2) **POST starts** and returns immediately — the child keeps running past the response; (3) **GET returns** `{status,logs,startedAt,finishedAt}` so the client **reconnects + polls** after reload; (4) **DELETE cancels** (kills the child) so Stop works; (5) **identity-bind** handlers — a stale child must never write into / finish / null-out a newer job (`if (store.__job===job)` / `if (store.__child===child)`); (6) **guard to local/dev** — 403 when `NODE_ENV==="production"`; (7) cap logs (~600 lines).

Server skeleton — **the flags below are Claude Code's and are load-bearing**:
```ts
import { spawn, type ChildProcess } from "child_process";
import { join } from "path";
const ROOT = join(process.cwd(), "..");
interface Job { status:"running"|"done"|"error"; logs:string[]; startedAt:number; finishedAt?:number; code?:number; /* +task fields */ }
const store = globalThis as unknown as { __job?: Job|null; __child?: ChildProcess|null };
if (store.__job === undefined) store.__job = null;
const MAX=600; const push=(j:Job,l:string)=>{ if(store.__job!==j)return; j.logs.push(l); if(j.logs.length>MAX)j.logs.splice(0,j.logs.length-MAX); };

function start(prompt:string, seed:Partial<Job>){
  const job:Job = { status:"running", logs:["▶ started…"], startedAt:Date.now(), ...seed } as Job;
  store.__job = job;
  // Claude Code: --print + --output-format stream-json REQUIRES --verbose (errors on line 1 without it),
  // and needs a --max-turns cap so a scaffold→build→export run doesn't stall. Both are mandatory.
  const child = spawn("claude", ["--print","--verbose","--output-format","stream-json","--max-turns","60","--dangerously-skip-permissions"], { cwd:ROOT, env:{...process.env}, shell:true });
  store.__child = child;
  // ⭐ MANDATORY. Without this listener an EPIPE on stdin is an UNCAUGHT exception and the whole
  // Node process exits — not the request, the server. See "the EPIPE trap" below.
  child.stdin.on("error", () => { /* child died before draining the prompt; close() settles the job */ });
  child.stdin.write(prompt); child.stdin.end();
  child.stdout.on("data",(d:Buffer)=>{ for(const line of d.toString().split("\n").filter(Boolean)){ try{ const p=JSON.parse(line);
    // ↓ this parse is Claude's stream-json shape specifically — see "Adapting to another agent" below
    if(p.type==="assistant"&&p.message?.content) for(const b of p.message.content){ if(b.type==="text"&&b.text?.trim())push(job,b.text.trim()); else if(b.type==="tool_use"&&b.name)push(job,`🔧 ${b.name}`);} 
    if(p.type==="result"&&p.result)push(job,p.result);
  }catch{} } });
  child.on("close",(code)=>{ if(store.__child===child)store.__child=null; if(store.__job===job&&job.status==="running"){ job.status=code===0?"done":"error"; job.finishedAt=Date.now(); job.code=code??undefined; } });
  child.on("error",(e)=>{ if(store.__child===child)store.__child=null; if(store.__job===job&&job.status==="running"){ job.status="error"; job.finishedAt=Date.now(); push(job,`✗ ${e.message}`);} });
}
export const runtime="nodejs";
export async function POST(req:Request){ if(process.env.NODE_ENV==="production")return Response.json({error:"local only"},{status:403});
  if(store.__job?.status==="running")return Response.json({...store.__job,already:true});
  /* validate body; build prompt from brand/ docs + the task */ start(prompt, seed); return Response.json(store.__job); }
export async function GET(){ if(process.env.NODE_ENV==="production")return Response.json({error:"local only"},{status:403});
  return Response.json(store.__job ?? {status:"idle",logs:[]}); }
export async function DELETE(){ if(process.env.NODE_ENV==="production")return Response.json({error:"local only"},{status:403});
  try{store.__child?.kill("SIGTERM");}catch{} const j=store.__job; if(j&&j.status==="running"){j.status="error";j.finishedAt=Date.now();j.logs.push("⏹️ stopped");} store.__child=null; return Response.json({status:"stopped"}); }
```

### ⭐ The EPIPE trap — the one that takes down the whole server

**Every route that spawns the agent CLI must attach `child.stdin.on("error", …)` BEFORE writing the
prompt.** Not for tidiness — without it, a write to a dead child's stdin raises `EPIPE` as an
*uncaught exception* and Node **exits the entire server process**. The user sees the dev server die,
with no obvious connection to the button they pressed.

It is not a rare edge case, because these prompts are big. The OS pipe buffer is **65536 bytes**.
Measured on a real deployment: the brand corpus injected into the assistant prompt was already
**59,377 bytes** — about 6 KB of headroom before the write blocks and the process becomes dependent
on the child draining it. Add a few turns of conversation and you are over. And a Latin-only
estimate understates it: **Arabic and other non-Latin text is ~2 bytes per character in UTF-8**, so
a prompt that looks half the size of the limit isn't.

Triggers, all routine: the agent CLI isn't logged in (exits instantly), isn't resolvable under
`shell: true` (exit 127), or the user hits Stop / reloads in the first milliseconds.

Audit it: `grep -c 'stdin.on("error"' src/app/api/*/route.ts` must be ≥1 for **every** spawn route.
On the reference implementation that count was **0 across all five** — the guard is easy to leave
out of each new route you add, so check them all, not just the one you just wrote.

### Adapting to another agent (Codex / Cursor / Gemini / Kimi) — THREE things change, not one
The binary, its flags, AND the stdout parser are all agent-specific. Do not just swap the binary.
1. **Binary + streaming flag**: Claude `claude --print --output-format stream-json`; Codex `codex exec --json`; cursor-agent `cursor-agent -p --output-format stream-json`; Gemini `gemini` (text). **If you don't know the agent's JSON schema, drop `stream-json` entirely** — run plain `--print`/`exec` text mode and `push(job, line)` each non-empty stdout line verbatim (you lose tool-name pretty-printing; logs still stream and the job still works).
2. **Auto-approve flag** (its OWN slot — unattended jobs HANG without it, and non-Claude CLIs reject Claude's): Claude `--dangerously-skip-permissions`; Codex `--dangerously-bypass-approvals-and-sandbox`; cursor-agent `-f`; Gemini `--yolo`. Store the chosen binary/flags in `brand-kit.json` `ops.agent`.
3. **Turn cap**: keep the equivalent of `--max-turns` (~45–60) so a long build finishes.
The parser (`p.type==="assistant"` / `tool_use` / `result`) is Claude's event shape — rewrite it to the target agent's schema, or use the plain-text fallback above.

### If the agent has NO headless self-invocation at all (degrade, don't fail)
Cursor's composer, Kimi/IDE-plugin chats, and child-process-forbidden sandboxes **cannot spawn themselves**. Probe this in Stage 0 (and the Ops interview) — it's independent of whether Next.js/Playwright work. When absent, keep the dashboard but degrade Generate/Radar/Edit to **prompt-handoff**: the POST route WRITES the composed prompt to `content-os/<collection>/<slug>/PROMPT.md` (or shows it in a modal / copies to clipboard) and returns; the UI tells the user "run your agent on this prompt", and an **"I ran it — refresh"** button re-scans the folder/feed. The dashboard stays a full planning + viewing + calendar surface with manual generation.

### Client side (in the view that owns the job)
- On **mount**, `GET` the route; if `status==="running"` start polling every ~1.5s; render logs.
- **Poll** = `GET` on an interval; stop when status leaves "running"; on finish, refresh the relevant grid **once** (guard by `startedAt`).
- Show a **Stop** button (`DELETE`) while running; a **"see result"** button when done that opens the RIGHT view for the type (carousel→carousels, story→stories, presentation→presentations, **script→the scripts reader**, thumbnail→gallery). Never send a script to the image gallery.
- Keep a completed job visible only if recent (finished < ~10 min ago); track a "dismissed" id so a dismissed job doesn't reappear on reconnect.

---

## Code appendix — minimum skeletons (so a weak model doesn't guess)

`src/app/layout.tsx` — root, RTL if the kit says so, no-flash theme:
```tsx
import "./globals.css";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="<primary>" dir="<rtl?'rtl':'ltr'>" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.add('light')}catch(e){}` }} /></head>
      <body>{children}</body>
    </html>
  );
}
```

`src/app/[[...view]]/page.tsx` — the shape (fill views from the kit):
```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown"; import remarkGfm from "remark-gfm";
const P: Record<string, React.ReactNode> = { ideas:<path d="…"/>, radar:<path d="…"/> /* inline SVG paths */ };
function Icon({ n, size=18 }: { n:string; size?:number }){ return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{P[n]}</svg>; }
type View = "home"|"ideas"|"radar"|"scripts"|"calendar"/*…only chosen views*/;
export default function Dashboard(){
  // The URL is the source of truth — DERIVED, never mirrored into state (see the routing rule above).
  const pathname = usePathname(); const router = useRouter();
  const parts = (pathname || "/").split("/").filter(Boolean);
  const slug = parts[0] || "home";
  const view: View = (slug in META ? slug : "home") as View;
  const sub = parts[1] ?? null;                       // a detail id, e.g. /assistant/<chat-id>
  const setView = useCallback((v: View) => { router.push(v === "home" ? "/" : `/${v}`); }, [router]);
  useEffect(()=>{ if(slug!=="home" && !(slug in META)) router.replace("/"); },[slug,router]);  // unknown slug
  return <div className="flex h-screen"><aside>/* sidebar: <Link href> per chosen view, <Icon n={v}/> + name */</aside>
    <main className={view==="assistant" ? "flex-1 min-h-0 overflow-hidden" : "flex-1 overflow-auto p-6"}>{/* switch(view) */}</main></div>;
}
```

`IdeasView` — the worked example: review queue → approve → gated generate (background job + poll + reconnect):
```tsx
type Idea = { id:string; text:string; status:string; pillar_id?:string; suggested_hook?:string; seen_count?:number };
function IdeasView(){
  const [ideas,setIdeas]=useState<Idea[]>([]);
  const [filter,setFilter]=useState("new,reviewing,approved");
  const [job,setJob]=useState<{status:string;logs:string[];startedAt?:number}|null>(null);
  const refresh=useCallback(()=>fetch(`/api/ideas?status=${filter}`,{cache:"no-store"}).then(r=>r.json()).then(d=>setIdeas(d.ideas||[])),[filter]);
  useEffect(()=>{ refresh(); fetch("/api/generate").then(r=>r.ok?r.json():null).then(d=>{ if(d?.status==="running"){ setJob(d); poll(); } }); },[refresh]);
  let iv:any; const poll=()=>{ clearInterval(iv); iv=setInterval(async()=>{ const d=await(await fetch("/api/generate",{cache:"no-store"})).json(); setJob(d); if(d.status!=="running"){ clearInterval(iv); refresh(); } },1500); };

  const patch=async(id:string,body:object)=>{ await fetch("/api/ideas",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,...body})}); refresh(); };
  const approve=(id:string)=>patch(id,{status:"approved"});
  const reject =(id:string)=>{ const reason=prompt("why? (required)"); if(reason?.trim()) patch(id,{status:"rejected",rejection_reason:reason}); };
  // ⚠️ generate takes idea_id — NOT the text. The route 404s/409s otherwise (ref 7d).
  const gen=async(idea_id:string,type:string)=>{ setJob({status:"running",logs:[]}); await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idea_id,type})}); poll(); };
  const stop=()=>fetch("/api/generate",{method:"DELETE"});

  return <div>{ideas.map(i=><div key={i.id}>
      <p>{i.text}</p>
      <small>{i.status}{i.pillar_id?` · ${i.pillar_id}`:""}{(i.seen_count||1)>1?` · seen ${i.seen_count}×`:""}</small>
      {i.suggested_hook&&<blockquote>{i.suggested_hook}</blockquote>}
      {i.status!=="approved"&&<><button onClick={()=>approve(i.id)}>approve</button><button onClick={()=>reject(i.id)}>reject</button></>}
      <button disabled={i.status!=="approved"} onClick={()=>gen(i.id,"carousel")}>carousel</button>{/* per chosen format */}
    </div>)}
    {job&&<div><b>{job.status}</b>{job.status==="running"&&<button onClick={stop}>stop</button>}<pre>{(job.logs||[]).join("\n")}</pre></div>}</div>;
}
```
Adapt the same job pattern for the Radar view (POST `/api/radar`).

## Checkpoint before Stage 4

```bash
cd content-os/app && pnpm exec tsc --noEmit && pnpm build
```
Then have the **user** (not you) open the dev server once and confirm:
- the sidebar lists exactly the views the kit's formats justify — no view you invented, none missing
- **the brand's real colors and fonts are rendering**, not Next.js defaults (if the fonts look wrong,
  the Google-fonts `@import` is not the first line of `globals.css` — Lightning CSS dropped it)
- RTL brands: the layout runs right-to-left from the root, and no component sets its own `dir`
- Ideas, Radar, Calendar and Growth all open on a **fresh install with empty data** — an empty state,
  never a 500. This is the single most common Stage 3 failure: unseeded files.
- toggling the theme persists across a reload with no flash of the wrong theme

Do **not** start the dev server yourself to verify. Typecheck and build are your checks; the browser
is the user's.

## When cloning the reference `engine/` app (if this repo has one)
Copy it, then fix the path math for the new layout: scaffold base = `path.resolve(__dirname,"..")` (from `content-os/tools/`), route `ROOT = join(process.cwd(),"..")` (one `..`, not two), and drop the reference's extra `content/` path segment — collections live directly under `content-os/`. Re-skin by swapping `design-tokens.css` values only.
