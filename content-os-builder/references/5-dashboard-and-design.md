# Reference 5: The dashboard shell and the design system (Stage 4)

The dashboard is one client shell, rendered per tenant, plus a picker. Every view reads its tenant's
data through `useApi()` and nothing else.

```
src/app/layout.tsx                       ← <html lang dir> (the ONLY place direction is set) + no-flash theme
src/app/page.tsx                         ← "/" the workspace picker
src/app/[tenant]/[[...view]]/page.tsx    ← the shell: sidebar, header, the current view, overlays
src/app/brain/page.tsx                   ← optional owner vault (reference 12); static routes win over [tenant]
src/lib/config.ts                        ← UI_LANG, DIR, OWNER_TZ, WORKSPACE_WORD, APP_NAME, OWNER_NAMES,
                                           PRIMARY_TENANT, BRAIN_AGENT_MEMORY (from the interview)
src/views/registry.ts                    ← VIEW_META + NAV
src/views/<view>.tsx                     ← one file per view
src/components/{ui.tsx, Icon.tsx, Produce.tsx, Viewer.tsx, JobDock.tsx, IdeaCard.tsx, WorkspaceSwitcher.tsx}
src/app/globals.css                      ← tokens + component classes
```

## 1. Root layout

```tsx
import "./globals.css";
import { UI_LANG, DIR } from "@/lib/config";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={UI_LANG} dir={DIR} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html:
        `try{if(localStorage.getItem('<app>-theme')==='light')document.documentElement.classList.add('light')}catch(e){}` }} /></head>
      <body>{children}</body>
    </html>
  );
}
```
Dark is the default. The inline head script applies a saved light theme before paint, so there is no
flash; `suppressHydrationWarning` covers the class it adds.

## 2. `/`: the workspace picker

It reads `GET /api/tenants`. With **exactly one valid tenant, it `router.replace`s to `/<id>`**
(single-tenant mode). Otherwise:
- A background, a small kicker and the date, and a headline ("where do you want to work today?").
- One card per tenant: an accent-gradient initial tile, `NN / KIND`, the name, a brand-status dot, and
  **the single next step**: "draft waiting for your approval" / "start the brand interview" / "N ideas
  waiting".
- A broken manifest renders a **disabled** card listing its errors.
- With zero tenants: an empty state that names the `node engine/tools/new-tenant.mjs` command.
- If the vault is built, a vault card at the end.

## 3. `/[tenant]/[[...view]]`: the shell

**Tenant loading with a stale-result guard.** Resolve the tenant from `/api/tenants`, and tag the
loaded state with the id it was loaded FOR. Discard a result whose id no longer matches the URL. A
direct `/a → /b` navigation once rendered A's data under B's URL. Render
`<TenantProvider tenant={t}><DashboardShell key={t.id} /></TenantProvider>`; the key remounts
everything on a switch. An unknown or broken tenant gets a "no such workspace" page with a link back.

**Put the tenant accent on `<html>`**: `document.documentElement.style.setProperty("--accent", t.accent)`.
Every derived token is computed at `:root`, so setting it on a wrapper leaves them in the default colour.

**The view IS the URL.** `parts = [tenant, view?, sub?]`. `view` is the slug when it is in `VIEW_META`
**and** enabled in `manifest.modules`, otherwise `home`. It is derived on every render and never
mirrored into state (two sources of truth for "where am I" is how a router and a UI drift apart).
- An unknown or disabled slug renders home **and** calls `router.replace` to correct the address.
- Only `assistant` has a sub-segment (`/assistant/<chat-id>`); drop a sub-segment anywhere else.
- Sidebar items are `<Link href>` (middle-click and ctrl-click work), not buttons.
- Use `router.replace` (never `push`) whenever you are *correcting* the address, so Back never walks
  through steps the user never took.

**The registry** (`src/views/registry.ts`): `VIEW_META: Record<View, {name, icon, sub}>`, with names
and subtitles in the UI language, and `NAV: {group, items: View[]}[]`. Suggested groups:
(no label) home, strategy · Content: ideas, radar, search · Production: library, videos, animations,
carousels, stories, presentations, scripts, gallery · Business: crm · Growth: analytics, inspiration,
calendar · Tools: assistant, terminal, settings. Filter every group by the tenant's modules.

