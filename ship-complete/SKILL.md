---
name: ship-complete
description: >-
  Build and finish a product or feature completely and correctly, so the human finds as few
  problems as possible when they test it. Installs enforcement into the project (a stop-gate
  hook that runs the touched packages' checks and rejects "done" without proof, a skeptical
  verifier subagent, proof packs, a bug ledger), then runs the loop: interview, a brief whose
  "Done when" lines use the user's words, a pick from 2-3 real samples, a plain list of what
  can't be done yet, hour-sized slices proven on the real stack, a fresh verifier, a proof pack,
  and every reported bug turned into a check first. Use whenever the user says "build this
  app/feature end to end", "finish the product", "make it production ready", "ship it", "I keep
  finding bugs", "it says done but it doesn't work", starts a long or multi-agent build, or asks
  in Arabic («خلّص المشروع كامل», «ابنيلي … جاهز», «بدي ياه شغال مية بالمية»), even if they
  never name this skill.
license: MIT
compatibility: Claude Code first (hooks, subagent). Codex, Cursor and Gemini CLI through Agent Skills. The installed gate needs git and Python 3.8+.
metadata:
  author: Jamal Mohafil
  version: "1.0.0"
---

# Ship Complete

No agent builds a large product correctly on the first try; no one has shown one that does.
The realistic goal: the agents catch most problems before the human sees them, so the human's
testing time goes on taste and fit, not broken buttons. Expect fewer bugs, not zero, and more
agent time: a full setup like this can cost over 20 times what a solo agent costs.

One real eight-week build shows where the problems come from. Its owner found 89 failures:

| Share | What failed | The only net that catches it | Step |
|---|---|---|---|
| 46% | taste, misread requirements, missing abilities | agree "done" up front; pick from real samples | 1–3 |
| 35% | UI bugs, "claimed done" work, unconnected integrations | test like a user, in a browser, on the real stack | 5–6 |
| 19% | wrong AI answers | evals built from real failures | AI features |

It had more than 12,000 green unit tests; more of them would have caught almost none of the 89.
45% of its ~2,480 commits were fixes.

**Instructions alone are not enforced.** Agents skip rules, and long rule files make it worse.
So this skill installs enforcement into the project (Step 0) and keeps its own text short. The
reasons and numbers behind every step are in
[references/evidence.md](references/evidence.md); the real failures behind it are in
[references/failure-catalogue.md](references/failure-catalogue.md).

This skill names actions ("dispatch a subagent", "open the browser"), not tools. Use your
platform's equivalents. Outside Claude Code, `${CLAUDE_SKILL_DIR}` means the folder this file
is in; see [references/other-agents.md](references/other-agents.md).

**Scope.** A whole product: one product brief (the jobs list, the overall look), then Steps 4–7
per feature. One feature: the whole loop. A small fix: Steps 5 and 8.

---

## Step 0 · Install the enforcement (once per project)

*Why:* a rule in an instruction file is not guaranteed to be followed; anything that must
happen every time belongs in a hook. The real build had no project hook, and "done" was
accepted as a report.

1. If `.ship/config.json` exists, it is installed; go to Step 1.
2. Show what would change: `python3 "${CLAUDE_SKILL_DIR}/scripts/install.py" --dry-run`. Install
   on the user's yes (a request to set this skill up is that yes). Add `--codex`, `--cursor` or
   `--gemini` for the other agents the team uses.
3. Run the checks once: `python3 .ship/stop_gate.py --manual --all`. They must pass on a clean
   tree and be fast, because every stop pays for them. Fix slow or wrong commands in
   `.ship/config.json` (one entry per package; the deepest folder that holds a changed file
   wins).
4. Ask the user to commit `.ship/`, `docs/ship/`, `.claude/` and `AGENTS.md`, so every agent
   and teammate gets the gate.

What it installs, merging and never clobbering (a re-run changes nothing):

| File | What it does |
|---|---|
| `.claude/settings.json` | `Stop` and `SubagentStop` hooks run the gate; `SessionStart` records the starting commit and reminds the agent of the rules |
| `.ship/stop_gate.py` | When the agent stops: no diff → allow. Otherwise run the checks of the packages the diff touches; block if one fails; block if the last message claims done or fixed with no command output, screenshot or proof pack in it |
| `.ship/config.json` | Detected check commands per package, limits, skip lists; edit freely |
| `.claude/agents/verifier.md` | The skeptical verifier for Step 6 |
| `docs/ship/` | Brief template, proof template, `briefs/`, `proof/`, the bug ledger |
| `.ship/proof_pack.py`, `.ship/bug_ledger.py` | Helpers for Steps 7 and 8 |
| `AGENTS.md` section | Other agents run the same gate by hand |

