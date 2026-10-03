# Reference 8: Radar, competitors, transcripts, analytics (Stage 7)

The radar turns the outside world into **grounded** ideas. The competitor layer turns other accounts'
proven hits into ideas with a real differentiator. Analytics shows the business its own numbers.
**The engine, not the model, decides what is real**: every radar idea is re-opened, dated and
quote-checked by code before it can reach the store.

> Why: in the first live radar, 5 of 7 ideas in one run cited the brand's OWN page as their source, and
> the "news" was up to a month old. The owner called the output hallucination. Everything in §4 exists
> because of that run.

**Two assets implement the core of this reference: copy `assets/radar-verify.mjs` (§3–§4: the snapshot,
the SSRF-guarded fetch, page dates, quote shingles, the language gate, unproven numbers, the per-source
caps) and `assets/extract-json.mjs` (the one parser) verbatim.** Translate `REASONS` into the owner's
language and add the publishing language's words to `LANGUAGE_WORDS` / `STOPWORDS`. The prose below
is the explanation of why each check exists; when it and the asset disagree, the asset wins.

Per-business numbers come from `tenant.json` `settings` (reference 2 §4): `radar.max_age_days`,
`radar.cron`, `competitors.{covered_window_days, hit_multiplier, heavy_min_views, paid_transcription}`
and `lang`. Never write one of them as a literal in a route.

Modules: `radar` (the news scan, health, community post), `inspiration` (competitors, hits,
competitor ideas), `analytics` (own posts). A tenant with the `community-post` format gets a daily
draft. Radar scans, competitor runs and community drafts all call `brandGate` (409 until the kit is
approved), and every spawning route returns 403 in production.

```
<tenant>/research/radar/runs/<run-id>.json       scout output, rewritten in place by the verifier (kept ideas + verification + ingest)
<tenant>/research/radar/runs/<run-id>.raw.json   the scout's UNTOUCHED output, kept for audit
<tenant>/research/radar/failed/<iso>.txt         one record per run that did not land (header lines + raw text)
<tenant>/research/radar/feed.md                  the human-readable log, appended by the ENGINE after ingest
<tenant>/research/radar/last-run.txt             the cron's status line: "<date>\t<ok|degraded|limit|error>\t<sentence>"
<tenant>/research/radar/community/<date>.md|.json the daily community-post draft + its provenance
<tenant>/research/competitors/covered.json       the precedent index (built, never hand-edited)
<tenant>/content/analytics/competitors.json      {competitors: Competitor[]} with cached posts (can be megabytes)
<tenant>/content/analytics/competitor-hits.json  {updated, hits: Hit[], errors: string[]}
<tenant>/content/analytics/transcripts.json      {[postId]: {text, at, via}}
<tenant>/content/analytics/transcribe-attempts.json {[postId]: {at, error}}  (paid-attempt backoff)
<tenant>/content/analytics/{instagram,youtube}-posts.json · audience.json   the brand's OWN data
```
Run ids: news `YYYY-MM-DD-HHmm`; competitor study `comp-YYYY-MM-DD-HHmm`. The `comp-` prefix is how
every reader tells the two modes apart.

---

## 1. The radar job (`radar-jobs.ts`)

One background job per tenant, shared by `/api/<t>/radar`, the competitor-ideas action, the chat's
`radar` and `competitor_ideas` actions, and the cron.

```ts
interface RadarJob { status: "running"|"done"|"error"; logs: string[] /* cap 600 */; startedAt: number; finishedAt?: number;
  runId?: string; tools?: Record<string, number>;                 // scout tool calls by name
  verify?: { kept: number; dropped: { reason: string; text: string; url?: string }[] };   // structured: no view parses logs
  ingest?: { status: string; inserted?: number; deduplicated?: number; rejected?: number; saturated?: number; reason?: string; failed_log?: string } }
// globalThis.__radarJobs: Map<tenantId, RadarJob>; globalThis.__radarChildren: Map<tenantId, ChildProcess>
```

`startScan(t, {mode: "radar"|"competitors", postIds?})`:
1. Create the job and set it in the map.
2. **If `inspiration` is on, refresh the competitors first** (`track()`; only accounts older than
   ~20 h). Log one summary line. A tracking failure is logged and the scan continues.
3. Bail if the job was cancelled or superseded meanwhile (`map.get(t.id) !== job`).
4. **Take `groundingSnapshot(root)` NOW, before the agent runs.** It records what verification will
   trust. The agent can write some files (memory, CLAUDE.md is denied but analytics is not), so a
   snapshot taken after it exits would check the agent against itself.
5. News mode: `runScout(t, job, runId, radarScanPrompt(...))`. Competitor mode: eligible hits = the
   snapshot's hits minus the brand's own posts, filtered to `postIds` if given, else the top 10. Zero
   hits → error `no-hits` with an actionable sentence ("add competitors / track now").

`runScout`:
- `spawnTenantAgent(t, "scout", {maxTurns: 45, stream: true})`, with the reference-3 checklist.
- Parse stream-json. Text blocks go to the log. Tool calls increment `job.tools[name]` and are
  **compacted into ONE progress line per stretch** in the owner's language ("searched 3 times · opened 5
  pages · read 4 files"), rewritten in place until the next text line.
- `cliNotice(text)`: CLI plumbing errors (API errors, request ids, usage limits) are replaced with one
  owner-language sentence ("usage limit reached; what it wrote so far is still checked").
