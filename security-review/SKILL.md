---
name: security-review
description: >-
  Run a security review of code changes exactly like Claude Code's
  /security-review command — but in ANY AI coding agent (Claude Code, Cursor,
  Codex, Windsurf, Gemini CLI, Cline…). Reviews the pending branch diff (or a
  specific PR, uncommitted changes, or a whole file/folder) for HIGH-CONFIDENCE,
  actually-exploitable vulnerabilities — SQL/command/template/NoSQL injection,
  path traversal, auth & authorization bypass, privilege escalation, hardcoded
  secrets, weak crypto, insecure deserialization / RCE, XSS, SSRF, and sensitive
  data exposure — then applies a strict two-pass false-positive filter
  (confidence ≥ 0.8) and writes a precise markdown report with file, line,
  severity, exploit scenario, and fix. Optionally fixes each confirmed finding.
  Use when the user says "security review", "/security-review", "audit my
  code/changes for vulnerabilities", "check this for security issues", "is this
  secure", "find vulnerabilities", or before merging/shipping.
---

# security-review — Claude Code's `/security-review`, in any agent

You are a **senior security engineer** doing a focused security review of code changes.
The whole point of this review is **signal, not noise**: report only vulnerabilities you are
**> 80% confident are real and exploitable**. A short report with 2 true bugs beats a long
report with 20 maybes — the second one gets ignored and trains people to distrust the tool.

This skill mirrors the methodology of Anthropic's official `/security-review` command. Follow
the steps below in order. Read the three files in [`reference/`](reference/) — they are not
optional; they hold the full taxonomy, the exact filtering rules, and the report format.

---

## The golden rules (read once, apply always)

1. **High confidence only.** Only flag issues where you can point to a concrete, exploitable
   attack path. If you cannot write a realistic exploit scenario, do not report it.
2. **Only what changed.** Review the **security implications newly introduced** by these
   changes. Do not comment on pre-existing issues in untouched code.
3. **Impact first.** Prioritize things that lead to unauthorized access, data breach, RCE, or
   auth bypass. Skip style, "best-practice" nits, and defense-in-depth wishes.
4. **Two passes, always.** Pass 1 finds candidates; Pass 2 tries to *disprove* each one. Only
   survivors with confidence ≥ 8/10 make the report.
5. **Never fabricate.** Cite real `file:line`. If you are guessing at a line, go read the file.

---

## STEP 1 — Gather exactly what changed

Default scope = **the pending changes on the current branch** (same as the real command).
Run these (use your shell/Bash tool; they are read-only):

```bash
# What's the base branch and current state
git status
git remote show origin | sed -n '/HEAD branch/s/.*: //p'   # usually main / master

# Files changed vs the base branch, and the full diff to review
git diff --name-only origin/HEAD...
git log --no-decorate origin/HEAD...
git diff --merge-base origin/HEAD
```

Other scopes the user may ask for:

- **Uncommitted / staged work** → `git diff` (unstaged) and `git diff --staged`.
- **A specific PR (GitHub)** → `gh pr diff <number>` (or `gh pr checkout <number>` then the diff above).
- **A file / folder / whole codebase** → read those files directly with your file tools; there is
  no "base" to diff against, so review the code as-is (still apply the same rules and filters).
- **No git repo** → ask what to review, or review the paths the user named.

Read the **complete** diff/files before analyzing. Do not review from filenames alone.

---

## STEP 2 — Understand the codebase context first

Before judging the diff, spend a moment mapping the project (use Grep/Glob/Read):

- Which security frameworks / libraries are in use (ORM, template engine, auth lib, validators)?
- What are the **established secure patterns** here (how does existing code parameterize queries,
  escape output, check authz, handle secrets)?
- What is the trust boundary — where does **untrusted input** enter (HTTP handlers, CLI args,
  webhooks, file uploads, message queues) and where does it reach **sinks** (DB, shell, filesystem,
  HTML, deserializers)?

You are looking for **deviations** from the project's own secure patterns and for **new attack
surface** the change introduces.

---

## STEP 3 — Hunt for vulnerabilities (Pass 1)

Open [`reference/vulnerability-taxonomy.md`](reference/vulnerability-taxonomy.md) and check the
changed code against every category. In short, examine:

- **Injection:** SQL, command/OS, template (SSTI), NoSQL, XXE, LDAP/XPath, path traversal.
- **Auth & authorization:** authn bypass, broken access control / IDOR, privilege escalation,
  session & JWT flaws, missing server-side authz on a new endpoint.
- **Crypto & secrets:** hardcoded keys/passwords/tokens, weak/broken algorithms, bad randomness
  for security, missing cert validation, improper key handling.
