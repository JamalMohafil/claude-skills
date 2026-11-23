# Why each step exists

Read this when you need to explain *why* a step exists, or when a user pushes back ("just
build it", "the tests pass, isn't that enough?"). Each practice has what is known about it and
what one real build showed.

Tags: **[measured]** means numbers from a study, a trial or a real project. **[practice]**
means how strong engineering teams run agents today. **[judgement]** means experienced
engineers' view, not measured.

"One real build" means an eight-week product build with coding agents: an AI web app with a
chat assistant, a customer-reply bot, media generation and publishing. Its owner reported
**89 failures** himself:

| Share | What failed | The only net that catches it |
|---|---|---|
| **46%** (41) | taste, misunderstood requirements (24) or a missing ability (17) | agreeing "done" up front, plus a pick from 2–3 real samples |
| **35%** (31) | UI bugs (20), "claimed done" (5), integrations never connected (5), regression (1) | browser journeys on the real deployed stack, plus a live check of each integration |
| **19%** (17) | wrong AI answers | evals built from real conversations |

About 45% of its ~2,480 commits were fixes. It had more than 12,000 green unit tests; more of
them would have caught almost none of the 89. (The bucket each failure went into is a
judgement from the retro.)

---

## 0. No agent builds it right the first time

No one has shown an agent building a large product correctly on the first try. When the agent
has nothing to run that comes back pass or fail, the human becomes the test suite, and every
mistake waits until the human happens to notice it [practice].

What works is not better prompting. It is a system built around the agent:
- "done" is agreed before anyone builds;
- the agent must prove its work with checks it cannot skip;
- a separate agent verifies the work;
- every bug becomes a permanent check.

A large industry survey (nearly 5,000 respondents) found the same pattern: AI raises output,
but it lowers stability where testing and feedback are weak [measured].

Even with all that, results are imperfect [measured]:
- An evaluator is still a model, and models lean generous toward model-written work. Later use
  of one strong setup still found bugs in deeply nested features its evaluator had not
  exercised.
- A 25-hour autonomous run produced something real and testable, but not production-ready.

The realistic goal: the agents catch most problems before the human sees them, so the human's
hour of testing goes on taste rather than broken buttons. **Expect fewer bugs, not zero, and
more agent time and quota**: a full setup like this can cost over 20 times what a solo agent costs.

## 1. Agree "done" as visible behaviour, and pick from real samples, before building

**What it is:** every feature starts with a short brief. The agent first interviews the human
about anything unclear. The brief's "done when" lines describe what a person will see happen.
For anything visible (a look, a piece of content, a screen) it comes with 2–3 rendered samples
to choose from.

**What is known:**
- Every plan should produce working behaviour someone can demonstrate, not just code changes,
  and acceptance should be written as behaviour a human can check [practice].
- In strong agent setups, the builder and the evaluator agree what "done" looks like for each
  chunk of work before any code is written [practice].
- A proven prompt: have the agent interview you until it could write the spec, write the spec
  to a file, then build from that spec in a fresh session [practice].
- People need criteria to grade outputs, but grading outputs is how they find their criteria
  ("criteria drift", a 2024 user study) [measured]. That is why picking from samples works
  better than writing more rules.

**One real build:** 41 failures (24 taste or requirements, 17 missing abilities). A
40,000-line spec pinned down the architecture, not the owner's taste. Its definition of done
had 10 criteria, all structural (contracts, persistence, API, jobs, quality gates, docs). None
needed a real run, an AI eval or the owner's approval. Integrations only needed a fake adapter
that passed a conformance suite.

## 2. Test like a user, in a real browser, on the real stack

**What it is:** browser journeys click through the deployed app with real data and live
integrations, on desktop and on phone.

**What is known:**
- Agents tend to mark a feature complete after unit tests or a `curl` call only. Telling the
  agent to test everything the way a human user would, and giving it browser automation,
  improved results dramatically [practice].
- Strong teams boot the app for each git worktree and let the agent drive it through the
  browser's debugging protocol to reproduce bugs and check fixes [practice].
- Maintainers would not merge roughly half of agent pull requests that passed the benchmark's
  tests (296 PRs, 4 maintainers; no CI, and the agents could not revise after feedback)
  [measured].

**One real build:** 31 failures (20 UI bugs, 5 "claimed done", 5 integration gaps, 1
regression). An audit said every part of the product ran "end to end on fakes" while the real
account held zero content and the live reply eval had no recorded result. About 300 browser
tests existed and the deploy required them green, but they ran against fakes, and the
post-deploy smoke test checked only health, containers and routes. Voice notes,
transcription, media upload, an embedded site panel, a messaging channel and a speech provider
all failed only on the real stack. The site panel broke because the build dropped an env var.

## 3. Make checks compulsory, and ask for proof

**What it is:** hooks and CI enforce the checks. When the agent says "done", it must attach the
command output or a screenshot.

**What is known:**
- A rule in an instruction file is not guaranteed to be followed. Anything that has to happen
  every time belongs in a hook [practice]. In Claude Code, a `Stop` hook can send the agent back
  to work, `SubagentStop` does the same for subagents, and both can read the agent's last
  message.
- "All tests pass" on its own says very little; ask for the command and its output [practice].
- Higher change volume without strong automated testing, mature version control and fast
  feedback leads to instability (the same survey) [measured].

**One real build:** the repo had no project settings file, no project hook and no root
instruction file. Eight injected dependencies were never wired up in production because the
unit tests built the classes by hand. A test now guards that one failure, but only after it
shipped.

## 4. A separate, skeptical verifier

**What it is:** a fresh agent that never saw the build conversation checks the running app
against the brief.

**What is known:**
- Agents reliably rate their own work too kindly. Tuning a separate evaluator to be skeptical is
  far easier than making the builder critical of its own work [practice].
- One published experiment [measured, a single run]:
  - Solo agent: 20 minutes, $9, and the central feature of the application did not work.
  - With a browser-driving evaluator: 6 hours, $200. Over 20 times the cost, and the difference
    in quality was obvious at once.
- A diff review in a fresh context that never saw the conversation, and a run of the app that
  looks at the result, catch problems that tests and typechecks miss [practice]. Give the
  reviewer a narrow brief: a reviewer asked to find problems will always find *something*.

**One real build:** this catches "claimed done" failures and most UI bugs. The coordinator once
told the owner that a feature which was already built was "not started", because it read file
names instead of looking at the live app.

## 5. Evals for the AI's own answers, built from real failures

**What it is:** a fixed set of real conversations, each scored pass or fail, re-run after every
change to a prompt, tool or model.

**What is known [practice]:**
- 20–50 simple tasks drawn from real failures is a good start. Regression evals should pass
  nearly 100% of the time.
- For customer-facing agents use pass^k, the chance that all k trials pass: an answer right 75%
  of the time passes all 3 trials only about 42% of the time.
- Error analysis is the most important part of evals. Start by labelling at least 30 real
  traces yourself, pass or fail, and test any AI judge against labels a human made.

**One real build:** 17 failures, plus most of the missing abilities. The assistant eval (27
scenarios) was built only in week eight, from that day's failures. The reply eval (22
scenarios) existed, but even the accepted prompt scored 448 of 451. So a gate that requires
every check to pass would block every deploy. Gate on hard rules plus no drop in score instead.