- On close, in-process:
  1. News mode with `tools.WebSearch === 0` → fail `no-research`. A news run without web research is
     rejected whole, because the scout will otherwise "research" from memory.
  2. "verifying every source…" → `verifyRunFile(root, runRel, {mode, snapshot, focus})` (§4). A throw or
     `!ok` → fail `verification-failed`.
  3. **The editor pass** (if anything was kept): a second model on the `text` profile (no tools, 1 turn,
     150 s timeout) reads each verified idea against its own evidence and returns
     `[{i, verdict: keep|rewrite|drop, reason, text?, suggested_hook?}]`. A rewrite is accepted only if
     it is 12–220 chars and passes the language gate; the original is kept in `_original_text`. If the
     editor fails, verified ideas pass unchanged. *A source check proves the source is real, not that
     the idea follows from it.* The editor catches generic tips hung on unrelated news, teasers, and
     proposals written as if the owner already did them.
  4. Nothing kept → fail `all-dropped` with the first reason.
  5. `ingestRadarRun(root, runRel, {verifiedAt: v.checked_at})` (§5); write the `ingest` counts back
     into the run file; `appendFeed`; for news runs on tenants with `community-post`, draft it in the
     background.
  6. `fail(code, reason)` → `preserveFailure()` writes `failed/<stamp>.txt` and sets
     `job.ingest = {status:"failed", code, reason}`.
  7. The final status is `done` if ideas landed, **even if the CLI exited non-zero after writing its
     file**. A refused last message once turned a scan that added 4 ideas into "stopped before
     finishing".
- Cancel (`DELETE /radar`) sends SIGTERM to the child and marks the job "stopped".

## 2. The run contract (`radar-contract.mjs`): one module, three entry points