**Adding a view takes six edits**: the `View` union in `lib/types.ts` + `VIEW_META` + `NAV` + a `case` in
the shell's render + the id in `MODULE_IDS` (`tenant.mjs`) + the tenant's `tenant.json`. Put this
list in the engine Routing Map (reference 13).

**Shell state** (the shell owns it and passes it down): ideas + counts + taxonomy + filters, with an
`ideaAction(id, patch)`; pieces (`/gallery`); followers (`/audience`, **only when `analytics` is
enabled**) and the goal (from `/strategy`), never hardcoded; the generation job (poll `GET /generate`
every 1.5 s, reconnect on mount; a 409 is shown in the dock, never swallowed); the clock and date in
the owner's timezone; the theme toggle. **The shell fetches only the routes of enabled modules, and a
404 from any of them reads as "empty"**: a module may be off for this tenant, or its route may not be
built yet (the shell is written in Stage 4, `/gallery` and `/generate` in Stage 5).

**Cross-tab intent.** Changing tabs remounts the view (it is a route segment), so "open this piece
after jumping tabs" rides in `sessionStorage` as `{type, slug, at}` with a 15 s TTL. A dismissed dock
is stored per tenant.

**Layout.** A sidebar (≈252 px): the tenant mark and name, NAV filtered by modules, the active item on
`--accent-soft`, and a footer linking "all workspaces" (and the vault). A header (≈72 px): the phone
menu button, the `WorkspaceSwitcher` (accent dot + name; a dropdown of the other workspaces with their
brand status and pending count, hidden in single-tenant mode), the view name and subtitle, the date,
the clock and the theme toggle. `<main>` scrolls and holds a max-width container (~1180 px); the
assistant view is full-bleed.

**Overlays.** `Viewer` (open a piece: slides or video, download, «edit», publish), `IdeaEditor`,
`ScriptEditor`, and `JobDock`: a fixed corner panel with the status kicker, a spinner, readable logs
(tool lines and paths stripped), the outcome line, minimise, stop and "open result". Its "open result"
destination falls back to an enabled view; **a disabled module is never offered**.

## 4. The views catalog

Each view opens with `PageHead` (kicker, title, lede, actions). Every empty screen uses `EmptyState`,
which names what is missing and offers the **one** action that fixes it.

**Stage 4 builds the shell plus `home`, `strategy`, `ideas`, `settings` and `terminal`.** Every other
view is built in the stage that builds its route (the "Built in" column), so no view is ever written
against a route that does not exist yet. Until then, a module the manifest enables renders a plain
"being built" empty state.

| View | What it is | Built in |
|---|---|---|
| home (stage 4) | the day's opening: one lit hero card with the single next action, in this order: brand interview → approve the draft → today's product proposal → ideas waiting → approved ideas to produce → run the radar. Then a stats row (followers vs goal, ideas, pieces, produced, last radar as a day phrase), the rest of the queue, the optional community-post draft, "the machine" stage cards for **enabled** modules only, and the freshest ideas | — |
| strategy | the read-only kit, or the draft under review with Approve (ref 4) | 4 |
| ideas | the review queue + the add-an-idea form (ref 4) | 4 |
| settings | a manifest + `settings` readout, system status (`GET /status`, §11), theme | 4 |
| terminal | the tenant's slash commands (`GET /terminal`, §11), click to copy | 4 |
| search | client-side filter over ideas and pieces | 5 |
| carousels · stories · presentations | the shared `Produce` component (§5; ref 6) | 5 |
| scripts | list, create, the script editor + "generate hooks" (ref 6 §10) | 5 |
| gallery | every piece, reel briefs as text cards (ref 6) | 5 |
| library | products with photos, today's proposal, made vs published (ref 6) | 5 |
| videos | storyboard → owner OK → video (ref 7) | 6 |
| animations | a brief box plus approved ideas (ref 7) | 6 |
| radar | scan / stop / reconnect, live log, last verdict, health banner, run history (ref 8) | 7 |
| analytics | the business's own posts, detail window, transcribe; a missing platform shows its setup step (ref 8) | 7 |
| inspiration | competitors, their hits, ideas from hits (ref 8) | 7 |
| assistant | chat id in the URL, rail, starters from the modules, proposal cards (ref 9) | 8 |
| calendar | month grid and board, pillar colours from the kit, the real queued posts (ref 10) | 9 |
| crm | five computed numbers, money, clients, leads, calls, partners (ref 11) | 10 |

