# security-review — Claude Code's `/security-review`, in any AI agent

**The problem:** Claude Code ships a brilliant `/security-review` command that audits your changes
for real, exploitable vulnerabilities before you ship — but it only lives inside Claude Code. If
you build in **Cursor, Codex, Windsurf, Gemini CLI, Cline**, or anything else, you don't get it.

**The fix:** this skill recreates that exact review — the same methodology, the same vulnerability
taxonomy, and (the part that actually matters) the same **strict two-pass false-positive filter** —
as a portable skill any agent can run. You get a real security engineer's review of your diff, not
a wall of "maybe" warnings.

Modeled directly on Anthropic's official
[`claude-code-security-review`](https://github.com/anthropics/claude-code-security-review) command
prompt and filtering rules.

## What makes it good (and not noisy)

Most "AI security scans" flood you with theoretical junk until you stop reading them. This one is
built around the opposite goal:

- **Reviews only what changed** — the newly-introduced risk in your branch diff / PR, not the whole
  world.
- **Two passes:** Pass 1 finds candidates, Pass 2 *tries to disprove each one*.
- **Confidence bar ≥ 0.8** — anything speculative is cut.
- **17 hard exclusions + 12 precedents** copied from Anthropic's own rules (no DoS, no rate-limiting,
  no "add more hardening", no dependency-version nags, React/Angular XSS handled correctly, etc.).
- **A precise report:** file, line, severity, a concrete **exploit scenario**, and the **fix**.
- **An empty report is a valid result** — it won't invent findings to look busy.
- Optional: **fix each confirmed finding**, one by one, with minimal targeted patches.

## Install (30 seconds)

**With the `skills` CLI (Claude Code, Codex, Cursor, and 70+ agents) — copies the whole skill:**
```bash
npx -y skills add JamalMohafil/claude-skills --skill security-review --agent claude-code
```

**Or manually — one project (grabs the skill + its reference files):**
```bash
mkdir -p .claude/skills/security-review/reference
base=https://raw.githubusercontent.com/JamalMohafil/claude-skills/main/security-review
curl -o .claude/skills/security-review/SKILL.md $base/SKILL.md
for f in vulnerability-taxonomy false-positive-rules report-format; do
  curl -o .claude/skills/security-review/reference/$f.md $base/reference/$f.md
done
```
*(Use `~/.claude/skills/…` instead of `.claude/skills/…` to install it for all your projects.)*

## Run it

Make some changes, then just say:

> **run a security review on my changes**  (or `/security-review`, or "audit this for vulnerabilities")

The skill gathers your branch diff (`git diff`), studies the codebase, hunts for issues, filters
false positives, and prints the report. To also fix them, say **"fix them"**.

Works on any agent with a terminal — the steps are plain instructions + standard `git`; nothing is
Claude-Code-specific (sub-agents just make the filtering pass faster).

## What it checks

| Class | Examples |
|---|---|
| Injection | SQL, command/OS, template (SSTI), NoSQL, XXE, LDAP/XPath, path traversal |
| Auth & access | authentication bypass, broken access control / IDOR, privilege escalation, session & JWT flaws |
| Crypto & secrets | hardcoded keys/tokens, weak/broken crypto, bad randomness, disabled cert validation |
| Code execution | insecure deserialization (pickle/YAML/…), `eval`/dynamic exec, unsafe reflection |
| Web | reflected/stored/DOM XSS, SSRF (host/protocol control) |
| Data exposure | logging/returning secrets or PII, debug info leaks, over-broad API responses |

## How it maps to the real command

| Anthropic `/security-review` | This skill |
|---|---|
| Gathers the branch diff with `git` | Same `git` commands (Step 1) — plus PR / uncommitted / whole-file scopes |
| 3-phase analysis (context → compare → assess) | Steps 2–3, identical phases |
| Sub-agent false-positive filter, confidence > 0.8 | Step 4 two-pass filter, `reference/false-positive-rules.md`, drop < 8/10 |
| Markdown report: file, line, severity, exploit, fix | `reference/report-format.md` |

---

**Made by [@jamal_mohafil](https://instagram.com/jamal_mohafil)** — I build with AI and document everything in Arabic.