It is used by the app route, the cron's offline path and the scout prompt itself. **Two modes, two
contracts.** When the competitor run once shared the news rules ("every source is an external
article"), every idea was dropped for not pointing at a hit: 0 ideas, 3 runs out of 3.

**NEWS run** (written by the scout to `research/radar/runs/<id>.json`):
```json
{ "run_id": "YYYY-MM-DD-HHmm", "scanned_at": "ISO", "scope": "general|<focus>",
  "coverage_note": "one honest line: what it searched, what it could NOT reach",
  "signals": [{ "bucket": "launch|market|competitor|regulation|trend|other", "headline": "", "why_it_matters": "", "url": "", "date": "YYYY-MM-DD" }],
  "ideas": [{
    "text": "ONE sentence ≤25 words, brand voice and language, a PROPOSAL (never 'I already did')",
    "what_happened": "the news exactly as the SOURCE states it (every name and number must be on the page)",
    "why_it_matters": "", "source_url": "an EXTERNAL article opened with WebFetch this run",
    "source_title": "", "source_date": "YYYY-MM-DD, ≤10 days old",
    "evidence": "ONE sentence copied VERBATIM from the article body, 60–220 chars, ≥12 words",
    "pillar_id": "", "persona_ids": [], "funnel_stage": "", "brand_associations": ["≥1 or drop the idea"],
    "shape_id": "from the kit's shapes", "core_lesson": "1–4 word lowercase key; reuse an existing key for the same lesson",
    "angle": "", "suggested_hook": "", "hook_source": "a documented winner with its real number, or null",
    "competitor_precedent": { "covered": false, "who": null, "date": null, "performance": null, "differentiator": "required if covered" },
    "proof_assets": ["only real assets from the brand docs or library"], "suggested_cta_id": "offer id or null",
    "timeliness": { "level": "evergreen|timely|urgent", "expires_at": null, "rationale": "" }, "rationale": ""
  }] }
```
**COMPETITOR run**: the same idea body with no `signals`, no `evidence` and no 10-day rule. Each idea
carries `source_type:"competitor"`, `competitor_id`, `hit_post_id` and `source_url` = the hit's
permalink, all copied EXACTLY from the HITS list. `what_happened` = the MECHANISM that made the hit
work (hook, format, promise, payoff). `competitor_precedent.covered = true`, with the hit's real number
and a CONCRETE differentiator.

**Prompt builders** (built **per run**, so an edit to the kit applies on the next scan without a restart):
- `radarScanPrompt({tenantName, tenantId, strategyBlock, runFile, video, products, varietyBlock})` is
  ONE function, used by the app and the cron. A cron that once carried its own niche-specific prompt
  would have scanned developer-tooling news for a furniture company. Its structure:
  - **The language rule FIRST and LAST**: status notes and the summary are in the owner's language,
    short, with no paths or markdown. (Without it, the scout narrated a whole run in English under a
    non-English brand, while the owner watched the log live.)
  - The strategy block (`radar` scope).
  - THE RUN: read the brand docs, `competitors.json` (Grep, it is huge), `competitor-hits.json`,
    `covered.json` and `ideas.json` (rejected ideas included; never repeat them). Glob only with an
    explicit path. Do 5–6 WebSearches on what this audience cares about (derived from the strategy,
    never a hardcoded niche), filter to the personas, apply the no-gos, then WebFetch at least as many
    DIFFERENT sources as ideas. Apply the kit's scoring. Produce 6–7 ranked ideas. **With a product
    library, at least half the ideas are anchored on a real product**, named exactly, with the news as
    the trigger (a furniture brand's run once produced six generic tidy-your-room tips any account
    could post). **With AI video formats, at least 2 ideas must be visual**, one moment per shot,
    understandable without voice-over.
  - `renderVarietyBlock(kit, ideas)` from `shapes.mjs`: the allowed shapes with their news flags, the
    diversity rules, the shape×pillar pairs that are already full, and the lessons taught in the last
    30 days. **The scout is told up front what ingest will refuse.**
  - `radarOutputInstructions(runFile, {mode})`: the contract; the PRECEDENT block (read `covered.json`
    and the transcripts first; anything a tracked competitor ran recently above the "heavy hitter"
    threshold needs a real differentiator, and "we'll do it better" is not one; never build on a
    caption alone); the mode's GROUNDING block; the LANGUAGE rules (every human-facing field in the
    brand's language; a read-aloud test); the HARD RULES (ids must exist in the kit, so use null rather
    than guess; `brand_associations` ≥1; the CTA may be null; no invented numbers, clients or results;
    never a past-tense claim the docs don't state; never quote a follower's DM or comment as if it
    arrived; owner metrics only from the kit, docs or analytics); and FILES ("write the run file and
    NOTHING else: not feed.md, not ideas.json").
- `buildCompetitorPrompt` lists every hit as `competitor_id · hit_post_id · name (platform) · N× its
  median · views/likes · date · transcript ✓ | caption only`, with the permalink and the first 140
  chars. The steps: find WHY each hit worked from its transcript (falling back to the caption or a
  WebFetch of the permalink); read `competitors.json` to tell a pattern from a one-off; produce 5–6
  ideas that transfer the MECHANISM, never the topic and never the script; at most 2 ideas per hit,
  spread across competitors.
- `INGEST_REASON` maps every machine code (no-research, verification-failed, all-dropped, unverified,
  run-file-missing, invalid-json, invalid-shape, missing-or-invalid-shape, run-not-diverse,
  strategy-unreadable) to **one owner-language sentence**. Every UI surface shows the sentence, never
  the code.
- `extractJson(text)` (asset `extract-json.mjs`, re-exported by `radar-contract.mjs`): a ```` ``` ````
  fence first, then the first balanced `{…}` (string- and escape-aware). **The verifier and the ingest
  use this same parser.** A fenced run file once made the verifier refuse while the ingest still read
  every idea unchecked.
- `radarIdeaToRecord(input, runId)` is a pure mapping to the idea-store shape: `source.type` =
  `"competitor"` when `input.source_type === "competitor"` (plus `source.competitor_id`), else
  `"radar"`; `source.url/title` from `source_url/source_title`; `source.radar_run_id = runId`; the
  taxonomy ids, `shape_id`, `core_lesson`, `angle`, hooks and `competitor_precedent` copied; and
  `grounding = {what_happened, why_it_matters, evidence, source_date, verified_at: input._verified_at}`.
  **That last copy is what makes an idea approvable**: `isUnverifiedExternal` blocks any radar or
  competitor idea whose `grounding.verified_at` is empty.

## 3. Grounding snapshot (`radar-verify.mjs`)

`groundingSnapshot(root)` → `{own, hits, ownPostIds, langGate, ids, facts, transcripts}`:
- `own`: every URL in `strategy.json`, `tenant.json` and `CLAUDE.md`, keyed as `host` (or
  `host/first-path-segment` for social hosts): the brand's own pages.
- `hits` from `competitor-hits.json`; `ownPostIds` from the brand's own post files.
- `gate`: the language gate, from `settings.lang` (`languageGate`). A non-Latin language is gated by
  script (an idea under 40% of that script's letters is dropped). A Latin-script language is gated by
  function words (`STOPWORDS`): an idea where another language's function words clearly outnumber the
  brand's is dropped, so a Spanish brand does not get English ideas. **A Latin-script language with no
  `STOPWORDS` entry is gated only against other scripts**: a known gap, closed by adding its function
  words. With no `settings.lang`, the dominant non-Latin script of the kit's voice is used, else no gate.
- `ids`: the shape ids plus every kit id containing `-` or `_`. A sentence carrying one was written
  for the machine, not for a follower.
- `facts`: every number in the kit, `audience.json`, `CLAUDE.md`, every `memory/**/*.md` and the
  product JSONs, normalized (every decimal digit system folded, thousands separators, k/m and the
  `LANGUAGE_WORDS` scale words).
- `maxAgeDays`: `settings.radar.max_age_days`.

## 4. The verifier: `verifyRunFile(root, runRel, {mode, maxAgeDays = settings, snapshot, focus, fetcher})`

Parse with `extractJson`. Write `<run>.raw.json` first. Verify the ideas in batches of 4, with one
fetch per URL (a cached promise map). For each idea, in order:
1. **Language gate**: if `text`, `what_happened` or `why_it_matters` is not in the brand's publishing
   language (the `gate` above) → drop.
2. **Readability**: `text` is 12–220 chars, with no file names (except public conventions like
   `README.md` or `package.json`), no `*_id` tokens and no internal kit ids.
3. **Unproven metrics**: in `text` and `suggested_hook`, every number ≥10 that sits within two words of
   a metric noun (followers, views, subscribers, members, clients, currency, %, likes, comments; in the
   brand's language and English) must exist in `facts` or in the support text (within 5% for values ≥
   1000). The model once wrote a follower growth "from X to Y": Y was real analytics, X came from
   nowhere.
4. **NEWS check**:
   - Rejected outright: a source that is the brand's own page, a social host (instagram, x, twitter,
     youtube, tiktok, facebook, linkedin, threads, the community platform), or a paid placement path
     (`advertorial`, `sponsored`, `partner-content`, `brandvoice`, `paid-post`…).
   - `source_date` present, not more than 2 days in the future, not older than `maxAgeDays`.
   - `evidence` ≥60 chars and ≥12 words. A 27-char boilerplate quote once passed a looser check.
   - **Fetch the page behind an SSRF guard**: http(s) on ports 80/443 only; no localhost, `.local` or
     `.internal`; resolve DNS and refuse private, loopback, link-local, CGNAT and ULA addresses
     (including IPv4-mapped v6); follow redirects **manually** (max 6) and re-check every hop; 15 s
     timeout; 3 MB cap. Otherwise a crafted source URL makes the engine GET `/api/<tenant>/…` on
     localhost for the agent.
   - **After redirects**, refuse a final URL that is own, social or paid. A redirect to the brand's own
     page once slipped through.
   - Page scopes: strip script/style/noscript/template/svg; `main` = `<article>`/`<main>` text; `body` =
     the page minus nav, footer, aside and form. Normalize words (lowercase; fold diacritics, letter
     variants and digits; strip punctuation).
   - **Quote share**: 1 if the whole quote is present (also checked with spaces removed, because CMS
     inline tags glue words together); otherwise the share of its 8-word shingles present. It must be
     ≥0.8 in `main` (when main is >400 chars) or `body`. A fabricated paragraph with one real 8-word run
     fails this.
   - **A templated page** (the quote appears ≥4 times) is a generated SEO page → drop.
   - **The page's own date**, in order: `<meta>` publish keys (`article:published_time`, `og:…`,
     `datePublished`, `parsely-pub-date`…), `itemprop=datePublished`, JSON-LD `datePublished` on an
     Article/Posting/Report/PressRelease/VideoObject (not LiveBlog), a full date in the URL path, a
     month in the URL path, then `<time datetime>` (one tag = the date; several = a multi-entry page
     that must have one within ±2 days of the claim). With no machine date at all, the claimed day must
     be written in the page text. The rule: the page date is ≤ `maxAgeDays` old and within 2 days of the
     claim. A 2023 page dated "today" once got through.
   - **Facts off the page**: every 2+-digit number and every name run in `what_happened` must appear on
     the page (common acronyms exempt). In a non-Latin sentence every Latin run is a name; in a
     Latin-script sentence only proper-noun-looking tokens count (capitalised mid-sentence, ALL-CAPS, or
     carrying a digit; for German, whose nouns are all capitalised, only the last two). A model once tied
     a real article to a story from memory about a different product.
   - If `competitor_precedent.covered`, the differentiator is ≥15 chars.
5. **COMPETITOR check**: the idea must match a snapshot hit by `hit_post_id`, the cleaned permalink, or
   the platform post key (YouTube video id, IG shortcode, TikTok/X status id). The `competitor_id` must
   own that hit; the hit must not be one of the brand's own posts; with `focus`, it must be one the owner
   picked; the differentiator is ≥15 chars.
- **Run caps: max 2 ideas per source URL and max 2 per host** (the 3rd is dropped). A run once stood 4
  of 5 ideas on one tutoring blog.
- **Every kept idea, news or competitor, gets `_verified_at = checked_at`.** News ideas also get
  `_grounding {final_url, date_source, page_date, quote_share}`; competitor ideas get the ENGINE's facts
  (`source_type:"competitor"`, competitor id, hit id, permalink, a title built from the hit, the hit's
  date), never the model's copy. A competitor idea without the stamp would fail closed at ingest, and
  one that slipped through would be unapprovable.
- Dropped ideas are recorded with an owner-language reason. The file is rewritten with `ideas = kept`
  and `verification = {checked_at, mode, checked, kept, dropped, raw_file}`.

## 5. Ingest (`radar-ingest-core.mjs`): a pure function shared by the app and the CLI

`ingestRadarRun(root, runPath, {dryRun, verifiedAt})`, inside `withStore` (reference 4):
1. A missing file → `run-file-missing`; unparseable → `invalid-json`; no ideas → `invalid-shape`. Each
   preserves the failure and leaves `ideas.json` untouched.
2. **Fail CLOSED on the stamp**: only ideas whose `_verified_at === verifiedAt` (the value
   `verifyRunFile` RETURNED in memory, never re-read from the agent-written file) may land, in BOTH
   modes. None → `unverified`. `radarIdeaToRecord` then carries the stamp into
   `grounding.verified_at`.
3. An unreadable kit → `strategy-unreadable`.
4. Any idea with a missing or unknown `shape_id` rejects the WHOLE run.
5. `enforceRunDiversity(ideas, kit)`: max 2 per shape, max 1 per lesson, trimmed with reasons. Fewer
   than 2 non-news ideas, or fewer than 2 distinct shapes → the WHOLE run is rejected
   (`run-not-diverse`). Trickling in one news item per day is how a store silently becomes a news feed.
6. Per idea: map to a record; empty `brand_associations` → rejected (the intentionality gate);
   `validateIdea` (strict); `insertIdea` (dedup, then shape and lesson saturation).
7. Write once, atomically. Return `{ok, status: success|degraded, run_id, inserted, deduplicated,
   rejected, saturated, diversity, details}`. `degraded` = nothing inserted, but ideas were rejected or
   saturated.

`preserveFailure(root, raw, reason, errors, source, code)` writes `failed/<iso>.txt` with header lines
`# reason:`, `# code:`, `# errors:`, `# source:`, then the raw text. **A dry run writes no failure
record**, because health would count it.

`appendFeed` appends to `feed.md`: a dated heading, a verification line (checked · kept · dropped ·
inserted), the coverage note, the signals, and each idea with its shape label and **its fate in the
store** (added / duplicate / lesson repeated / shape saturated / rejected and why), plus the dropped
ideas. **The engine writes `feed.md`; the scout never does.** When the scout wrote it, the log listed
11 ideas that verification had thrown out.

## 6. Health: `GET /api/<t>/radar/health` (silent failure was the bug)

> The radar once failed many consecutive runs. Every failure was logged correctly to `failed/`, where
> nothing ever read it, while the owner believed the radar was running.

Read the newest 40 run files and all failure records, **ordered by mtime** (never by name: `comp-…`
sorts after dates), excluding `.raw.json` and `last-run.txt`.
- A run is a success only with `kept > 0`, a `verification` block, and no failure record for its id. An
  in-progress file has no verification block, so it is not a success. (Health once said `ok:true` right
  after two failed competitor runs, because of name sorting, day-level comparison, `last-run.txt`
  counting as a failure and an emptied file counting as a success.)
- `consecutive_failures` comes from the merged, time-ordered event list.
- `last_check` = `{run_id, competitor, at, outcome, reason, checked, kept, dropped[], stored}`.
- corpus: per tracked account `{name, handle, cache_age_days, videos, transcribed}`, plus totals,
  `coverage_pct` and `covered_index_days_old`.
- `problems[] {level: error|warn, message, fix}` in the owner's language: ≥2 consecutive failures →
  error, 1 → warn; last success older than 2 days → warn; account caches older than 7 days → warn; the
  top 8 video hits not all transcribed → warn; the kit names competitors but none is tracked → warn;
  IG/TikTok/X competitors without `APIFY_TOKEN` → warn; the precedent index missing or older than 3
  days → warn.
- Response: `{ ok, problems, radar, corpus }`. **The radar view and home show it as a banner**, not as
  a log line.

## 7. The daily cron (`engine/tools/radar-cron.sh`), via launchd, cron or Task Scheduler

- `cd` into the repo and `export PATH` with the dirs from `which claude` and `which node`. A scheduled
  job runs with a minimal PATH and an arbitrary cwd, which is the #1 reason cron jobs "silently do
  nothing". Trim its log to the last ~2000 lines.
- Loop over `listTenants()` filtered to the `radar` module, `brand_status === "approved"` **and**
  `settingsOf(manifest).radar.cron !== false`. For each tenant:
  - Render its block with the SAME renderer (`strategy-block.mjs radar --tenant <id>`). **If it is the
    fallback (grep `FALLBACK_MARKER`), SKIP the tenant** and record a failure (`failed/` record with code
    `strategy-unreadable` + `last-run.txt` = `error`), so health counts it and the banner shows it. An
    emptiness check never fires, because the renderer never returns "". Never scan with another
    tenant's guardrails, and never spend a scan on no brand at all.
  - **If the app answers** (`GET http://127.0.0.1:<port>/api/tenants` returns 200 within 5 s): `POST
    /api/<id>/radar`, then poll every 15 s for up to 40 minutes. The cron presses the SAME button as
    the owner, so it gets competitor refresh, the editor pass and the community post.
  - **Otherwise, the offline fallback**: build the same `radarScanPrompt` via node imports, pipe it to
    `run-agent.mjs --tenant <id> --profile scout --max-turns 40 --model <lighter>`, then run
    `radar-ingest.mjs <runFile> --tenant <id>` (verify → ingest → feed, failing closed; exit 2 when
    nothing landed).
  - Write `research/radar/last-run.txt`: `ok` / `degraded` / `limit` (usage-limit text seen) / `error`.
- Use a lighter model for the daily scan, to protect the usage limit.
- Install: a launchd plist with `StartCalendarInterval` (macOS), a crontab line (Linux), or
  `schtasks` with a `.ps1` twin (Windows). **Tell the user exactly what was installed and how to
  remove it.**

## 8. The radar view

- A header with "scan now" (which becomes **stop** while running) and the last run's time, status and
  coverage note.
- **The health banner** above everything when there is an error-level problem.
- A live log polled every 1.5 s that reconnects on mount and keeps a finished job for 10 minutes. A
  leading status glyph sets the line's tone and is then dropped; markdown is stripped; each line gets
  `unicode-bidi: plaintext`; it auto-scrolls.
- The headline is computed from `ingest`: "added N" / "nothing new" / the owner's reason sentence /
  "stopped".
- A **last-check card** as counts, not a sentence: `checked · kept · dropped`, then what the store did:
  `3 new · 4 already known · 1 shape saturated · 1 rejected`. Keep "shape saturated" separate from
  "already known": one means "you've said this", the other "you've said things shaped like this". The
  dropped ideas are grouped by reason ×count, expandable to the list with their hosts.
- The 30-day **shape mix** chips; the radar's ideas as cards (reference 4's IdeaCard, with Approve and
  Reject right there); a **run history** listing successes and failures on the same screen, each with
  its reason.

