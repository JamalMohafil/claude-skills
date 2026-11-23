# ship-complete: make your AI agent actually finish the job

**The problem:** your agent says "done", "all tests pass", "ready to test". You open the app and
the button does nothing on your phone, the integration was never connected, the design isn't
what you meant, and the AI feature answers like a robot. You become the test suite.

**Where that comes from:** one real eight-week build with AI coding agents logged every
failure its owner found himself. There were 89:

- **46%** taste, misread requirements, or abilities nobody checked for. No test catches these;
  only agreeing on "done" up front does, plus picking from real samples before anything is built.
- **35%** UI bugs, "claimed done" work and integrations that were never connected. Browser tests
  on the real deployed app catch these. The project had more than 12,000 green unit tests the
  whole time.ig
- **19%** wrong AI answers. Evals built from real conversations catch these.

**The fix:** instructions alone don't work (agents skip rules, and long rule files make it
worse), so this skill **installs enforcement into your project**, then runs a short loop the
research and the failure history agree on:

0. **Install the gate** once: a stop hook that runs the checks of the packages you touched and
   rejects "done" without proof, a skeptical verifier agent, a proof-pack helper and a bug ledger.
1. **Interview, then a one-page brief** whose "Done when" lines are things you can see, in your words.
2. **Pick from 2–3 real rendered samples** before anything visible is built.
3. **Capability check:** it says plainly what can't be done yet, instead of over-promising.
4. **Hour-sized slices.**
5. **Per slice:** a check that fails first, then the build, then proof on the real stack at phone
   and desktop sizes.
6. **A fresh verifier** that never saw the build gets only the brief, your pick and the live URL.
7. **A one-page proof pack** for you: each "Done when" line with PASS/FAIL and evidence, and what
   was *not* verified.
8. **Every bug you report becomes a check first**, shown failing, then fixed.

Plus rules for AI-feature evals, many agents working at once, deploys and live monitoring, and
honest status reports. Each rule points back to a real failure and to measured results (see
[`references/evidence.md`](references/evidence.md)).

## Install

**Claude Code (all your projects):**
```bash
npx -y skills add JamalMohafil/claude-skills --skill ship-complete --agent claude-code -g
```
Or by hand:
```bash
git clone https://github.com/JamalMohafil/claude-skills.git /tmp/claude-skills
cp -r /tmp/claude-skills/ship-complete ~/.claude/skills/
```
(Use `<project>/.claude/skills/` instead of `~/.claude/skills/` for one project only.)

**Codex, Cursor, Gemini CLI and other Agent Skills agents:**
```bash
npx -y skills add JamalMohafil/claude-skills --skill ship-complete --agent codex   # or cursor, gemini-cli
```
For an agent without skill support, paste the plain-prompt version from
[`references/other-agents.md`](references/other-agents.md).

## Use it

Ask for what you want built, the way you normally would:

> build the booking flow end to end · finish the product · make it production ready ·
> I keep finding bugs in what you ship · «خلّص المشروع كامل»

The first time in a project it offers to install the gate (it shows what will change first).
Then it interviews you once, writes the brief, shows you samples to pick from, and builds.

## What it installs into your project

| Path | What it is |
|---|---|
| `.claude/settings.json` | `SessionStart`, `Stop` and `SubagentStop` hooks, **merged** into your existing settings (a backup goes to `.ship/.state/backups/` first) |
| `.ship/stop_gate.py` | The gate. No diff: allows the stop. Otherwise runs your typecheck and tests for the touched packages only, and blocks with the failing output, or blocks a "done/fixed/ready" message that has no command output, screenshot or proof pack in it |
| `.ship/config.json` | Your check commands per package, detected (Node/pnpm/yarn/bun workspaces, Python, Go, Rust, Make) and editable |
| `.ship/proof_pack.py` | Builds `docs/ship/proof/<slug>/PROOF.md`: verdicts, commands with real output and exit codes, screenshots, "not verified" |
| `.ship/bug_ledger.py` | `docs/ship/LEDGER.md`: refuses a "check" that passes on the unfixed code |
| `.claude/agents/verifier.md` | The skeptical verifier subagent (no edit tools) |
| `docs/ship/` | Brief and proof templates, `briefs/`, `proof/`, the ledger |
| `AGENTS.md` | A marked section so Codex, Cursor and others run the same gate by hand |

Optional: `--codex`, `--cursor`, `--gemini` add the same gate as a hook for those agents (see
[`references/other-agents.md`](references/other-agents.md) for what was and wasn't verified).

```bash
python3 ~/.claude/skills/ship-complete/scripts/install.py --dry-run   # see what changes
python3 ~/.claude/skills/ship-complete/scripts/install.py              # install (re-running changes nothing)
python3 ~/.claude/skills/ship-complete/scripts/install.py --uninstall  # remove the hooks and the AGENTS.md section
```

**It can't trap your agent.** The gate honours `stop_hook_active`, lets the agent stop after 3
blocks in a row (and tells you the work is not done), skips read-only subagents, and allows the
stop if anything inside it goes wrong. Start the agent with `SHIP_GATE=off` to turn it off.

**Give the verifier its own browser (optional).** Claude Code subagents can define an MCP
server inline. To scope Playwright to the verifier only, add this to its frontmatter (pin a
version you trust):

```yaml
mcpServers:
  - playwright:
      type: stdio
      command: npx
      args: ["-y", "@playwright/mcp@<version>"]
```

## Requirements

- git and Python 3.8+ (standard library only), on macOS or Linux. On Windows, use WSL or Git Bash
  with `python3` on the PATH.
- A way to drive a browser for the journeys and the verifier: Playwright, a browser MCP server,
  or Claude Code's `/run` and `/verify`.

## Honest limits

- Expect **fewer** bugs, not zero, and more agent time and quota. A full setup like this can
  cost over 20 times what a solo agent costs, and an evaluator can still miss deeply nested bugs.
- The gate's "proof" check is a pattern match. It stops bare "done" messages; it can't tell
  whether the pasted output is real. The verifier and the proof pack are the real checks.
- Taste can't be automated. The sample pick and the "Done when" lines are how it gets agreed.
- The Codex, Cursor and Gemini CLI hooks follow those tools' documentation but were not run
  inside those tools while writing this skill.

---

**Made by [@jamal_mohafil](https://instagram.com/jamal_mohafil)** — I build with AI and document everything in Arabic.