## 6. Every bug becomes a permanent check

**What it is:** before fixing anything the human reported, the agent turns it into a failing
test, an eval scenario or a lint rule. It shows that the check fails on the old code. The fix
then makes it pass.

**What is known:**
- Whenever an agent makes a mistake, engineer a fix so it can't happen again; every line of a
  good agent instruction file traces back to a real bad behaviour [judgement].
- Issues found in manual testing get fixed red/green: a check that fails, then the fix, so the
  case stays covered by the permanent tests [judgement].
- Custom lints whose error messages tell the agent how to fix the problem work well; so do
  background agent runs that scan for drift and open cleanup changes [practice].
- Agents have been seen skipping or faking the red step [measured, small sample], which is why
  the check must be shown failing on the old code. Mutation testing is now a recommended guard
  against AI-written tests that pass without catching anything [practice].

**One real build:** 45% of the commits were fixes. A rule that hid test chats broke two days
in a row. Example check: a lint that fails when code reads an env var the build does not pass
through.

## 7. Watch the live system

**What it is:** the live app reports its own failures, and agents can read the live logs when
they fix something.

**What is known:** strong teams give agents logs, metrics and traces for each worktree, and
"production-aware" agents are an emerging practice [practice].

**One real build:** a speech provider's key was broken for a week. Voice notes quietly fell
back to another transcriber, and nothing warned anyone.

## 8. Work in small batches

Agents work best on well-scoped tasks of about an hour of human work, or a few hundred lines of
code, and on one feature at a time [practice]. Across 33,596 agent pull requests, the ones that
were not merged were larger and had more failed CI checks; each extra failed check cut the
odds of merging by about 15% [measured, correlation].

**One real build:** about 45 commits a day in waves of 4–5 agents. The fix: end each wave with
the live journeys green before starting the next.

## 9. What NOT to do, and why

- **More unit tests on fakes.** In the real build, 12,275 API unit tests passed and live
  blockers still got through. In a review of 15 agent pull requests, none was mergeable as-is,
  including those that passed the tests [measured].
- **Longer specs or longer rule lists.** One big instruction file fails in predictable ways; a
  file of about 100 lines that acts as a map works better [practice]. Instruction files grow
  long, contradictory and stale, and agents often end up not following all of the
  instructions [measured, small sample].
- **Letting the builder grade itself, or accepting a bare "done".**
- **Letting agents edit or delete tests to make them pass.** Disabling or deleting tests is a
  classic sign the agent is cheating [judgement]. Removing or editing tests to get a pass is
  never acceptable.
- **Approving code diffs you can't judge.** It becomes an approval step that checks nothing.
  Triage by risk, and review the proof pack and the live app instead.
- **Trusting an AI judge you haven't checked.** AI judges show position, length and
  self-preference bias [measured].
- **Building a big feature in one shot.**
- **Treating test-first as a ritual.** One small study saw no clear difference between agent
  test-first and no test-first, and saw agents faking the red step [measured, small sample].
  Ask for proof that a check fails on the old code instead.
- **Trusting how fast it feels.** In a controlled trial in early 2025, experienced developers
  were 19% slower with AI but believed it had sped them up by 20% [measured]. Later data
  suggests developers are likely faster now, but the gap between feeling and measurement is
  the lesson.