---

## 9. Competitors (`competitors.ts` + `apify.mjs`): one module for the view, the tracker and the chat

```ts
type Platform = "youtube"|"instagram"|"tiktok"|"x";
interface Competitor { id; name; platform; handle; channelId?; thumb?; followers?; note?; total?; nextAfter?;
  posts?: Post[] /* ≤600, newest first */; fetchedAt?: number; via?: "apify"|"youtube-api"|"meta" }
interface Post { id; platform; caption; title; permalink; thumb; mediaUrl?; type /* REELS|VIDEO|SHORT|IMAGE|CAROUSEL_ALBUM|TEXT */;
  timestamp; views?; likes?; comments?; shares?; er?; duration? }
interface Hit { competitor_id; competitor; platform; post: Post; multiplier: number; basis: "views"|"likes" }
```
Ids: the YouTube channel id, `ig_<user>`, `tt_<user>`, `x_<user>`.

**Sources:**
- **YouTube**: the Data API v3 (free, `YOUTUBE_API_KEY`). Resolve by channel id, then `forHandle`, then
  a search fallback. Videos come from the uploads playlist (50 per page) plus `videos.list` (50 ids per
  call). A duration ≤60 s → `SHORT`.
- **Instagram** (any public account): Apify `apify/instagram-scraper`. Without Apify, fall back to
  Meta `business_discovery`, which reads only business and creator accounts and needs a Meta token
  (passed as `ENGINE_*` for public lookups, never as the tenant's own account).
- **TikTok**: `clockworks/tiktok-scraper`. **X**: `apidojo/tweet-scraper`. Both need `APIFY_TOKEN`.
  Check the actors' current names and inputs before building, because actors get renamed.
- An Apify call is `POST https://api.apify.com/v2/acts/<owner~name>/run-sync-get-dataset-items?token=…&timeout=180`.
  Drop items that carry an `error`. **Normalizers read several field spellings**, because actors rename
  fields between versions. **An unknown number stays `undefined`, never 0**, because 0 reads as a flop.
  ER = (likes + comments [+ shares]) / views × 100.

**Own identity (never a competitor, never a hit)**: handles from the kit's `platforms[]` (handle,
username or URL fields, plus `@handle` mentions), the manifest name, the owner's names
(`OWNER_NAMES` in `config.ts`, from the interview), and the tenant's own channel id. Names are squashed to `[a-z0-9]` with a minimum length of 4. `add()` refuses
an own account (400) and a duplicate (409). A brand's own viral post must never become a "competitor
hit". Derive this from the kit; never hardcode a handle.

