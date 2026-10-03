# Reference 2: Architecture and tenancy (Stage 1)

**One engine plus N tenant folders.** The engine is the Next.js app, the trusted scripts and the CLI
tools. A tenant is one business: its brand kit, content, memory, skills and keys. Single-tenant is the
same engine with exactly one tenant folder. Never build a separate single-brand code path: going from
one tenant to N must mean adding a folder, with no migration.

> Why this matters in practice: a system built single-brand first and made multi-tenant later needed a
> full rebuild. Every content folder had to be moved, `.gitignore` re-anchored and symlinks recreated.
> Build the tenant layout from day one even for one business.

## 1. Repo layout

```
<repo>/
├─ CLAUDE.md                 ← engine manual: core rules + the engine Routing Map (reference 13)
├─ AGENTS.md -> CLAUDE.md     ← (where symlinks are refused: a generated copy, refreshed by sync-tenant)    ← symlink, so Codex and other agents read the same law (edit CLAUDE.md only)
├─ .claude/settings.json     ← TRACKED: permissions.ask lists every publish/write MCP tool (never allow)
├─ .gitignore
├─ engine/
│  ├─ app/                   ← Next.js (App Router) · React · TS strict · Tailwind v4 · pnpm
│  │  ├─ src/proxy.ts        ← same-origin API guard (asset)
│  │  ├─ src/lib/tenant.mjs  ← discovery, validation, resolution, env (asset; zero-dep ESM, app + CLI)
│  │  ├─ src/lib/tenant.ts   ← typed resolveTenant() + brandGate() for routes
│  │  ├─ src/lib/tenant-client.tsx ← TenantProvider / useTenant / useApi
│  │  ├─ src/lib/agent-flags.mjs   ← the ONLY place agent confinement is built (asset)
│  │  ├─ src/lib/agent-spawn.ts    ← the ONLY spawn of the agent CLI + the trusted exporter runner
│  │  ├─ src/lib/config.ts   ← owner-level settings: UI language/dir, timezone, workspace word, app name,
│  │  │                         OWNER_NAMES, PRIMARY_TENANT, BRAIN_AGENT_MEMORY (reference 1 A1–A5)
│  │  ├─ src/app/            ← page.tsx (picker) · [tenant]/[[...view]]/page.tsx (shell) · api/**
│  │  ├─ src/views/          ← one file per sidebar view + registry.ts
│  │  ├─ src/components/     ← ui.tsx, Icon.tsx, Produce, Viewer, JobDock, IdeaCard, …
│  │  ├─ scripts/            ← TRUSTED runners: export-project.mjs (asset), render-animation.mjs, …
│  │  ├─ .data/              ← engine state outside every tenant (proposals…); writes its own .gitignore "*"
│  │  └─ package.json        ← "dev": "next dev -H 127.0.0.1 -p <port>"   (loopback only)
│  ├─ skills/tenant/<skill>/ ← generic skills copied into each new tenant's .claude/skills/
│  └─ tools/
│     ├─ lib/tenant-arg.mjs  ← requireTenant(): --tenant <id> required, no default
│     ├─ new-tenant.mjs      ← scaffold a valid, empty, gated tenant; --from = a test copy (asset)
│     ├─ sync-tenant.mjs     ← re-apply the engine's skills + settings to existing tenants (asset)
│     ├─ run-agent.mjs       ← run one confined agent from the terminal or cron (same flags as the app)
│     ├─ strategy-block.mjs  ← print a tenant's prompt block (cron)
│     ├─ approve-kit.mjs · ideas.mjs · import-ideas.mjs   ← terminal approval and idea store (reference 4 §12)
│     ├─ verify-tenants.mjs  ← structure + source lint + env + exporter canary + real-CLI canaries
│     ├─ verify-publishing-safety.mjs
│     └─ tests/*.test.mjs    ← node --test unit tests
├─ brain/                    ← OPTIONAL owner-level knowledge vault (reference 12)
└─ tenants/<tenant-id>/      ← one folder per business (§3)
```