The gate cannot trap an agent: it honours `stop_hook_active`, lets go after 3 blocks in a row
with a warning to the human (Claude Code itself ends the turn after 8 continuations), skips
read-only subagents and Claude Code's internal ones, and allows the stop on any internal error.
Starting the agent with `SHIP_GATE=off` in its environment turns it off. It is a floor, not the proof: it can't tell whether
the behaviour is right, and its proof check is a pattern match an agent could game. The
verifier (Step 6) is the real check.

## Step 1 · Interview, then write the brief

*Why:* 24 of the 89 failures were taste or requirements misread. A 40,000-line spec pinned
the architecture, not the owner's taste; its definition of done had 10 structural criteria and
none needed a real run or the owner's acceptance. Acceptance has to be written as behaviour a
person can check.

1. Read what the conversation already settled. Ask everything still open **in one batch**,
   using the question bank in [references/brief-template.md](references/brief-template.md).
   Then stop asking; record anything you had to assume as a decision, with its cost if wrong.
2. Copy the template to `docs/ship/briefs/<slug>.md` and fill it:
   - **Done when:** one visible behaviour per line, on the real app, in the user's words. "A
     customer who says hello gets a greeting back" passes; "endpoint implemented" and "looks
     modern" don't.
   - **Constraints:** only what the user decided, stated as a requirement. Approvals needed for
     money, publishing or customer-facing actions go here.
   - **None identified** in any empty section. Never pad a section to look complete.
3. For an AI feature, write the **jobs list**: every request the user will actually make, in
   their words. Each becomes an eval scenario.
4. Show the brief and wait for the user's yes. That yes, plus the pick in Step 2, is the
   contract the verifier checks.

## Step 2 · Pick from real samples before building anything visible

*Why:* people need criteria to judge outputs, but judging outputs is how they find their
criteria. In the real build the first five templates were "not even similar" to their
references, four of six golden videos were rejected, and two dashboard redesigns in a row were
rejected (too simple, then too busy).

- For any screen, look or piece of content, make **2–3 real rendered samples**: screenshots
  or renders, not descriptions. Base them closely on the references the user named; make them
  different enough to be a real choice.
- Show them side by side and let the user pick. Record the pick (path or URL) and their words
  about it in the brief. Golden sample first, then the pipeline that makes more of it.
- When they reject all of them, ask what exactly is wrong and change one thing per round;
  fixes that swing to the opposite extreme get rejected too.
- The pick is the verifier's reference. The build must match it side by side.

## Step 3 · Capability check: say what can't be done yet

*Why:* 17 of the 89 failures were missing abilities. An assistant promised shapes from a
reference video that the engine could not draw, named the draft after them, and never said
what it left out.

- For each part of the ask, check that the stack, engine, provider and plan can do it today:
  read the provider's limits (enterprise-only options, file size, what URLs it can fetch) and
  make one small real call when that is cheap.
- Write every gap in the brief's **Can't do yet**, with what happens instead, and tell the user
  before you build. Never put a gap in an option, a plan, a sample or a name.

## Step 4 · Slice the work

*Why:* agents do best on well-scoped tasks of about an hour of human work, or a few hundred
lines. Across 33,596 agent pull requests, the unmerged ones were larger and had more failed
checks; each extra failed check cut the odds of merging by about 15%.

- Slices of about an hour, one behaviour each, ordered so each ends with something the user
  can see working on the real stack. Write them in the brief.
- One slice at a time per agent. With several agents, waves of 4–5, and the live journeys green
  before the next wave.

## Step 5 · Per slice: a failing check, then the build, then proof on the real stack

*Why:* 31 of the 89 were UI bugs, "claimed done" work and integrations that were never
connected, all with green unit tests. Agents tend to call a feature complete after unit tests
or a `curl` call; testing the way a human user would, in a browser, is what changes the result.

1. **Write the check first and watch it fail**, for the right reason: a browser journey for
   anything visible, a real integration call, an eval scenario for AI behaviour, a unit or
   integration test for logic. Agents have faked the red step, so keep the failing output.
2. **Build** the smallest change that makes it pass. Never edit, skip or delete a test to get
   there; if a test is wrong, say so with evidence.