**Concurrency**: a per-tenant promise-chain mutex on `globalThis` plus atomic writes. **Network work
happens OUTSIDE the lock**, into detached copies. The commit re-reads the file inside the lock and
merges by id, so an account added meanwhile stays and one deleted meanwhile stays deleted. (The tracker
once saved a list it had loaded minutes earlier, while Apify was running, and silently wiped a
competitor added in the meantime.) A failed first fetch still adds the account, with a warning, and
the next track retries it.

**`computeHits(list, days = 45)`**, per competitor that is not own:
- Look at its latest 120 posts. `basis = views` if at least 5 posts have views, else `likes`.
- The multiplier threshold is `settings.competitors.hit_multiplier` (default 2).
- **A settled baseline**: the median of posts **3–90 days old** with value > 0 (fewer than 5 → skip the
  account). Fresh posts are still collecting views; counting them once made a normal reel look like
  500×.
- `MIN_MEDIAN = {views: 100, likes: 10}`. A candidate is within `days`, at least 1 day old, has value ≥
  `MIN_REACH {views: 1000, likes: 50}`, and has a multiplier (value/median) ≥ `hit_multiplier`.
- **The promoted filter** (views basis): ER < 0.25 × the account's median ER (with ≥5 ERs), or views ≥
  50 × followers with ER < 0.5%. A boosted ad on a tiny channel once ranked #1 at several hundred ×,
  and the scout read ad spend as proof that the hook works. Genuine hits measured ≥0.32× the median
  ER; boosted ones 0.001–0.04×.