`.gitignore` must cover: `.env`, `.env.local`, `**/.env.local`, `**/.env.*.local`, `node_modules/`,
`engine/app/.next/`, `engine/app/.data/`, the generated media (`tenants/*/content/**/png/`, `*.mp4`) if
the user doesn't want them in git, and `brain/sources/` + `brain/.brain/` if the vault is built.

## 2. Bootstrap the engine first (do not skip)

A weaker model cannot "build the dashboard" until the project exists. Create it explicitly:

```bash
mkdir -p engine && cd engine
pnpm dlx create-next-app@16 --help        # FIRST: confirm every flag below exists in this version
pnpm dlx create-next-app@16 app --ts --app --tailwind --eslint --src-dir --import-alias "@/*" \
     --use-pnpm --no-cache-components --no-react-compiler --disable-git --no-agent-feedback --yes
cd app
pnpm add react-markdown remark-gfm jszip
pnpm add -D playwright
pnpm exec playwright install chromium     # downloads the BROWSER; the npm package alone does not
```

Why every flag: **pin the major** (an unpinned `@latest` is a different scaffold every month);
**`--no-cache-components`**, because with Cache Components on, the `export const dynamic` / `runtime`
segment config every route here uses is a build error; **`--disable-git`**, or a fresh non-git folder
gets a nested `engine/app/.git`; **`--yes`** plus explicit flags, because any unanswered prompt hangs a
non-interactive agent shell. If `--help` lacks a flag, drop it and answer that prompt's default in the
same direction (no cache components, no git). Then check `engine/app/next.config.*` has no
`cacheComponents: true`.

Then set `"dev": "next dev -H 127.0.0.1 -p <port>"` in `package.json`. Binding to loopback closes
the LAN; the proxy (reference 3) closes the browser.

**This is Tailwind v4, not v3.** Create no `tailwind.config.js` and no `@tailwind` directives:
- `postcss.config.mjs` → `export default { plugins: { "@tailwindcss/postcss": {} } };`
- `src/app/globals.css` must begin, in this order:
  ```css
  @import url('https://fonts.googleapis.com/css2?family=<Latin>&family=<Script>&family=JetBrains+Mono&display=swap');
  @import "tailwindcss";
  ```
  ⚠️ The Google Fonts `@import` must be the **first line**, or Lightning CSS (Tailwind v4) silently
  drops it and the fonts never load.

Check the installed Next version's docs for the request-interceptor file name (Next 16 calls it
`proxy.ts`, which was formerly `middleware.ts`) and for async `params` in route handlers. Then confirm
`pnpm exec tsc --noEmit && pnpm build` pass before adding features.

## 3. Tenant folder layout

```
tenants/<id>/
├─ tenant.json                ← the manifest (§4)
├─ CLAUDE.md                  ← this business's law + its own Routing Map (reference 13)
├─ AGENTS.md -> CLAUDE.md
├─ .claude/settings.json      ← defence in depth: deny + ask, NO allow list (reference 3)
├─ .claude/skills/<skill>/    ← copied from engine/skills/tenant at creation (read-only to agents)
├─ .env.local                 ← this business's OWN account keys (gitignored)
├─ brand/                     ← strategy.json (owner-approved) · strategy.draft.json · *.md docs · templates/*.html
├─ content/                   ← ideas.json · chats.json · carousels/ stories/ posts/ … · analytics/ · planning/
│  └─ node_modules -> ../../../engine/app/node_modules    ← RELATIVE symlink (Windows: a directory junction)
├─ research/                  ← competitors/ · radar/{runs,failed}/
├─ memory/                    ← MEMORY.md index + rules/ people/ decisions/ projects/ lessons/ notes/
├─ library/                   ← products/<slug>/product.json + real photos, logos, references
└─ work/                      ← business docs: partners/, crm/, offers… where they exist
```

The `node_modules` symlink is **relative** so the repo keeps working when moved or cloned. It exists
so a human can run a project's own `export.mjs` by hand; **the server never runs that file**
(reference 3).

## 4. The manifest: `tenants/<id>/tenant.json`

