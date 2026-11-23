# Verification: prove it like a user, on the real stack

Read this before Step 5 (proving a slice) and Step 6 (the verifier). It says what counts as
proof, how to run browser journeys, how to test real integrations safely, and how to mark test
data.

Why: in one real build, 31 of 89 owner-found failures (35%) were UI bugs, "claimed done" work
and integrations never connected. More than 12,000 unit tests were green the whole time. Every
one of the 31 would have been caught by a person-like run on the deployed app.

## 1. What counts as proof

A claim is not proof. "Tests pass", "typecheck clean", "works now" and "done" are claims.
Proof is something the human could re-check:

| Claim | Proof |
|---|---|
| tests or typecheck pass | the exact command, its real output tail and exit code, and the commit it ran on |
| the screen works | a screenshot or recording of the live app at the named viewport, after the action |
| an integration works | the real request and response (or the provider's dashboard/log line) from a real call |
| an AI behaviour is right | the eval run: scenarios, k runs, pass counts, and the score against the last accepted run |
| a bug is fixed | the check failing on the old commit and passing on the new one (`bug_ledger.py`) |

Rules that keep proof honest:

- **Run it yourself and read the result.** An agent's "tests pass" is a report, not evidence.
  Write long output to a log file and read back the exit code, the summary and the tail of any
  failure. `proof_pack.py run` does this for you.
- **Prove the committed HEAD, not the dirty tree.** In a shared working tree, other agents'
  half-done edits can make your check pass or fail. Before saying a commit works, run the checks
  in a clean worktree of that commit (see `multi-agent.md`).
- **Passing locally is not passing CI.** A check can fail only there: another runtime, a
  missing variable, a step the local command skips. Wait for CI on the pushed commit.
- **No tests, no "safe".** In code without tests, don't call a change safe or equivalent. Say
  what you actually verified.
- **Never edit, skip or delete a test to make it pass.** If a test is wrong, say so with
  evidence and let the human decide.
- **Say what you did not verify.** Every proof pack has a "Not verified" section. An empty one
  means you checked everything, which is rarely true.

## 2. Browser journeys

A journey is one user goal clicked through end to end on the running app: "a visitor sends a
voice note and sees a transcript", not "the upload endpoint returns 200".

**Every journey:**
- runs at **phone (390×844)** and **desktop (1440×900)** sizes;
- uses **real pointer actions**: hover, click, type, paste, drag, scroll to the end of every
  list and panel. Hover states and scroll limits are where agents miss bugs;
- keeps **scrollbars visible** (never `--hide-scrollbars`) and runs **both text directions** if
  the app supports right-to-left languages. In one build, headless screenshots with hidden
  scrollbars hid a hover menu that closed under the mouse and a misaligned name in a
  right-to-left layout;
- fails on **console errors** and **failed network requests**, not only on missing elements;
- opens every image, video and preview it shows (full screen, play, close). In one build a
  video needed about ten clicks to play and stills could not open full screen;
- checks the **empty state** (no data yet), the **error state** (provider down, bad input) and
  the **slow state** (spinner, progress), because real accounts hit all three;
- screenshots each step that a "Done when" line is about, named
  `<slice>-<step>-<phone|desktop>.png`, into the proof pack.

**Checklist per screen, at both sizes:** nothing overflows its card; bars and overlays are
opaque where they should be; two controls never do the same thing; every control does what its
label says; the last item of every list is reachable; text in the other direction aligns;
touch targets are usable on a phone.

**Tools,** whichever the environment has: Playwright tests (`npx playwright test` with a phone
and a desktop project), a browser MCP server (Playwright or Chrome), or Claude Code's `/run`
and `/verify` skills, which build and run the app and look at the result. A minimal Playwright
config:

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  use: { baseURL: process.env.BASE_URL, screenshot: 'on', trace: 'retain-on-failure' },
  projects: [
    { name: 'phone',   use: { ...devices['iPhone 13'] } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
```

Run journeys against the **deployed** URL with `BASE_URL`, not only against a local dev server.
A local run proves the code; only the deployed run proves the build, the env vars, the
middleware and the integrations.

## 3. Real integrations, safely

Fakes prove your code calls an adapter. Only a real call proves the integration. In one build,
ten features passed on fakes and never worked live: an unconfigured provider, a private file URL
the provider could not fetch, a middleware that redirected uploads, an env var the build
dropped, a worker image missing a library, a stale token.

- **Every integration in a "Done when" line gets at least one real call** after deploy, through
  the real UI where possible.
- **Stop before the irreversible step.** Journeys go up to "ready to publish / pay / send" and
  stop, unless the human approved that exact action. Never spend money, publish or message a
  real customer from a test.
- **Key checks use free calls only:** list, whoami, a balance or quota read.
- **After any credential change, send one real request** (one real message from a test account).
  A swapped token in one build broke a channel for days because nobody sent a message.
- **Fallbacks must be loud.** A silent fallback hides a dead provider. Log it and alert.
- **Built images get booted:** run one real job inside each built container image before
  deploy. Unit tests with fakes will not notice a missing library in the image.

## 4. Test data: mark it by ID, never by name

Real systems get real names, including ones that look like test names. In one build a rule that
hid test chats matched the display *name*: it hid the owner's own chats, then a real customer's
chat the next day.

- Mark test data by **fixed IDs**: an allow-list of test accounts, test sender IDs, test phone
  numbers, or a `test` flag set when the record is created by a test.
- Test records **create no leads, no owner alerts, no notifications and no billing**.
- Clean up by the same IDs. Never delete "anything named test".
- Add a regression test: a real-looking record with a test-like name is NOT hidden.

## 5. Running journeys continuously

One green run before handover is not enough. See `live-ops.md` for running the live journeys
after every deploy and every night, and what rolls back versus what only alerts.

## 6. The verifier's input and output

The verifier (`.claude/agents/verifier.md`, Step 6) gets only:
1. the brief path (its "Done when" lines),
2. the picked sample (path or URL), and
3. the live URL (plus test login details, if any).

It never gets the build conversation; a reviewer who saw the reasoning tends to agree with it.
It returns PASS, FAIL or UNTESTED for each "Done when" line, with a screenshot or command
output for each, and **blocking issues only**: things that break a "Done when" line or would
make the user hit an error. A reviewer asked to find problems will always find something, so
it checks every finding again in the live app before it reports it, and drops what does not
hold up.