- Score = min(multiplier, 50) × log10(views + 10). Near-duplicate re-uploads (title or transcript
  Jaccard ≥0.8) count once. **At most 3 hits per competitor** (so one giant account can't hide the rest),
  40 in total.

**`track({force, log})`**: refresh every account older than 20 h (all of them when forced) → commit →
compute and write `competitor-hits.json` → **transcribe the top 8 video hits** not yet transcribed (§10)
→ run `build-covered.mjs` (§11) → return `{competitors, refreshed, hits, transcribed, errors}`.

## 10. Transcripts: competitors are studied from TRANSCRIPTS, never captions

For whole classes of accounts the caption is only a keyword gate ("comment GUIDE") and says nothing
about the video. **An untranscribed video has not been studied.**

- **YouTube captions (free)**: `yt-dlp --write-auto-sub --write-sub --sub-langs "<lang>.*" --skip-download
  --sub-format vtt`. ⚠️ **Ignore the exit code and check for files.** Asking for several languages makes
  yt-dlp exit non-zero when one track 429s, even when the wanted one downloaded. If nothing lands,
  retry with any language. Server-side `timedtext` fetches are blocked (they return 0 bytes), so yt-dlp
  is the reliable path.
- **VTT cleaning**: strip inline timing tags and cue lines, drop the rolling-window duplicates, and
  collapse lines where one is a prefix of the next. Results of 40 chars or fewer → null.
- **Audio (paid fallback)**: `yt-dlp -f bestaudio -x --audio-format mp3 --audio-quality 5` into a temp
  dir (Instagram via `--cookies-from-browser <browser>`), then the transcription API
  (`gpt-4o-transcribe`, `response_format=text`). Refuse files over 25 MB. **Extract audio-only rather
  than trusting a stored media URL**: stored URLs expire, many reels expose no media URL at all, and
  audio-only fixes the 25 MB cap. Errors keep only yt-dlp's first ERROR line.
- **Paid transcription runs only where `settings.competitors.paid_transcription` is true**; otherwise
  a video without captions stays "not transcribed" with a line saying why.
- **Never re-pay for a failing transcription**: record failed PAID attempts in
  `transcribe-attempts.json` and retry after 7 days. The tracker runs before every scan and used to
  re-send the same failing audio each time.
- `POST /api/<t>/transcribe {id, platform, permalink?, force?}` starts a background job keyed
  `<tenant>:<id>`; `GET ?id=` polls or returns the saved transcript.
- `engine/tools/bulk-transcribe.mjs --tenant <id> [--all|--only h1,h2] [--newest N --top N] [--dry-run]`
  drives the **running app's** `/transcribe` endpoint, so there is one implementation. It needs the
  dev server up, which the user starts.

## 11. The precedent index: `research/competitors/covered.json`

`engine/tools/build-covered.mjs --tenant <id>` reads `competitors.json` and `transcripts.json` and writes
`{built_at, policy:{recent_heavy_window_days: <settings.competitors.covered_window_days>,
recent_heavy_min_views: <settings.competitors.heavy_min_views, or null = every precedent in the window counts>},
totals:{transcribed, competitors, recent_heavy}, by_competitor, recent_heavy[] (with a 400-char opening),
entries[] {competitor, handle, is_self, platform, post_id, date, views, comments, er, permalink, caption,
opening (first 900 chars of the transcript)}}`, newest first. **No AI runs here**: the similarity
judgement belongs to the scout, against evidence. `is_self` comes from the own-identity resolver.

The index exists because an idea was once proposed as fresh when a tracked competitor had run it weeks
earlier to hundreds of thousands of views; only a human reading a transcript caught it. Every radar
idea fills `competitor_precedent`, and **"not checked" must never look like "not covered"**. Staleness
is the failure mode: an index nobody rebuilds silently reads as "nobody ever covered anything", so its
age is on the health banner.

## 12. The inspiration view and the post detail window

- Stats per platform. **"What's hitting for them"**: the top hit cards with a multiplier badge,
  platform, views or likes, the first line, and a **"turn into an idea"** button (a competitor-mode run
  on that hit). "Track now" and "ideas from competitors" buttons, with a status line that follows the
  job and then reports the REAL outcome (inserted, or why everything was dropped), never a raw code.
- An Apify-missing notice; "not refreshed" errors; an add-competitor panel (platform tabs + handle);
  "competitors named in your brand kit" with an add-all button; a competitor grid. Avatars and
  thumbnails go through the engine's image proxy, because platform CDN URLs expire or block
  hotlinking.
- ⭐ **Every card in every grid (the brand's own posts AND competitors') opens one shared detail
  window on click.** This is the most-skipped deliverable: a grid you can't open is a screenshot.
  - Pinned at the top: the player (a YouTube `<iframe>`; Instagram `<video controls playsInline
    poster>`; a photo renders the image), the caption, the full publish date **including the year**, a
    link out, and the 3–4 headline numbers, each **compared to that account's own average** (▲/▼ %).
  - Tabs below (not a stacked wall): performance · engagement · comments (n) · transcript.
  - **The transcript tab is where transcription starts**: never transcribed → a button; running → live
    progress that survives closing the window; done → the clean text, copyable. Badge transcribed cards
    in the grid.
  - Hide a metric that genuinely doesn't exist (views on a photo) with a short explanation, instead of
    rendering "—", so a platform limit never reads as a bug.
  - Sorts: newest · most viewed · highest engagement. A competitor's deep history: "load 300 older"
    continues from a stored cursor.

## 13. The brand's own analytics (`analytics` module; the tenant's OWN keys)

These quirks were all verified against the live APIs:
- **Tokens**: Graph Explorer tokens expire in ~2 h. Exchange immediately for a 60-day token
  (`/oauth/access_token?grant_type=fb_exchange_token…`) and validate with `/debug_token`. Surface a dead
  token as an actionable message, never as a silent empty grid.
- **Instagram media list**: `/{ig-user-id}/media?fields=…&limit=100`, paging on `paging.cursors.after`.
  ⚠️ **The paging object has `cursors` only, no `next` key**; code that breaks on `!paging.next` caps
  every account at one page. Stop on no cursor or a short page.
- **Insights**: use the **Graph batch API** (50 sub-requests per POST), never one call per post.
  Reels accept `views, reach, likes, comments, saved, shares, total_interactions, ig_reels_avg_watch_time,
  ig_reels_video_view_total_time` (watch times in ms). Feed media accept `views, reach, likes, comments,
  saved, shares, total_interactions, profile_visits, profile_activity, follows`. Skip non-200
  sub-results (old posts have no insights). ⚠️ **Never let an insights `0` overwrite the real
  `like_count`/`comments_count`**: some posts return 0 in insights while having thousands, and this
  exact bug once zeroed comment counts across a whole account. Cache the results and fetch insights only
  for new posts on refresh.
- **Audience is account-level only.** Per-post audience breakdowns do not exist (`(#100) Incompatible
  breakdowns`). Give audience its own tab, with a line saying these are the whole account's numbers;
  shown inside one post's window, they read as broken.
- **Other accounts via `business_discovery`**: `view_count` is the only view metric; `play_count`,
  `views`, `impressions` and `reach` are silently ignored. `media_count` can undercount.
- **YouTube**: channel → uploads playlist → `videos` in chunks of 50. Comments via `commentThreads`
  (try/catch: they can be disabled). Private analytics (watch time, retention) needs the YouTube
  Analytics API and channel OAuth.
- **Signed IG CDN URLs expire**: on a media error, ask a `/api/<t>/media?id=` route for a fresh URL,
  retry once, then fall back to an "open in Instagram" link.
- A platform with no keys shows its **setup step** (which key goes in which file), never an error.

## 14. The community post (optional; tenants with the `community-post` format)

From the newest NEWS run file (not `comp-*`, not `.raw.json`), take up to 8 verified findings. The
`text` profile (1 turn) writes ONE short post for the owner's community: a stopping first line, 3–6 short
lines, one "try this today", in the brand voice under the CTA rule. GROUNDING: only what the chosen
finding says; no facts from memory; never "I tried / I use"; no link. The output must start with
`FINDING: <n>`. **The engine resolves the finding by number and writes the source line itself**; a
draft that doesn't say which finding it used is not saved. Files: `community/<date>.md` and `.json`
`{drafted_at, run_id, finding}`. `GET /community-post` → `{post, eligible}`; `POST` drafts now.

## 15. API surface (all nodejs, force-dynamic, no-store)

| Route | Method | Purpose |
|---|---|---|
| `/api/<t>/radar` | POST · GET · DELETE | start (returns `{…job, already:true}` if running) · poll · cancel |
| `/api/<t>/radar/health` | GET | §6 |
| `/api/<t>/inspiration` | GET · GET `?id=[&refresh=1\|&more=1]` · POST `{handle, platform, note?}` · DELETE `?id=` | competitors + hits + `suggested` (kit competitors not yet tracked) |
| `/api/<t>/competitors` | GET · POST `{action:"track"}` · POST `{action:"ideas", post_ids?}` | hits + tracker job + the last competitor-study summary |
| `/api/<t>/transcribe` | POST · GET `?id=` | §10 |
| `/api/<t>/analytics` · `/analytics/detail` · `/audience` · `/media` | GET | §13 (serve the stale cache with an `error` field rather than an empty screen) |
| `/api/<t>/community-post` | GET · POST | §14 |

The chat's actions (reference 9) start the same `startScan`, and add or remove competitors by calling
the same `/inspiration` route server-to-server.

## 16. Lessons (beyond the ones inline above)

- **Take the grounding snapshot before the scout runs**, and fail closed on the stamp returned in memory.
- **Fold before matching** (diacritics, letter variants, digits, glued words), or real quotes fail on a
  curly quote.
- **Read the quote from the article body**, not the menu or the newsletter box.
- **A scan that added verified ideas is `done`**, even if the CLI exited non-zero afterwards.
- **WebFetch and WebSearch must be allowed explicitly** under `dontAsk` (reference 3).
- **One prompt function for the app and the cron.**
- **Say the owner's sentence, never the code.**
- **Exclude the brand's own accounts everywhere.**

## Checkpoint

On a test copy tenant with an approved kit (`node engine/tools/new-tenant.mjs zz-test --from <id>`; copy
its `content/analytics/competitor-hits.json` across by hand if you test competitor mode; remove the copy
afterwards):
1. Run a scan: a run file with a `verification` block exists, `ideas.json` grew, `feed.md` gained an
   entry written by the engine. Run it again: the same stories come back **deduplicated**, not inserted.
   Every new radar idea has `grounding.verified_at` and can be approved.
2. **Break it on purpose**: feed `ingestRadarRun` a hand-written run whose ideas lack `_verified_at` →
   `unverified`, and the store is byte-identical. Feed it a run of 6 ideas that all carry one news
   shape (stamped) → rejected **whole**, preserved to `failed/`, the store byte-identical.
3. Feed the verifier an idea citing a social post, one 30 days old, and one whose evidence isn't on the
   page: all three are dropped, each with a reason.
4. Back up the kit, replace it with `{}` (it still exists, so the tenant still reads as approved) and
   run the cron script: that tenant is skipped **before** any scan is spent, a `strategy-unreadable`
   failure is recorded, the health endpoint reports it, and the banner appears. Restore the kit; the
   next successful run clears it.
5. If inspiration is on: add a competitor; adding the brand's own handle is refused; hits appear; a hit's
   detail window opens, plays and transcribes.
6. **Competitor mode**: press "turn into an idea" on one hit. The run id starts with `comp-`, every kept
   idea carries `_verified_at` equal to `verification.checked_at`, the store gains ideas with
   `source.type: "competitor"` and a `grounding.verified_at`, and **Approve works on them**. An idea
   naming a hit that is not in `competitor-hits.json` is dropped with a reason.