```jsonc
{
  "schema_version": 1,               // must equal SCHEMA_VERSION
  "id": "<tenant-id>",               // must equal the folder name
  "name": "<Display Name>",
  "kind": "creator",                 // "creator" | "company"
  "accent": "#7c3aed",               // exactly #RRGGBB; themes the dashboard for this workspace
  "order": 1,                        // integer, picker sort order
  "modules": ["home", "strategy"],   // non-empty, each ∈ MODULE_IDS   (sidebar views; server-enforced)
  "formats": ["carousel"],           // non-empty, each ∈ OUTPUT_FORMATS (what it publishes)
  "engines": ["html"],               // non-empty, each ∈ ENGINES (how assets render)
  "settings": {                      // OPTIONAL; closed shape, validated by validateSettings()
    "lang": "en",                    // BCP-47 publishing language of THIS business; "dir" is derived
    "radar": { "cron": true, "max_age_days": 10 },
    "competitors": { "covered_window_days": 90, "hit_multiplier": 2, "heavy_min_views": 300000, "paid_transcription": false },
    "crm": { "currency": "USD" },
    "media": { "codex_images": false, "codex_image_model": null, "edit_paid_fallback": false, "max_credits": 20 }
  }
}
```
**Every interview answer that code must read lives in `settings`**, never as a literal in a route.
`settingsOf(manifest)` returns the values over `DEFAULT_SETTINGS`; a key the interview never asked
about stays unset (`heavy_min_views: null` means "every precedent inside the window needs a
differentiator"; `max_credits: null` means "approve nothing"). `tenant.json` is write-denied to every
agent, so these are owner-controlled. The example values above are placeholders: use the answers.

The vocabularies are **closed lists in `tenant.mjs`**, and an unknown value is a validation error,
never ignored:
- `MODULE_IDS`: home, strategy, ideas, radar, search, carousels, stories, presentations, scripts,
  gallery, analytics, inspiration, calendar, assistant, terminal, settings, library, videos,
  animations, crm. **It must equal the dashboard's view list**; a unit test asserts this.
- `OUTPUT_FORMATS`: carousel, single-post, story, reel-idea, reel-video, ai-video, presentation,
  script, thumbnail, community-post, animation. The generation type strings ARE these ids, so no
  mapping table is needed.
- `ENGINES`: html, image-model, video-model, browser-video, remotion. A format whose engine is not
  listed is unavailable (`reel-video` needs `video-model`, `ai-video` needs `browser-video`, `animation`
  needs `remotion`, and `single-post` without `image-model` is built as one HTML slide).
- `TENANT_KINDS`: creator, company.
- Id rule: `/^[a-z][a-z0-9-]{1,30}$/`, not in `RESERVED` = `api`, `_next` (route collisions),
  `zz-canary` (the verifier's throwaway attacker) and `brain` (the optional vault's pseudo-tenant). A
  real tenant with a reserved id would shadow a page and share an agent identity.

**`brand_status` is derived, never stored**: `brand/strategy.json` exists → `approved`; else
`brand/strategy.draft.json` exists → `draft`; else `missing`. A derived status cannot drift from the
files.

## 5. `tenant.mjs`: ship `assets/tenant.mjs`

Plain ESM with zero dependencies, imported by the app **and** every CLI tool, so there is one
implementation. What it exports:
- `TENANTS_DIR`, `SCHEMA_VERSION`, `MODULE_IDS`, `OUTPUT_FORMATS`, `ENGINES`, `TENANT_KINDS`
- `isValidId(id)`, `validateManifest(obj, folder)` → `{ ok, errors[] }` with readable messages
- `validateSettings(settings)`, `settingsOf(manifest)`, `DEFAULT_SETTINGS`, `dirFor(lang)`
- `brandStatus(rootAbs)`
- `listTenants(repoRoot)`: every non-dot, non-reserved **directory** under `tenants/`. It uses
  `statSync` in try/catch, because a dangling symlink must not hide the healthy tenants. Valid tenants
  come first, sorted by `order` then `id`; broken ones come last, carrying their errors. The picker
  shows a broken tenant as a disabled card listing its errors; it never throws.
- `getTenant(repoRoot, id)` → a usable tenant, or `null` when the id is invalid, unknown or broken
- `tenantRoot(repoRoot, id)` throws `unknown tenant`. **The id is matched against the discovered
  list and never joined raw into a path.** That match is the path-traversal guard.
- `parseEnv(text)`: a minimal `.env` parser
- `ACCOUNT_KEYS`: keys bound to ONE business's own accounts (its social token and ids, YouTube
  channel and OAuth, its booking-tool key…)
