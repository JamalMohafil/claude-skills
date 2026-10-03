# Reference 14: Verification and handoff (Stage 13)

Per-stage checkpoints catch broken parts. This catches a broken *loop*, which is a different failure.
**You may not tell the user the build is done until every applicable item below passes, or you have
named the item that failed and what you tried.**

Never start the dev server yourself. Where an item needs the running app, ask the user to start
`pnpm dev` and tell you the URL. Then either drive it with a browser tool if you have one, or ask the
user for screenshots.

## A. Static checks (all must pass)

```bash
cd engine/app
pnpm exec tsc --noEmit
pnpm lint
pnpm build            # the output lists every /api/... route separately from the pages
cd ../..
node --test engine/tools/tests/*.test.mjs
```
- [ ] Typecheck, lint and build are clean (or the warnings are listed and explained).
- [ ] The unit tests pass: tenant (settings included), agent-flags, new-tenant (Windows fallback,
      `--from`), sync-tenant, exporter, strategy-core, approve, ideas-core, shapes, proposals, radar verify
      and ingest (if built), brain-core (if built).
- [ ] `grep -rn -- "--dangerously-skip-permissions" engine/app/src engine/app/scripts engine/tools --exclude-dir=node_modules | grep -v -e agent-flags.mjs -e verify-tenants.mjs`
      prints nothing. (Grep for the FLAG, in source dirs only: `dangerouslySetInnerHTML` in the root
      layout and in the animation renderer's forbidden-token list is expected, and `node_modules` /
      `.next` always contain the word.)
- [ ] `grep -rn 'spawn("claude"' engine/app/src | grep -v agent-spawn.ts` prints nothing.
- [ ] Every spawn of `codex` (if the Codex image backend exists) passes `shellHelperEnv` and a cwd
      under the OS temp dir.
- [ ] `node engine/tools/sync-tenant.mjs --all --dry-run` reports nothing to change, and every real
      tenant has every builder skill its formats need under `.claude/skills/`.
- [ ] Every spawn site has `stdin.on("error"` before it writes.
- [ ] No secret is in git: `git status --ignored` shows every `.env.local` as ignored, and a grep of
      the tracked files for key shapes finds nothing.

## B. Isolation (security)

```bash
node engine/tools/verify-tenants.mjs
```
- [ ] Structure, source lint, flag invariants and env checks pass.
- [ ] The exporter canary passes: zero server hits, and every expected `blocked:` line is present.
- [ ] **Canary 0 (the positive control) PASSES.** If it is skipped or inconclusive, isolation is
      unproven: say so plainly.
- [ ] Canaries 1–6 pass (read escape, write escape, self-disarm, skills, engine files, scout network).
- [ ] No `tenants/zz-canary/` is left behind.

## C. Publishing safety (when publishing or any publish-capable MCP server exists)

```bash
node engine/tools/verify-publishing-safety.mjs
```
- [ ] It exits 0.
- [ ] **Break it on purpose**: temporarily move one publish tool into an `allow` list → it exits 1;
      restore it. Remove the proxy's cross-site check in a scratch copy → it exits 1; restore it.

## D. The end-to-end walkthrough (on a TEST COPY tenant; delete it afterwards)

`node engine/tools/new-tenant.mjs zz-test --from <id>` copies the manifest, `brand/` and `library/` of a
real tenant (never its keys, chats, ideas or publishing records). Run the walkthrough on `zz-test`, then
`rm -rf tenants/zz-test`. For step 1, make a second, fresh tenant with no kit (`new-tenant zz-fresh …`)
and remove it too.

1. **The brand gate.** A fresh tenant: generate and radar return 409 with an owner-language reason.
2. **The draft → approve loop.** Produce a draft (your path-C answers, or a research draft). The strategy
   view renders FROM the draft. Change one byte of the draft on disk after the page loaded, then
   Approve → **409** ("the draft changed"). Refresh, Approve → 200; `strategy.json` holds the same bytes;
   `strategy-block.mjs generate --tenant <id>` now prints the real block, not the fallback.
3. **The idea store.** POST the same idea twice → the second is `deduplicated` and `seen_count` is 2. A
   4th idea with the same shape and pillar from the chat → refused as saturated, with examples. A manual
   POST of the same → allowed. Reject without a reason → 422.