## 5. The Produce component: where an idea becomes a piece

Carousels, stories and presentations are **one component reused per collection**:
`<Produce kind="carousel" />`. **The top half** lists approved ideas not yet produced in *this* format,
each with one Generate button (`POST /generate {idea_id, type: kind}`). **The bottom half** lists the
pieces of this collection (`GET /gallery?type=<kind>` → `[{type, slug, cover, count, mtime, headline}]`)
as cards with the cover PNG, headline, slide count and date; a click opens the Viewer.

**When the job finishes, the grid refreshes itself**: when the polled status leaves `running`, re-fetch
both halves once, guarded by `startedAt` so a reconnect doesn't loop. Without this, the piece is on
disk and the screen still says empty, which reads as "generation is broken".

The three ways "it generated but nothing appeared" actually happens:
1. **The grid lists only pieces with a cover.** List a piece without PNGs anyway, with a "built, not
   exported" badge and a **Re-export** button.
2. **The piece landed in the wrong collection.** The route chooses the folder, never the agent
   (reference 6).
3. **The view was never wired to the filesystem.** It renders a static empty state because nobody
   specified what it lists. This is the most common one.

## 6. The client side of a background job

On mount, `GET` the job route; if `running`, start polling every ~1.5 s. Stop polling when the status
leaves `running`, and refresh the relevant data once. Show **Stop** (`DELETE`) while running, and a
**"see result"** button when done that opens the right view for the type (a script opens the script
reader, never the image gallery). Keep a finished job visible for ~10 minutes, and remember a dismissed
job id so it doesn't reappear on reconnect.

---

## 7. The design system (`globals.css`, `ui.tsx`, `Icon.tsx`)

**Fonts.** Google Fonts, loaded by the first line of `globals.css`: a Latin face (e.g. Inter), a face
for the owner's script (for Arabic, e.g. Readex Pro), and a mono (e.g. JetBrains Mono). With
`body { font-family: '<Latin>', '<Script>', system-ui }` the browser picks per glyph.