- `tenantEnv(repoRoot, id)` = `{ ...process.env minus ACCOUNT_KEYS, ...ENGINE_* lookup aliases,
  ...the tenant's .env.local }`. The tenant's own file wins. The engine env supplies only SHARED keys.
  The engine's own social token is re-exposed only as `ENGINE_<NAME>`, so a route can look up PUBLIC
  competitor accounts with it; it never stands in for the tenant's own account.

## 6. `tenant.ts`: route-side resolution

```ts
import { join } from "path";
import { getTenant, listTenants as listCore, tenantEnv, settingsOf } from "./tenant.mjs";

export const REPO_ROOT = join(process.cwd(), "..", "..");   // the ONLY place the repo root is derived

export interface TenantManifest { schema_version: 1; id: string; name: string; kind: "creator"|"company";
  accent: string; order: number; modules: string[]; formats: string[]; engines: string[]; settings?: Record<string, unknown> }
export type TenantSettings = ReturnType<typeof settingsOf>;   // lang, dir, radar, competitors, crm, media
export type BrandStatus = "approved" | "draft" | "missing";
export interface ResolvedTenant { id: string; root: string; env: Record<string, string|undefined>;
  manifest: TenantManifest; settings: TenantSettings; brand_status: BrandStatus }
export type TenantCtx = { params: Promise<{ tenant: string }> };

export async function resolveTenant(ctx: TenantCtx, opts: { module?: string } = {}): Promise<ResolvedTenant | Response> {
  const { tenant } = await ctx.params;
  const t = getTenant(REPO_ROOT, tenant);
  if (!t || !t.manifest) return Response.json({ error: "unknown tenant" }, { status: 404 });
  if (opts.module && !t.manifest.modules.includes(opts.module))   // a disabled module is OFF, not hidden
    return Response.json({ error: `module "${opts.module}" is not enabled for this workspace` }, { status: 404 });
  return { id: t.id, root: t.root, env: tenantEnv(REPO_ROOT, t.id), manifest: t.manifest,
           settings: settingsOf(t.manifest), brand_status: t.brand_status };
}

/** 409 for every brand-sensitive producer until the kit is approved. */
export function brandGate(t: ResolvedTenant): Response | null {
  if (t.brand_status === "approved") return null;
  return Response.json({ error: "<owner-language sentence: approve the brand kit in the strategy view first>",
                         brand_status: t.brand_status }, { status: 409 });
}
```

### Route conventions (every route)

```ts
// src/app/api/[tenant]/<area>/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request, ctx: TenantCtx) {
  const t = await resolveTenant(ctx, { module: "<area>" }); if (t instanceof Response) return t;
  try { /* read files under t.root */ return Response.json(data, { headers: NO_STORE }); }
  catch { return Response.json(EMPTY_DEFAULT, { headers: NO_STORE }); }   // a missing file is normal on a fresh tenant
}
```
- **Reads never throw.** A missing file returns an empty default (`{events:[]}`, `[]`, `""`). A new
  tenant has no files yet, and a fresh workspace must open to empty states, never a 500.
- Routes that **spawn an agent, publish, or spend money** return 403 when
  `NODE_ENV === "production"`. This is a local tool, never a hosted one.
- File-serving routes (`/asset?path=`) take a relative path, compute `normalize(join(t.root, rel))`,
  require it to start with `t.root + "/content/"`, allowlist extensions (`.png`; `.mp4` with Range),
  and return 403 otherwise.
- **The only non-tenant routes are `GET /api/tenants` and, when the vault is built, the owner-level
  `/api/brain/*`** (reference 12 §7). `/api/tenants` feeds the picker. It returns only `{id, name, kind,
  accent, modules, formats, engines, lang, dir, brand_status, errors, pending}` (pending = the count of
  ideas in `new` or `reviewing`), never file contents. Every other route, the image proxy included, is
  under `/api/[tenant]/`.

## 7. Client side

