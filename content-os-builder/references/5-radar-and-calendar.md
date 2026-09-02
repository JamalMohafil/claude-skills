# Reference 5 — Radar (trend scout) + interactive calendar

## 5a. Radar — the trend scout

A scout that reads live sources, filters against the brand, and writes ranked, on-brand ideas. Runs **on demand** (a button in the app) and **on a schedule** (daily). The scout needs a web-search capability (the agent's own web tool).

**The scout prompt** = the strategy block + the search task + the output contract. All three come
from files, never from hand-written text in a route:

1. `renderStrategyBlock(readKit(ROOT), "radar")` (reference 7a) — positioning, personas, pillars,
   funnel, associations, proof bank, no-gos, scoring.
2. The task:
   > Do 5–6 web searches for the latest in: `<radar.topics>`. Watch these sources/handles:
   > `<radar.sources + radar.handles>`. Filter HARD to what matters to the personas above; kill
   > anything in the no-gos. Read `ideas.json` first and don't re-propose what's already there.
   > Produce 6–7 ranked ideas.
3. `radarOutputInstructions(runPath)` (reference 7c) — the **JSON contract**, injected verbatim.

**The scout writes JSON, not prose.** `radar/runs/<run_id>.json` is what the system ingests;
`radar/feed.md` is appended after, as the human-readable research log. If the scout can only do one,
it does the JSON. Then `ingestRadarRun()` validates and inserts — a run that fails the contract is
preserved to `radar/failed/` and **cannot touch `ideas.json`**.

> Do not go back to "have the scout write markdown and parse it." Every scan would then need the
> parser to distinguish an idea title from a sub-bullet from a source tag, and the first time the
> model formats slightly differently the Ideas view fills with fragments. Reference 7c exists
> because that was tried.

**On-demand:** `/api/radar` — the background-job pattern (reference 3). A "scan now" button POSTs, polls, and refreshes the ideas list when done. Cancelable. When the child exits, call `ingestRadarRun()` **in-process** and surface the real counts — `3 new · 4 already known · 1 rejected` — not just "done". A radar you can't audit is a radar you stop trusting.

**Scheduled:** cron/launchd run with a **minimal PATH and an arbitrary working directory** — the #1 reason scheduled jobs "silently do nothing". The script MUST `cd` into the project and `export PATH` to include the dirs holding the agent CLI and `node`, or it dies on "command not found" to a log nobody reads. Resolve those dirs at setup with `which <agent-cli>` / `which node`.

`tools/radar-cron.sh` (then `chmod +x` it):
```bash
#!/bin/bash
cd "<abs path to content-os>" || exit 1
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"   # + the dir from `which <agent-cli>`
RUN_ID="$(date +%Y-%m-%d-%H%M)"

# Same renderer as the app — one strategy source, zero drift (reference 7a).
STRATEGY="$(node tools/strategy-block.mjs radar)"
# ⚠️ Check for the FALLBACK MARKER, not for emptiness. renderStrategyBlock never returns
# "" — an unreadable kit returns the fallback TEXT, so `[ -z "$STRATEGY" ]` never fires and
# the scan runs all night against no brand at all. Test both branches before installing.
if [ -z "$STRATEGY" ] || printf '%s' "$STRATEGY" | grep -q "STRATEGY CONTEXT UNAVAILABLE"; then
  echo "$(date)\tfail\tbrand-kit.json unreadable — aborted before spending a scan" >> radar-cron.log
  printf '%s\tfail\tbrand kit unreadable\n' "$(date '+%F %H:%M')" >> radar/health.tsv
  exit 1
fi

{ echo "$STRATEGY"; echo; cat tools/radar-task.md; } \
  | claude --print --verbose --max-turns 45 --dangerously-skip-permissions >> radar-cron.log 2>&1

# Validate + insert. A malformed run is preserved to radar/failed/ and never touches ideas.json.
node tools/radar-ingest.mjs "radar/runs/$RUN_ID.json" >> radar-cron.log 2>&1
```
⚠️ **This guard is load-bearing, and the obvious version of it is wrong.** If `brand-kit.json` is
missing, malformed, or its files get deleted, `renderStrategyBlock` returns the *fallback text* — a
non-empty string. An emptiness check silently passes and the scout spends a full scan producing ideas
grounded in nothing. Grep for the marker. **Verified against a real deployment:** the reference
implementation had exactly this hole and its radar failed 21 consecutive nights before anyone noticed.

Install it:
- **launchd** (macOS): `~/Library/LaunchAgents/<brand>.radar.plist` with `StartCalendarInterval` at the chosen time, `ProgramArguments` = `["/bin/bash","<abs>/tools/radar-cron.sh"]`; `launchctl load` it.
- **cron** (Linux/macOS): `M H * * *  /bin/bash <abs>/tools/radar-cron.sh`.
- **Windows** (Task Scheduler): a `.sh` can't run — write `tools/radar-cron.ps1` (same `cd` + `$env:PATH` + agent invocation) and register a daily task with `schtasks /Create`.
- **none**: skip install; document running the script manually.

Tell the user exactly what was installed and how to remove it. The scheduled run writes a new
`radar/runs/<id>.json`, ingests it into `ideas.json`, and appends to `feed.md` — so the app shows
fresh, already-deduplicated ideas each morning with no parsing anywhere.

**Checkpoint:** run `bash tools/radar-cron.sh` by hand once, then check `radar/runs/` has a JSON file,
`ideas.json` grew, and `radar-cron.log` ends with the ingest summary. Run it a **second** time
immediately: the same stories must come back as `deduplicated`, not `inserted`. If they insert twice,
dedup is broken and the store will be unusable within a week — fix it before installing the schedule.

---

## 5a-bis. ⭐ Radar health — because silent failure is the real bug

**The failure you must design for is not a crashed run. It is a run that fails correctly, logs
correctly, and is never read.** A scheduled job has no user watching it. Every guard above writes to
`radar/failed/` — and a directory nobody opens is not a safety net.

> **This is not hypothetical.** In the reference implementation the scout behaved *perfectly*: the
> brand files went missing, it refused to invent ideas from nothing, it explained exactly what was
> wrong, and it preserved every failure. It then did that **21 nights in a row** while the owner
> believed the radar was running. The ingest was fine. The contract was fine. The missing piece was
> that nothing ever surfaced the failure to a human.

So the radar is not done when it runs. It is done when **a failure is visible without looking for it.**

**Append one line per run to `radar/health.tsv`** — every exit path, including the early aborts:
```
2026-09-02 11:00	ok	4 new · 3 dup · 1 rejected
2026-09-03 11:00	fail	brand kit unreadable
```

**`GET /api/radar/health`** reads that file and returns:
```ts
{ last_run_at, last_status, consecutive_failures, days_since_success, stale: boolean }
```
`stale` = no successful run in more than ~2× the scan interval.

**The Radar view shows a banner, not a log line.** If `consecutive_failures >= 2` or `stale`, render
a loud, dismissible-per-session banner at the top: *"the radar hasn't succeeded in N days — last
error: `<reason>`"*, with a "run it now" button. Put the same indicator on the Home view, because
Radar is the one view a user stops opening when they assume it is working.

Cheap escalations worth offering if the user wants them: a desktop notification from the cron script
after 3 straight failures (`osascript -e 'display notification'` / `notify-send`), or an email.

**Checkpoint:** break it on purpose. Rename `brand-kit.json`, run `bash tools/radar-cron.sh`, and
confirm three things: the script exits **before** spending a scan, `health.tsv` gains a `fail` row,
and the banner appears in the UI. Then restore the file and confirm the banner clears. A health
check you have never seen fire is not a health check.

## 5b. Interactive calendar — Notion-style, JSON-backed

A real month-grid calendar (add / move / edit / delete), not a static markdown doc. Store: `content-os/calendar.json` = `{ "events": [ {id,date,title,pillar,format,platform,status,description,content,source} ] }`.

**API** `/api/calendar` (`runtime="nodejs"`, no-store):
- `GET` → `{events}`.
- `POST {date,title,...}` → assign an id, default the optional fields, append, write.
- `PATCH {id,...}` → merge `{...e, ...body}` for that id, write.
- `DELETE ?id=` → filter out, write.
Generate ids stably (a timestamp+random, or an imported source's own id so re-imports are idempotent).

**UI:** a month grid (prev/next/today, per-day cells). Each event is a pill colored by **pillar**, with a small **status** dot. Click a day → add; click a pill → open the item editor.

**Item editor = a Notion-like page** with clear sections:
- **Title** (large heading input).
- **Properties** (date, format/type, platform, pillar, status) as labeled rows using the theme-aware `.field` styling (never flat gray in light mode).
- **Description** (one line).
- **Content** — a **markdown editor with write/preview toggle** + a small toolbar (H / bold / list / quote / code) that inserts markdown at the cursor; preview renders the markdown. This is the "content like Notion" piece.
Statuses (map to the brand's workflow): planned → drafted → produced → scheduled → published, each with a color.

## 5c. Optional connectors (only if the user has them)
- **Notion import** — if the user keeps a content calendar in Notion: use the Notion connector to read the database (search the data source, fetch each page for its Date + properties + body since query APIs may be plan-gated), map to the calendar schema, and write `calendar.json`. Use the Notion page id as the event id so re-imports update instead of duplicating. One-way (Notion → OS) unless the user asks for write-back.
- **Buffer / Blotato scheduling** — read-only by default (list channels, pull post analytics into a Growth view). Any actual publish/schedule action must require explicit confirmation — never post to a live account automatically.

Connectors are optional add-ons; the OS is fully functional without them.