**Tokens on `:root` (dark default); `:root.light` overrides them.** Every tint derives from `--accent`
(the tenant's colour), so each workspace gets its own hue of the same system:
```css
:root {
  --accent: #7c3aed;                                    /* set per tenant on <html> */
  --p2: color-mix(in oklab, var(--accent) 62%, white);  --p3: color-mix(in oklab, var(--accent) 40%, white);
  --bg: #0b0716; --bg-2: #120c22; --panel: #140d29; --panel-2: #1b1336;
  --line: color-mix(in oklab, var(--p2) 18%, transparent); --line-2: color-mix(in oklab, var(--p2) 45%, transparent);
  --text: #fff; --text-dim: #cfc7e6; --muted: #8a82a8;
  --green: #34d399; --amber: #fbbf24; --red: #f87171;
  --accent-soft: color-mix(in oklab, var(--accent) 16%, transparent);
  --glow: color-mix(in oklab, var(--accent) 35%, transparent);
  --field: color-mix(in oklab, var(--p2) 6%, transparent); --hov: color-mix(in oklab, var(--p2) 12%, transparent);
  --code-bg: color-mix(in oklab, var(--accent) 20%, transparent); --win: rgba(18, 11, 34, .82);
  --radius: 20px; --radius-sm: 12px; --ease: cubic-bezier(.2, .8, .2, 1);
}
:root.light {
  --bg: #f7f5fb; --bg-2: #efebf7; --panel: #ffffff; --panel-2: #f4f1fa;
  --p2: color-mix(in oklab, var(--accent) 70%, black); --p3: color-mix(in oklab, var(--accent) 55%, black);
  --text: #1a1033; --text-dim: #3a2d5c; --muted: #5f5680;     /* muted raised to ~5:1 — ~3:1 was too faint */
  --win: rgba(255, 255, 255, .9);
}
body { background: radial-gradient(60% 50% at 80% 0%, var(--glow), transparent), var(--bg); color: var(--text); }
```
Swap the hexes for the owner's taste; keep the **token names** stable. The form-field and hover tokens
are theme-aware, so controls never render flat grey in light mode.

**Component classes live in `@layer components`.** Unlayered, they would beat every Tailwind utility
on the same element. Types: `.lbl` (mono, uppercase, letter-spaced, `direction: ltr;
unicode-bidi: isolate`), `.num`, `.h` / `.h em`, `.lede`, `.bidi-auto { unicode-bidi: plaintext;
text-align: start }`. Surfaces: `.panel`, `.card` (hover lift), `.lit` (the hero card), `.win`
(modal chrome). Controls: `.field`, `.btn`, `.btn-primary` (an accent gradient, **one per screen**),
`.btn-quiet`, `.pillbtn(.on)`. Plus `.markdown-body`, `.rv` (a staggered reveal), and a visible
`:focus-visible` ring in the accent. Everything respects `prefers-reduced-motion`.

**`ui.tsx` primitives**: `PageHead`, `PillTabs`, `EmptyState`, `Chip`, `Stat`, `BigStat` (drops the mono
face when the value contains non-Latin script), `detectDir(text)`, `img(apiUrl, url)` (routes social
CDN URLs through a server proxy), `nf`/`nfRound` number formatting, and `dayAgo` (today / yesterday /
N days, in the owner's timezone). **Icons are inline SVG** in a small map (`<Icon n="radar" />`), never
emoji in the UI chrome.

## 8. RTL and bidi (hard rules)

1. Set `dir` once, at `<html>`. Never hardcode `dir` on a component; direction inherits.
2. Use logical utilities only: `ms/me/ps/pe/start/end/text-start/text-end`, `border-inline-start`.
   Never `ml-*`, `text-left` or `right-*`.
3. **Never put Arabic inside `.lbl`, `.k`, `.num` or any letter-spaced or mono face.** Letter-spacing
   disconnects Arabic letters. Kickers are Latin. Never apply negative letter-spacing to Arabic, and
   give it a line-height of at least ~1.4.
4. A per-element `dir="ltr"` is allowed **only** for content that is mostly Latin (`detectDir`: Latin
   letters > RTL-script letters × 1.5, after stripping code and URLs). Count as RTL-script every letter
   of Hebrew (U+0590–05FF, FB1D–FB4F), Arabic (U+0600–06FF, 0750–077F, 08A0–08FF, FB50–FDFF,
   FE70–FEFF), Syriac (U+0700–074F), Thaana (U+0780–07BF) and N'Ko (U+07C0–07FF), not just Arabic: a
   Hebrew reply with one English word must not flip to LTR. A native-script message that merely starts
   with a brand name stays RTL. `detectDir` returns `"ltr"` or `undefined`, never `"rtl"`, so everything
   else inherits. (In an LTR UI the same function is harmless: it only ever returns "ltr".)
5. Mixed or machine text (logs, English prompts, handles) uses `.bidi-auto`.
6. Wrap tags and dates that follow native-script text in `<bdi>` (or FSI…PDI in plain strings).
7. Canvas text (graph labels) needs explicit RLI…PDI marks; a canvas paints with an LTR base direction.
8. Flip directional icons (arrows, chevrons) based on the direction, not with an inline `dir`.
9. **Fix bidi glitches in the content**: rephrase a sentence so it doesn't straddle an embedded
   English word mid-clause. A container `dir` is not the fix.

## 9. Phone layout

Every screen works at phone width. The sidebar becomes a start-side drawer with a backdrop, and its
open state is `navFor === pathname`, so navigating closes it with no effect and no race. Drawers become
bottom sheets (~88vh, rounded top). Modals become nearly full-screen. The JobDock becomes a full-width
bottom bar (max ~45vh). Search fields expand into bars. The chat rail becomes a sheet.

## 10. UI rules (each one was a shipped bug)

- **A record with fields renders as fields.** Chips for taxonomy, badges for state, a pull-quote for
  the hook, a link for the source. If you are joining fields with ` — ` or reaching for
  `JSON.stringify`, the view is wrong.
- **A control that refuses says why.** Every disabled button carries its reason in a tooltip or a
  line under it. A silently inert control is indistinguishable from a broken backend.
- **Show the owner's sentence, never a code.** Map every machine reason to one sentence in the owner's language.
- **Never hardcode numbers or taxonomy in a view.** Read audience numbers from the analytics files and
  pillars, shapes and formats from the kit and the manifest. A stale literal on the home tile was a
  real bug.
- **Infinite-scroll grids reset on a VALUE key**, never on array identity. Callers rebuild arrays every
  render, which snapped the grid back to the first page forever. Render in chunks of ~24 with
  `loading="lazy"`, and keep a manual "load more" button.
- **Signed social-CDN media expire** (in about four days). Route images through the caching proxy
  `GET /api/[tenant]/img` and videos through `GET /api/[tenant]/video`, which redirects to a freshly
  minted URL (§11).
- **The media viewer cache-busts by mtime** (`&v=<mtime>`), so a re-exported slide actually refreshes.
- **Error, empty and loading states are designed screens**, not afterthoughts.

## 11. Shell-level routes (contracts)

All are tenant-scoped (`/api/[tenant]/…`), `nodejs`, `force-dynamic`, behind the proxy guard.

| Route | Contract |
|---|---|
| `GET /img?url=…[&handle=…][&id=…][&kind=profile]` | The image proxy and its byte cache (social thumbnails and avatars). **Host allowlist, or it is an open relay**: `cdninstagram.com`, `fbcdn.net`, `ytimg.com`, `ggpht.com`, `googleusercontent.com`, `twimg.com`, `tiktokcdn.com`, `tiktokcdn-us.com` (suffix match on the hostname). Leaving out the YouTube hosts once blanked every tile of a tenant with no scraper key. Any other host → the pixel. Order: (1) bytes already on disk under `content/analytics/thumbs/<key>.<ext>` → serve, no network; (2) the stored URL, unless its `oe` expiry param (hex unix time) has passed → fetch with **manual redirects, each hop re-checked against the allowlist**, `content-type` must be `image/*`, **cap 8 MB**, write atomically, serve; (3) a Meta URL that failed or expired → re-resolve a fresh one (a competitor through `business_discovery`, paging deep; one of the tenant's own posts through its media node), fetch, cache, serve; (4) a 1×1 transparent PNG with `no-store`, never a broken-image icon. **The cache key is a hash of the CDN host + pathname only**: the signature lives in the query string, so a re-signed URL shares one cache entry. Served bytes get `Cache-Control: public, max-age=31536000, immutable`. |
| `GET /video?id=…[&handle=…]` · `GET /media?id=…[&handle=…]` | A currently valid video URL: `/video` **302-redirects** to it (the browser streams and seeks from the CDN with Range; video bytes are never proxied or cached to disk), `/media` returns it as JSON. A 404 lets the player show its "open on the platform" fallback. The resolver **pages deeply** (50 per page, up to ~8 pages): a lookup limited to the newest 25 posts missed every cached post of an account that posts daily. Resolved URLs sit in an in-memory cache on `globalThis` for ~20 minutes whose key **must start with the tenant id**, and the key builder **throws without one**: one process serves every tenant, and ids are not unique across accounts, so an unscoped key would serve tenant B a URL resolved with tenant A's token. The tenant's OWN token resolves its own posts; only the `ENGINE_*` lookup token is used for a competitor's public posts. |
| `GET /status` | For the settings view: `{module: {enabled, ready, missing:["KEY_NAME in <file>"]}}` per enabled module, the agent CLI found or not, ffmpeg/yt-dlp/codex found or not, the last radar run. **Key presence only, never a value or a prefix.** |
| `GET /terminal` | `[{name, description, body}]` from `tenants/<id>/.claude/commands/*.md` (frontmatter `description`, else the first line). Read-only; the view copies `/<name>` to the clipboard. Empty folder → `[]`. |

## Checkpoint (before Stage 5)

```bash
cd engine/app && pnpm exec tsc --noEmit && pnpm lint && pnpm build
```
Then ask the **user** to start the dev server and check (or screenshot it for you):
- `/` shows the picker (multi) or forwards to the workspace (single).
- Each workspace takes its own accent; the sidebar shows exactly its enabled modules; typing a disabled
  view's URL lands on home and corrects the address bar.
- The brand fonts render (not the framework defaults). RTL brands run right to left from the root,
  and no component sets its own `dir`.
- Every view built so far (home, strategy, ideas, settings, terminal) opens on a **fresh tenant with no
  data**: an empty state, never a 500. The views of later stages show their "being built" state, and
  the browser console shows no failed fetch other than an expected 404 read as empty.
- The theme toggle persists across a reload with no flash; the layout works at phone width.

Do **not** start the dev server yourself. Typecheck, lint and build are your checks; the browser is
the user's.