```tsx
// src/lib/tenant-client.tsx
"use client";
const Ctx = createContext<TenantInfo | null>(null);
export const TenantProvider = ({ tenant, children }) => <Ctx.Provider value={tenant}>{children}</Ctx.Provider>;
export function useTenant() { const t = useContext(Ctx); if (!t) throw new Error("useTenant outside TenantProvider"); return t; }
export function useApi() {
  const t = useTenant();
  const apiUrl = (p: string) => `/api/${t.id}${p}`;
  return { apiUrl, tfetch: (p: string, init?: RequestInit) => fetch(apiUrl(p), { cache: "no-store", ...init }) };
}
```
There is deliberately **no un-prefixed fetch helper**: a view that cannot name its tenant cannot ask
for data at all. The shell and picker are specified in reference 5.

## 8. CLI conventions

```js
// engine/tools/lib/tenant-arg.mjs
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
import { getTenant, listTenants } from "../../app/src/lib/tenant.mjs";
export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
/** Reads --tenant <id> from argv (and removes it). Exits 1 when absent or unknown — no default. */
export function requireTenant(argv = process.argv) {
  const i = argv.indexOf("--tenant"); const id = i > -1 ? argv[i + 1] : undefined;
  if (i > -1) argv.splice(i, 2);
  const t = id ? getTenant(REPO, id) : null;
  if (!t) {
    const known = listTenants(REPO).filter((x) => x.manifest).map((x) => x.id).join(", ");
    console.error(`✗ ${id ? `unknown tenant "${id}"` : "--tenant <id> is required"} (tenants: ${known || "none"})`);
    process.exit(1);
  }
  return t;
}
```
Every tool takes `--tenant <id>`, and there is no default tenant anywhere. A tool that is both
importable and runnable must compare `realpathSync(process.argv[1])` with
`fileURLToPath(import.meta.url)`. When it is invoked through a symlink, a raw comparison makes the
tool exit 0 having done nothing.

## 9. Creating tenants: ship `assets/new-tenant.mjs`

```bash
node engine/tools/new-tenant.mjs <id> --name "<Name>" --kind creator|company \
     [--accent #hex] [--order n] [--modules a,b,c] [--formats a,b] [--engines html,image-model] \
     [--lang <bcp47>] [--settings '<json>']
node engine/tools/new-tenant.mjs zz-test --from <id>      # a throwaway TEST COPY for checkpoints
```
It is **all-or-nothing**: it refuses an existing folder, and any failed step `rm -rf`s the half-built
folder before rethrowing, so a retry is never blocked. It creates:
- `brand/ content/ research/radar/{runs,failed}/ memory/ library/ work/ .claude/`
- `tenant.json`, validated before anything is written
- `content/ideas.json` = `{version:1, updated_at:null, ideas:[]}`
- `memory/MEMORY.md` (an index header) and `memory/{rules,people,decisions,projects,lessons,notes}/`
- `.claude/settings.json` = deny + ask, with **no allow list** (reference 3)
- `.claude/skills/` copied from `engine/skills/tenant/`
- `CLAUDE.md` from the Routing-Map template, worded so it stays true after a kit is approved in the app
  (no agent can edit it later), plus `AGENTS.md → CLAUDE.md`
- the relative `content/node_modules` symlink
- **Windows fallback**: when the OS refuses a symlink, `AGENTS.md` becomes a generated copy (a header
  line says so) and `node_modules` a directory junction with an absolute target

`--from <source-id>` makes a **test copy**: the source's manifest (a new id, "(test copy)" in the name)
plus its `brand/` and `library/`. It never copies `.env.local`, `content/` (chats, ideas, publishing
records) or `memory/`. Every "on a test copy tenant" checkpoint uses it, then `rm -rf tenants/zz-test`.

**Tenants are created before the skills exist.** The builder skills are written in Stage 5 and
`PUBLISH_ASK` is finalised in Stage 2, after the real tenants are scaffolded here, and no agent can
write `.claude/**`. So `node engine/tools/sync-tenant.mjs --all` re-copies `engine/skills/tenant/*`
and rewrites each tenant's `.claude/settings.json` from `tenantSettings()` (keeping extra deny/ask
rules the owner added; dropping any allow list, foreign hook or other key, and saying so). Run it at
the end of Stage 2, at the end of Stage 5, and after any later edit to those sources.