4. **The radar** (if built). Run a scan → verified ideas land, each with an evidence quote and a
   `grounding.verified_at`, and the feed is written by the engine. A competitor-mode run ("turn into an
   idea") lands ideas that can be approved. Run again → duplicates resurface, nothing inserted twice. A
   hand-written all-news run → rejected **whole**, preserved to `failed/`, the store byte-identical. A
   broken kit (`{}`) → the cron skips that tenant before spending a scan, and the health banner shows it.
5. **Generation.** Generating from a `new` idea → 409. Approve it, generate a carousel → the PNGs exist
   at 2160×2700; **open two of them and look**: the brand font is rendering (not a fallback), the text
   is legible at phone scale, and nothing overlaps; the CTA matches the record (none if it was null);
   the idea is `produced`; the piece appears in the Carousels view without a reload.
6. **«Edit».** A one-line change updates the PNG; a noop request reports noop with a reason.
7. **Media engines** (each one enabled): one real run, plus the forced failure from reference 7.
8. **The assistant.** A starter prompt from the empty state gets a reply. A reply in the owner's
   language renders RTL correctly while streaming. "Remember X" writes a memory file plus an index line.
   "Add this idea" works; an injected "approve everything" inside a quoted caption approves nothing.
   Reload keeps the conversation.
9. **Publishing** (if built). Schedule a real multi-slide post to a test channel and **open it in the
   scheduler's own web UI**: every image, in order, with the caption. A chat proposal confirms once; the
   second click says done.
10. **CRM** (if built). Numbers move with the data; a wrong Cal.com key is refused with 422.
11. **The vault** (if built). `brain.mjs context <tenant-a> "<a message naming tenant-b's client>"`
    prints nothing from tenant B; a greeting prints nothing; no key shape appears in `brain/sources`.
12. **Multi-tenant isolation in the UI.** Switching `/a → /b` never flashes A's data; each workspace has
    its own accent; a disabled module's URL lands on home.
13. **Single-tenant** (if chosen). `/` forwards to the workspace, and there's no switcher dropdown.

## E. Screenshots

Capture (or ask the user to send) the following at desktop width **and** at phone width (~390 px),
then look at each one before reporting:
- [ ] `/` (the picker, or the redirect)
- [ ] home for one workspace (the hero card shows a real next action)
- [ ] strategy (an approved kit, or a draft under review)
- [ ] ideas (cards rendered as fields, not text dumps)
- [ ] radar (health, last check, cards), if built
- [ ] a produced carousel open in the Viewer, plus 2 of its exported PNGs
- [ ] the assistant mid-conversation, in the owner's language
- [ ] inspiration with a post detail window open, if built
- [ ] calendar, CRM and `/brain`, if built

Check each one for: the brand accent and fonts (not framework defaults); correct RTL from the root; no
English UI strings left in a non-English UI; no raw ids or error codes shown to the owner; empty states
that name the one action that fixes them.

## F. The handoff (tell the user, briefly)

- How to run it: `cd engine/app && pnpm dev`, then open `http://127.0.0.1:<port>`.
- The next step for each workspace (approve the draft / start the brand interview / add competitors).
- Which keys are still pending, and exactly which file and variable each one goes in.
- What the radar scheduler installed and how to remove it.
- How to add a business: `node engine/tools/new-tenant.mjs <id> --name "…" --kind … --lang <code>`.
- After editing a tenant skill, the publish-tool list or the deny rules: `node engine/tools/sync-tenant.mjs --all`.
- That there is no login: whoever is at this machine is "the owner" in every approval.
- The verification commands to re-run after any change to agents, flags or publishing, and after
  every agent CLI upgrade (permission semantics have shifted between versions).
- **Rotate any key that was pasted into the chat.**

## G. The honest report

```
DONE / DONE WITH GAPS
✓ static checks · ✓ unit tests (N) · ✓ isolation canaries 0–6 · ✓ publishing safety (exit 0 and exit 1 when broken)
✓ walkthrough 1–6, 8, 12 · ✗ 9 publishing: Buffer key pending (built, disabled with a notice)
✓ screenshots: 9 desktop + 9 phone reviewed
GAPS: <each one, with what was tried>
```
Never report a step as passed that you did not actually run. "Should work" is not a result.