- **Code execution:** insecure deserialization (pickle/YAML/Java), `eval`/dynamic exec of
  untrusted input, unsafe reflection.
- **Web:** reflected / stored / DOM XSS, SSRF that controls host or protocol, unsafe redirects
  *only if* clearly exploitable.
- **Data exposure:** logging or returning secrets / PII, debug info leaks, over-broad API
  responses.

**Methodology for each candidate — trace the data flow:**

1. Identify the **source** of untrusted input.
2. Follow it to a **sink** (query, command, HTML, file path, deserializer, redirect…).
3. Check what **sanitization/validation/authz** sits between them. If nothing effective does,
   and the sink is dangerous, you likely have a finding.
4. Write the concrete **exploit scenario** (a real payload / request). If you can't, drop it.

Note: a bug that's only reachable from the local network can still be **HIGH** severity.

---

## STEP 4 — Filter false positives (Pass 2 — the part everyone skips)

This is what makes the review trustworthy. Open
[`reference/false-positive-rules.md`](reference/false-positive-rules.md) and run **every** finding
from Step 3 through it. Apply the **HARD EXCLUSIONS** (auto-drop) and the **PRECEDENTS**, then
score confidence.

If your agent supports **sub-agents / parallel tasks**, spawn one per finding to adversarially
re-check it (give each the full false-positive rules). If not, do it yourself, one finding at a
time, honestly trying to **disprove** each.

> Drop any finding scored **below 8/10** confidence. When unsure, cut it.

The most common auto-drops (full list in the reference file): Denial-of-Service / resource
exhaustion, rate-limiting, secrets-at-rest (handled elsewhere), missing hardening / "best
practice" gaps, theoretical race conditions, outdated-dependency findings, memory-safety in
memory-safe languages, findings only in tests or docs, log-spoofing, path-only SSRF, regex
injection/ReDoS, XSS in React/Angular unless using `dangerouslySetInnerHTML` /
`bypassSecurityTrust*`, and missing authz in **client-side** code (the server is responsible).

---

## STEP 5 — Write the report

Output **markdown only** in the exact shape from
[`reference/report-format.md`](reference/report-format.md). Each finding has: title with
`category: file:line`, **Severity**, **Confidence**, **Description**, **Exploit Scenario**, and
**Recommendation** (with a concrete fix / code snippet). Order by severity (HIGH → MEDIUM). Keep
only HIGH and MEDIUM; include a MEDIUM only if it is obvious and concrete.

If there are **no** high-confidence findings, say so plainly:

> ✅ No high-confidence, newly-introduced vulnerabilities found in the reviewed changes.
> (Scope: <what you reviewed>. This is not a guarantee the code is bug-free.)

Do **not** pad the report to look thorough. Empty is a valid, good result.

---

## STEP 6 — (Optional) Fix them, one by one

Only if the user asks to fix (e.g. "fix them", "patch these"):

1. Go finding by finding, **highest severity first**.
2. Make the **smallest correct change** that closes the hole — parameterize the query, escape the
   output, add the server-side authz check, replace the weak primitive, remove the hardcoded
   secret and read it from config/env, etc. Match the project's existing secure pattern.
3. Do **not** refactor unrelated code or change behavior beyond the fix.
4. After each fix, re-read the code path and confirm the exploit scenario no longer works.
5. Summarize what changed per finding. If a fix needs a product decision (e.g. a new secret
   store), flag it instead of guessing.

---

## Running this in different agents

- **Claude Code:** drop this folder in `.claude/skills/security-review/` (it auto-loads by
  description), or copy the workflow into `.claude/commands/security-review.md` to get a
  `/security-review` slash command. Then say `/security-review` or "run a security review".
- **Cursor / Windsurf / Cline:** add this `SKILL.md` to your rules/context (or paste it), then ask
  "run a security review on my changes". The git steps use the built-in terminal.
- **Codex / Gemini CLI / others:** reference this file (e.g. from `AGENTS.md`) or paste it, then
  ask for the review. Everything here is plain instructions + standard `git` — no agent-specific
  features are required (sub-agents just make Step 4 faster).

---

## Non-negotiables (recap)

- Confidence **> 80%** or it doesn't ship. Two-pass filter, drop below 8/10.
- **Never** report: DoS / resource exhaustion, rate-limiting, secrets-at-rest, pure hardening
  gaps, theoretical races, dependency-version issues, findings in tests or docs. (Full list in
  `reference/false-positive-rules.md`.)
- Only review **newly introduced** risk. Cite real `file:line`. Markdown report only.
- It's better to miss a theoretical issue than to flood the report with false positives.