It never writes a brand kit, so a new tenant starts gated (`missing`). Run it once per business from
the interview's answers. When the user chose interview path (c), write `brand/strategy.draft.json`
afterwards.

**Stage 1 order**: bootstrap the app → **copy all eleven assets** to their places (SKILL.md table) and
edit `PUBLISH_ASK` → write `tenant.ts`, `tenant-arg.mjs` and `config.ts` → run `new-tenant` per business.
`new-tenant.mjs` imports `agent-flags.mjs` and `tenant.mjs`; with either missing it dies with
`ERR_MODULE_NOT_FOUND`. (`ideas-core.mjs` imports `strategy-core.mjs`, which Stage 3 writes; nothing
imports `ideas-core.mjs` before then, so copying it early is harmless.)

## 10. Single-tenant mode

- Same engine, same code, exactly one `tenants/<id>/` folder. Confinement still matters: `Read(../**)`
  keeps the agent out of the engine source, the repo-root `.env.local` and the settings.
- **The picker forwards**: when `/api/tenants` returns exactly one valid tenant, `router.replace("/<id>")`.
  Keep the picker code; it is needed the day a second business arrives.
- The header shows the business name and no switcher dropdown.
- Account keys still live in `tenants/<id>/.env.local`, so adding a second business never leaks them.
- CLI tools still require `--tenant <id>` (suggest a shell alias).
- The vault (if built) still has an owner hub and one business hub.
- **Upgrading to multi-tenant** means running `new-tenant.mjs` again. Nothing moves.

## 11. Lessons (each one cost a real debugging session)

- **There is no default tenant anywhere.** A forgotten tenant must fail loudly instead of silently
  reading or writing another business.
- **`tenantRoot` matches against the discovered list and never joins the id raw.** That match is
  the path-traversal guard; `../` can't be a tenant id.
- **A disabled module is off on the server.** `resolveTenant({module})` returns 404. Hiding a sidebar
  item is UI, not access control.
- **`listTenants` must survive a dangling symlink and never list reserved folders.** The verifier's
  temporary attacker tenant would otherwise flash up as a broken card mid-run.
- **Scaffolding is all-or-nothing** (rm on failure), so a crashed first attempt never blocks the retry.
- **The `node_modules` symlink is relative**, so the repo survives a move or a clone.
- **A dual-use CLI compares realpaths.** Through a symlink, the raw comparison silently skipped `main()`.
- **Never cache the tenant list or a tenant's files in a module-level constant.** Re-read per request
  so editing a file changes behaviour with no restart.

## Checkpoint (before Stage 2)

```bash
cd engine/app && pnpm exec tsc --noEmit && pnpm build && cd ../..
grep -n "cacheComponents" engine/app/next.config.* || echo "ok: no cacheComponents"
( cd engine/app && node -e "require('playwright').chromium.launch().then(b=>b.close()).then(()=>console.log('chromium ok'))" )   # else: HTML-only export
node engine/tools/new-tenant.mjs zz-tmp-check --name "Check" --kind company   # must succeed
node engine/tools/new-tenant.mjs zz-tmp-bad --name "Bad" --kind company --settings '{"radar":{"cron":"yes"}}'   # must be refused
node -e "import('./engine/app/src/lib/tenant.mjs').then(m=>console.log(m.listTenants(process.cwd()).map(t=>[t.id,t.brand_status,t.errors])))"
rm -rf tenants/zz-tmp-check
```
- The build lists every `/api/...` route separately from the catch-all pages.
- Every real tenant from the interview exists, validates, and shows `brand_status: missing` (or
  `draft` where you wrote a draft).
- `tenants/<id>/content/node_modules` is a symlink (or a junction on Windows), and
  `ls tenants/<id>/content/node_modules/playwright` resolves. `AGENTS.md` is a symlink, or a copy whose
  first line is the generated-copy header.
- Each real tenant's `tenant.json` carries the `settings` the interview produced.
- An unknown id in a test call to `resolveTenant` returns 404.