3. **Prove it on the real stack:** the deployed (or production-like) build, real data, real
   integrations, phone and desktop sizes, real pointer actions, screenshots. Stop before
   anything irreversible (spend, publish, message a customer) unless the user approved it.
   Details: [references/verification.md](references/verification.md).
4. **Record the proof** as you go: `python3 .ship/proof_pack.py run <slug> -- <command>` and
   `... shot <slug> <image>`.
5. **Commit** with a pathspec. In a tree shared with other agents, check the committed HEAD in
   a clean worktree before calling it good ([references/multi-agent.md](references/multi-agent.md)).

When you stop, the gate runs. If it blocks, fix the cause; don't argue with it. If the failure
was there before your change, prove that on the base commit and say so.

## Step 6 · A fresh, skeptical verifier checks the live app

*Why:* agents reliably rate their own work too kindly, and a separate evaluator is far easier
to make skeptical than the builder. In one measured run, a solo agent took 20 minutes and its
central feature did not work; with a browser-driving evaluator it took 6 hours, cost over 20
times as much, and the difference in quality was obvious at once.

- Dispatch the `verifier` subagent (or a new session with `agents/verifier.md` as its
  instructions) with **only** the brief path, the picked sample and the live URL (plus test
  login). Never the build conversation: a reviewer that saw the reasoning tends to agree with it.
- It returns PASS, FAIL or UNTESTED per "Done when" line, with screenshots at both sizes, and
  blocking issues only.
- Any FAIL: fix it (Step 5), then run a **new** verifier. Don't debate a finding in the same
  context; re-check it in the live app and record what you saw.
- In Claude Code, `/code-review` (a fresh subagent reviews the diff) and `/verify` (runs the app
  and looks) are useful extra passes. The verifier is still a model: it can be generous and can
  miss deep paths, which is why each "Done when" line must be specific.

## Step 7 · Hand the human a proof pack

*Why:* a human approving diffs they can't judge is an approval step that checks nothing. The
human should review evidence and the live app instead.

1. `python3 .ship/proof_pack.py new <slug> --brief docs/ship/briefs/<slug>.md --url <live URL>
   --sample <pick>` creates the pack with one row per "Done when" line.
2. Fill verdicts (`verdict <slug> <n> PASS --evidence ...`), paste the verifier's report, and
   write **Not verified**, **Decisions made for the user** (each with its cost if wrong) and
   **Can't do yet** honestly.
3. `python3 .ship/proof_pack.py check <slug>` must say COMPLETE: every row PASS with evidence,
   evidence from the current commit, "Not verified" filled in.
4. Hand over in a few lines: what is live, the pack's path, what to test (taste and fit, on the
   live site, in one sitting) and what was not verified. The journeys already checked the
   buttons.

## Step 8 · Every reported bug becomes a check first

*Why:* 45% of the real build's commits were fixes, and a rule that hid test data broke two days
running. A bug fixed red/green (a check that fails, then the fix) stays covered forever; a
bug fixed by a new rule in a prompt or a notes file comes back.

1. Log it: `python3 .ship/bug_ledger.py add "<what the human saw>" --bucket <bucket>`.
2. Pick the check its bucket needs: a journey (ui, claimed-done), a live integration check
   (integration), an eval scenario (ai, capability), a regression test, or a lint.
3. `bug_ledger.py red <ID> --check "<what it proves>" -- <command>`: the helper refuses a check
   that passes on the unfixed code.
4. Fix, then `bug_ledger.py green <ID> -- <same command>`. Commit the check with the fix.
5. Taste and requirement bugs rarely fit an automated check: update the brief's "Done when"
   line and the picked sample, re-run the verifier, then `close <ID> --reason ...`.
6. AI bugs become eval scenarios, not new "never" lines in the prompt.

Once a month, prune: remove rules and checks that no longer earn their place, and run mutation
testing (or a deliberately broken prompt) on the riskiest flows to prove the checks still bite.

---

## AI features: evals

For anything a model answers or generates. Details:
[references/ai-feature-evals.md](references/ai-feature-evals.md).

- Build 20–50 scenarios from real failures and the jobs list; read and label at least 30 real
  traces yourself first: reading real failures is the most important part of evals.
- **Hard rules pass k of k runs** (k = 3 for customer-facing): no leaked contact data, no
  invented facts or prices, no claims about system state the system didn't report, the user's
  language and style. Use pass^k: an answer right 75% of the time passes all 3 runs only about
  42% of the time.
