# Failure catalogue

Real failures from one eight-week build with AI coding agents (an AI web app with a chat
assistant, a customer-reply bot, media generation and publishing). Names, vendors and numbers
that identify the product are removed. Each entry: what happened, the root cause, and the
check or step that would have caught it. Use it to:

- write the brief's "Done when" lines and Constraints (look for your feature's bucket);
- pick the right kind of check when a bug comes in (Step 8 of SKILL.md);
- explain to a user why a step exists.

Contents: [Root causes](#the-five-root-causes) · [A. Taste and requirements](#a-taste-and-requirements-24) ·
[B. Missing abilities](#b-missing-abilities-17) · [C. UI bugs](#c-ui-bugs-20) ·
[D. Claimed done, integrations, regression](#d-claimed-done-integrations-regression-5--5--1) · [E. AI answers](#e-ai-answers-17) ·
[F. How "done" was verified](#f-how-done-was-verified) · [G. Coordination and ops](#g-coordination-and-ops) ·
[H. The human's working preferences](#h-the-humans-working-preferences)

## The five root causes

1. **"Done" was defined by structure, not behaviour.** The definition of done had 10 criteria
   (contracts, persistence, API, jobs, quality gates, docs) and none needed a real run, an AI
   eval or the human's acceptance. → Step 1: "Done when" lines in the user's words.
2. **Verification ran on fakes.** Unit tests, fake adapters and a seeded fake world were green
   while the real account had nothing in it. → Step 5 and `verification.md`: prove on the real
   stack.
3. **The builder graded itself.** "Tests pass" and "done" were accepted as reports. → The stop
   gate demands proof; Step 6 adds a fresh verifier.
4. **Nobody picked before building.** Looks and ideas were built from words, then rejected. →
   Step 2: 2–3 real samples, the human picks.
5. **Bugs became rules, not checks.** Fixes piled "never do X" lines into prompts and notes;
   the same kind of bug came back. → Step 8: a failing check first, kept forever.

## A. Taste and requirements (24)

The largest bucket. No test catches these; only agreeing up front does.

| # | What happened | Root cause | What catches it |
|---|---|---|---|
| A1 | The first five design templates were "not even similar" to their references. | Built from a text description of a look; no side-by-side comparison. | The picked reference goes to the verifier, which compares side by side (Step 2, Step 6). |
| A2 | Four of six "golden" demo videos were rejected. One was called visual pollution; the next fix over-corrected into emptiness. | The human never picked the idea or the look before the pipeline was built; each fix swung to the opposite extreme. | Human picks one of 2–3 rendered samples *before* any pipeline; change one thing per round. |
| A3 | Two dashboard redesigns rejected in a row: "not a real dashboard", then "one of the worst". Too simple, then too busy. | Designed from adjectives, not from real products the human admires. | Samples copied closely from real products the human names; pick before build. |
| A4 | A "simple mode" for end users was called a disaster, then "very bad". | "Simple" was never turned into visible behaviour. | "Done when" lines in the human's words: what the end user sees, and what they never see. |
| A5 | Ads came out in a generic frame instead of the human's chosen looks; he called it hallucination. | A generic default template overrode the human's picks. | The brief's Constraints list the chosen looks and the banned ones; the verifier checks against the pick. |
| A6 | A post template was called catastrophic; a video layout was called terrible. | Shipped to the human with no pick step. | Step 2. |
| A7 | The chat widget handed "I want to talk to an engineer" to the owner in 66 ms. The code followed the spec. | The spec wrote down the wrong behaviour; nobody asked the human how that conversation should go. | Interview on every user-facing behaviour; write the expected conversation as a "Done when" line the human approves. |

## B. Missing abilities (17)

Mostly the assistant saying it could not do something the human assumed it could.

| # | What happened | What catches it |
|---|---|---|
| B1 | Asked to open the site in a side panel, the assistant refused and sent the human to the address. | A jobs list (below) turned into eval scenarios |
| B2 | "I can't add that… add it from the page." | same |
| B3 | "I can't download videos from that site." | same, plus Step 3: say "cannot yet" in the plan |
| B4 | Told to approve an item, it pointed to a page instead of approving. | same |
| B5 | "Animated video" turned out to be photos with transitions ("there's no real animation"). | Step 3: name the gap before building; the sample shows what the engine really makes |
| B6 | No "publish now" button existed. | "Done when" lines cover every action the human expects |

**Root cause:** nobody listed the jobs the human would ask for. The assistant's abilities grew
from the architecture, not from those jobs. **The fix:** once, write a jobs list (every request
the human expects to make, in their words), turn each job into an eval scenario, and state
plainly which jobs cannot be done yet.

## C. UI bugs (20)

| # | What happened |
|---|---|
| C1 | The video player needed about ten clicks to play; videos had no proper aspect ratio. |
| C2 | Carousel arrows went nearly transparent on hover. |
| C3 | Top and bottom bars on phones were half transparent. |
| C4 | A link button overflowed its card on phones. |
| C5 | Chat images and preview stills could not open full screen; one preview still rendered half-drawn. |
| C6 | Two buttons ("Preview" and "Open") did the same thing. |
| C7 | A page showed only a stale checklist and an empty page. |
| C8 | Conversations did not show in the inbox; a pinned progress strip and a "ready" message were missing. |
| C9 | A settings index could not scroll to its last items; it took three fixes over two days. |
| C10 | An open thread showed only the greeting while its list row showed the AI reply. |
| C11 | In the composer, × did not remove a file, a pasted image had no thumbnail, and one paste made duplicate chips. |
| C12 | A hover menu closed under the mouse, and a Latin name sat misaligned in a right-to-left layout. The agents' headless screenshots, taken with scrollbars hidden, hid both. |

**Root cause:** agents checked with unit tests and still screenshots, never with real pointer
moves at phone size. **What catches it:** browser journeys with real pointer actions (hover,
click, paste, scroll to the end), at phone and desktop sizes, with scrollbars visible and both
text directions if the app supports them; then the fresh verifier. See `verification.md`.

## D. Claimed done, integrations, regression (5 + 5 + 1)

Ten features shipped as "done" and never worked on the real stack. D11 is a related
case from the same root cause.

| # | What happened | Root cause | What catches it |
|---|---|---|---|
| D1 | Voice notes showed "this service is not connected" on every note, the same day the feature landed. | No real run after merge; the provider was not configured in production. | A journey on the deployed app sends a real voice note. |
| D2 | Transcription failed on every note: the file URL handed to the provider was a private localhost address it could not fetch, and a privacy option used was enterprise-only. | The real provider was never called with a real file. | A live integration journey; Step 3 checks provider limits before design. |
| D3 | A locale middleware redirected the storage path, so uploaded media never reached the store. | Middleware matcher too broad; only a real upload shows it. | A journey that uploads a file and reads it back. |
| D4 | The build tool's strict env mode silently dropped an env var; an embedded panel was refused in production only. | Env var read at runtime but not declared in the build pipeline. | A lint that fails when code reads an env var the pipeline does not declare; a journey that opens the panel. |
| D5 | The render worker image could not import its browser library, so every render failed in production. Unit tests used fakes; the read-only filesystem blocked a hot fix. | The built image was never booted with a real job. | Boot each built image and run one real job in it before deploy. |
| D6 | An idempotency key returned an old CANCELLED job for a new request, so new images never generated. | Terminal-failed jobs were treated as reusable. | A test: the same request after a cancel or failure creates a new job. |
| D7 | Replies on a messaging channel failed with a permission error after a token swap; nobody had sent a real message since. | No live send after a credential change. | After any credential change, one real message from a test account; a daily key check. |
| D8 | The publishing provider was never connected for the real account (status not_configured, no key). Every publishing feature was "done" and tested on fakes; no post could ever publish. | "Done" accepted on fakes. | "Done when" needs a real run on the real account (stopping before the irreversible step); an integration status check after deploy. |
| D9 | A speech provider's key was broken for a week; voice notes silently fell back to another provider; nothing alerted. | Silent fallback, no key check. | Health and key checks with alerts; every fallback logs and alerts. |
| D10 | A themed carousel came out as plain text cards because the real account had zero confirmed projects. | Built and shown against empty real data. | Journeys run on the real account's data; empty states are designed and named in the brief. |
| D11 | Eight optional injected dependencies were never wired in production, because "the unit specs build the classes by hand". | Tests bypassed the real wiring. | A test that boots the real module graph and asserts each dependency resolves. |

**Also from this bucket:**
- **Regression (1):** a rule that hid test chats matched by display *name*. It hid the owner's
  own chats, and the next day a real customer's. Mark test data by fixed IDs (an allow-list of
  test sender IDs), never by name.
- **Downtime:** deploys caused downtime until a zero-downtime deploy plus a request probe proved
  it (0 failed out of 8,100 requests). See `live-ops.md`.
- **Regressions agents caught first** (the net worked): a background-music fix made every voiced
  video fail its sync check; a duplicate translation key crashed every page.

## E. AI answers (17)

| # | What happened | What catches it |
|---|---|---|
| E1 | A returning customer said hello; the bot asked when they would start their earlier project, injecting facts from an old conversation as current. | Eval: returning contact greets → the reply is a greeting, nothing from the old chat. |
| E2 | "Which one?" was read as a yes. | Eval scenario for ambiguous replies. |
| E3 | It asked the same discovery question twice in 5 of 22 eval chats. | Hard rule "never re-ask what was answered", k of k runs. |
| E4 | A greeting got a formulaic reply that "looks like AI"; another got a demand for project details ("artificial stupidity"). | The human's style rules as hard rules, with his own example replies. |
| E5 | The assistant implied ads were running; none had ever run. | Hard rule: never state a system fact that was not read from the system. |
| E6 | A video put words on screen that the voice never said; invented facts appeared on screen. | Hard rule: on-screen text comes only from the script; no invented facts. |
| E7 | Asked about a plan card, the model rebuilt the carousel and claimed it "wrote every slide's text" without writing one. | Evals check the tool calls and artifacts, not only the reply text. |
| E8 | A pasted reel produced an unrelated animation; asked for the script, it said "there is no text". | Eval from the real transcript. |
| E9 | An English chat got button names in another language. | Hard rule: answer in the user's language. |
| E10 | It promised shapes from a reference reel that the engine could not draw, named the draft after them, and never said what was not made. The preview was a hardcoded sample unrelated to the reference. | Step 3 capability check; a "not applied" list shown to the human; previews come from the real output. |
| E11 | It proposed a daily ad budget with no source, and showed two ad designs before any research. | Plan before create; every number needs a source. |
| E12 | It kept "with a named voice-over" in a plan after the human said "no voice-over". | Eval: a stated constraint survives into the next plan. |
| E13 | It started a heavy video study and a multi-step workflow for a simple image post. | Eval for proportional effort. |
| E14 | It used banned or generic templates instead of the chosen looks. | Hard rule with the banned list. |
| E15 | Prompts grew bloated with stacked "never" patches; a lean rewrite plus an eval was needed. | Failures become eval scenarios, not new prompt lines; prompt changes are gated by the eval. |

The eval came late: the live reply eval had "no recorded result" for weeks; a 22-scenario reply
eval was first used to A/B a lean prompt (448 vs 449 of 451); the assistant eval (27 scenarios)
was built only in week eight, from that day's failures. See `ai-feature-evals.md`.

## F. How "done" was verified

- The definition of done measured structure. An integration needed only "a real adapter… and
  a fake adapter passing the conformance suite". A 40,000-line spec with 43 decision records
  still left taste as the largest bucket: it pinned the architecture, not how the human
  expected the product to behave.
- An audit said every part "runs end to end on fakes" while the real account had 0 ideas, 0
  content items and 0 videos. The full CI lane had never passed, so the deploy workflow could
  not run, and the live end-to-end check had no report.
- On one day 12,275 API unit tests and 3,340 UI tests passed on an in-memory database and fakes.
  Live testers then found blockers: a new item ignored the owner's default template; a
  provider's new API version refused two objects; messages in one language were answered in
  another. Fixing them took three more live rounds.
- The browser tests ran only on manual dispatch, against a seeded fake world, never on push.
- The human raised the bar himself, late: nothing is called "ready" until an end-to-end test of
  real outputs passes independent reviewers. Acceptance runs with judges then reached 24 of 25.
- The human's reports clustered on the days he actually used the product (15, 13, 17 and 26 on
  four days, against 2 in the whole first month). Until agents use the product the way he does,
  the human is the test suite.
- Most early complaints went into scattered notes, not one ledger, so nothing turned them into
  checks. → `bug_ledger.py`.

## G. Coordination and ops

From the coordinator's notes (not counted in the 89). Details in `multi-agent.md` and
`live-ops.md`.

| # | What happened | The rule |
|---|---|---|
| G1 | A plain `git commit` by the coordinator swept another agent's staged files into an unrelated commit. | Pathspec commits only; in shared files stage only your own hunks. |
| G2 | Agents reported "tests pass / typecheck clean for my files" while the committed HEAD had never compiled on its own, because the tree held other agents' half-done edits. Only the server build found out. | Verify the committed HEAD in a clean worktree or CI, not the dirty tree. |
| G3 | A usage limit or a login change stopped 7–10 background agents mid-task. Work survived only because finished pieces were committed and a handoff file existed. | Small commits, a resumable brief per task, a HANDOFF file before any long absence. |
| G4 | A watcher left running from earlier would have extracted an OLD release archive over newer source when its condition finally came true. | Watchers are time-bounded and idempotent, and are stopped when the plan changes. |
| G5 | `pgrep -f name` inside `ssh host '...'` matched its own command line, so a wait loop never ended. | `ps -eo args \| grep "[n]ame"`. |
| G6 | The server firewall rate-limits SSH (about 6 new connections per 30 s); polling loops and parallel agents locked everyone out. | One multiplexed connection (ControlMaster); never poll with fresh connections. |
| G7 | zsh does not word-split unquoted variables, so `ssh $OPTS` broke. | Use arrays. |
| G8 | Agent worktrees made by the agent tool were based on a stale commit. | Create worktrees yourself from the current main. |
| G9 | The coordinator said "not started" about features that were already built; it read file names instead of the live app and the git log. | Check the git log, build notes and the live state before any status claim. |

## H. The human's working preferences

What the owner of that build asked of the process. They are common; check which ones your
user shares during the interview.

- Direct, short answers. Do the fixes instead of listing them. Don't stall with questions
  (ask once, in one batch, at the start).
- The human picks the idea or the look BEFORE a build: a golden sample first, then the pipeline.
- Designs follow the chosen references closely, checked side by side.
- Every task goes to a background agent; the coordinator verifies, deploys and reports.
- No money, publishing or customer-facing action without explicit approval.