- **The score must not drop below the last accepted run.** "Everything passes" never happens:
  even an accepted prompt scored 448 of 451.
- Run it on every prompt, tool, model or retrieval change. Check any AI judge against labels the
  human made, once, before it gates anything.

## Many agents at once

Details: [references/multi-agent.md](references/multi-agent.md).

- **Commit only your own changes:** pathspec commits; in shared files stage only your hunks. A
  plain commit once swept another agent's staged files into an unrelated commit.
- **Verify the committed HEAD in a clean worktree,** not the dirty tree. Agents once reported
  "tests pass" while HEAD had never compiled on its own.
- **Make worktrees yourself from the current main;** tool-made ones were once stale.
- **Resumable briefs and a HANDOFF file.** A usage limit stopped 7–10 agents at once; only
  committed work and a handoff file saved it.
- **Watchers are time-bounded, idempotent, and stopped when the plan changes.**
- **The builder never reviews its own work.** Every builder report is a claim the coordinator
  re-checks.

## Deploy and watch the live system

Details: [references/live-ops.md](references/live-ops.md).

- Zero-downtime deploys, proven with a request probe during the deploy (in one build: 0 failed
  out of 8,100 requests).
- Live journeys after every deploy and every night; our-code failures roll back, provider
  failures alert.
- Health and key checks with alerts; no silent fallbacks. A broken key once went unnoticed for
  a week.
- Every env var the code reads is declared in the build pipeline, enforced by a check. A
  dropped variable once broke a panel in production only.
- One multiplexed SSH connection when a firewall rate-limits; never poll with fresh connections.

## Honest status

Before you say "done", "live", "broken" or "not started", check `git log`, the build notes or
HANDOFF, and the **live** app. A coordinator once called built features "not started" because
it read file names. Report each item with its evidence:

- **DONE:** every "Done when" line PASS, proof pack COMPLETE.
- **DONE_WITH_RISKS:** works, with named risks.
- **NEEDS_DECISION:** blocked on the user's choice; say which.
- **BLOCKED:** can't proceed; say why and what was tried.

Keep "not done yet" (work the repo could still do) apart from "needs you" (the user's own
steps: a key, an account, a production run). Only the first makes the work partial.

## Working with the human

- Ask once, in one batch, at the start. After that, don't stall: decide, record the decision
  and its cost, and keep going. Do fixes instead of listing them.
- The human picks the idea or the look before anything is built.
- No money, publishing or customer-facing action without their explicit yes for that action.
- Short messages; the proof pack carries the detail.

## What NOT to do

- Don't accept "tests pass" or "done" as proof, from yourself or another agent.
- Don't add more unit tests on fakes and call the feature verified. In a review of 15 agent pull
  requests, none was mergeable as-is, including those that passed the tests.
- Don't grow the rules file. Instruction files grow long, contradictory and stale; turn each
  failure into a check instead.
- Don't let the builder grade its own work, or show the verifier the build conversation.
- Don't edit, skip or delete a test to make it pass.
- Don't build a big feature in one shot, or start the next wave with the live journeys red.
- Don't build anything visible before the user picks a sample.
- Don't promise, plan or name something the stack can't do.
- Don't mark test data by display name; use fixed IDs.
- Don't treat test-first as a ritual; show the check failing on the old code.
- Don't trust how fast it feels. In a controlled trial, experienced developers were 19% slower
  with AI but believed they were 20% faster.
- Don't say "not started" or "done" from file names; check the git log and the live app.
- Don't clobber settings, briefs or ledgers; the installer merges and backs up, and so should
  you.

## Reference files

| File | Read it when |
|---|---|
| [brief-template.md](references/brief-template.md) | Step 1: the brief and the interview questions |
| [verification.md](references/verification.md) | Steps 5–6: what counts as proof, journeys, real integrations, test data |
| [ai-feature-evals.md](references/ai-feature-evals.md) | any feature a model answers or generates |
| [multi-agent.md](references/multi-agent.md) | more than one agent, worktrees, briefs, HANDOFF, watchers |
| [live-ops.md](references/live-ops.md) | deploys, env vars, health and key checks, SSH |
| [failure-catalogue.md](references/failure-catalogue.md) | writing "Done when" lines and picking checks; real failures by bucket |
| [evidence.md](references/evidence.md) | explaining why a step exists, with the numbers |
| [other-agents.md](references/other-agents.md) | Codex, Cursor, Gemini CLI, and a plain-prompt version |
| [agents/verifier.md](agents/verifier.md) | Step 6 |
