# Using ship-complete outside Claude Code

The skill is written for Claude Code first, in the open Agent Skills format
(https://agentskills.io), so other agents can load it too. The loop (brief, pick, slice,
prove, verify, proof pack, ledger) is plain instructions plus `git` and Python 3. Only the
automatic enforcement differs per agent.

Facts below were checked against each tool's own documentation on 2026-11-24. Items marked
**(unverified)** could not be confirmed there; check your version.

## Install the skill

```sh
# Claude Code (personal; for one project use .claude/skills/ instead)
npx -y skills add JamalMohafil/claude-skills --skill ship-complete --agent claude-code
# Codex, Cursor, Gemini CLI: same command with --agent codex | cursor | gemini-cli
```

Where each agent looks for skills:

| Agent | Project | Personal |
|---|---|---|
| Claude Code | `.claude/skills/<name>/` | `~/.claude/skills/<name>/` |
| Codex | `.agents/skills/<name>/` (from the working folder up to the repo root) | `~/.agents/skills/<name>/` |
| Cursor | `.agents/skills/` or `.cursor/skills/`; also reads Claude and Codex skill folders (per Cursor's skills docs, seen through search) | `~/.cursor/skills/` |
| Gemini CLI | `.gemini/skills/` or `.agents/skills/` | `~/.gemini/skills/` or `~/.agents/skills/` |

Codex invokes a skill when you mention it (`$ship-complete`, or `/skills`) or on its own when
the task matches the description. Gemini CLI activates a skill through its `activate_skill`
tool after you confirm.

## Install the gate into a project

Run the installer from the project, with the flag for each agent you use:

```sh
python3 <skill folder>/scripts/install.py --codex --cursor --gemini   # any subset
```

What each flag adds, and how that agent's hook works:

| Agent | File the installer merges | Hook event | How a block works | Loop guard |
|---|---|---|---|---|
| Claude Code (always) | `.claude/settings.json` | `Stop`, `SubagentStop` (+ `SessionStart` to record the starting commit and remind the agent of the gate) | JSON `{"decision":"block","reason":...}`; Claude continues with the reason | `stop_hook_active`; Claude Code ends the turn after 8 continuations in a row (resets when Claude calls a tool; `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` raises it); the gate itself lets go after 3 |
| Codex (`--codex`) | `.codex/hooks.json` | `Stop` | same JSON; Codex turns the reason into a new continuation prompt | `stop_hook_active`; the gate lets go after 3 |
| Cursor (`--cursor`) | `.cursor/hooks.json` (`"version": 1`) | `stop`, plus `afterAgentResponse` to save the last message | JSON `{"followup_message": ...}`, auto-submitted as the next user message | `loop_count` in the input; `loop_limit: 3` on the hook (Cursor's default is 5) |
| Gemini CLI (`--gemini`) | `.gemini/settings.json` | `AfterAgent` | JSON `{"decision":"deny","reason":...}`: rejects the response and retries with the reason as a new prompt | `stop_hook_active`; the gate lets go after 3 |

Notes per agent:

- **Codex** loads project hooks only from a trusted project, and skips any new or changed hook
  until you review and trust it with `/hooks`. The installed command resolves the script from
  the git root, as Codex's docs recommend, because Codex may start in a subfolder. Codex also
  has `SubagentStop`; the installer does not add it **(the input fields for Codex subagents were
  not verified)**.
- **Cursor's** `stop` input has no last message, so the installer also adds an
  `afterAgentResponse` hook that saves the reply text for the gate to read. Whether a relative
  `command` path resolves from the project root is **(unverified)**; if the hook does not fire,
  use an absolute path.
- **Gemini CLI** hook timeouts are in milliseconds (default 60000); the installer sets 600000.
  Whether hooks are on by default in your version is **(unverified)**; older docs called them
  experimental. Gemini CLI's docs also say a successor CLI replaced it in June 2026; check
  which one you run before relying on the hook.
- **Any other agent:** no hook, so the gate runs by hand. The installer's `AGENTS.md` section
  tells the agent to run `python3 .ship/stop_gate.py --manual` before claiming done, and to
  paste its output.

None of the non-Claude hooks were tried in the real agent while writing this skill: the input
formats come from the docs above, and the gate reads them defensively (any error allows the
stop).

## Make Claude Code and the others share one instruction file

Codex and many other agents read `AGENTS.md`; Claude Code reads `CLAUDE.md`. Keep `AGENTS.md`
canonical and make `CLAUDE.md` a one-line import:

```markdown
@AGENTS.md
```

Gemini CLI reads `GEMINI.md` by default; to load `AGENTS.md` set
`"context": {"fileName": ["AGENTS.md", "GEMINI.md"]}` in its `settings.json`.

The installer does not touch `CLAUDE.md`. Claude Code doesn't need the `AGENTS.md` section
because its hooks enforce the gate and the SessionStart hook reminds the agent of it.

## The plain-prompt version

For an agent with no skill support, paste this once at the start of the work:

> Build this so I find as few problems as possible when I test it. Work in this order and do
> not skip steps.
>
> 1. **Interview me** about anything unclear, in one batch, then write a one-page brief:
>    problem, outcome, "Done when" lines (behaviour I can see on the real app, in my words),
>    constraints (only what I decided), what can't be done yet, and slices of about an hour.
>    Show it to me and wait for my yes.
> 2. **For anything I will see,** show me 2–3 real rendered samples first and let me pick.
>    My pick is the reference.
> 3. **Say plainly what the stack can't do yet.** Never promise it in a plan or an option.
> 4. **Per slice:** write a check that fails first, then build, then prove it on the running
>    app at phone and desktop sizes, with real integrations (stop before anything that spends
>    money, publishes or messages a customer).
> 5. **Never say done, fixed or ready without proof** in the same message: the command and its
>    real output, or a screenshot path. Say what you did not verify. Never edit or delete a
>    test to make it pass. If `.ship/stop_gate.py` exists, run
>    `python3 .ship/stop_gate.py --manual` and paste its output.
> 6. **Before you hand over,** have a fresh agent (or a new session that never saw this one)
>    check the live app against the brief and my pick, PASS or FAIL per "Done when" line with
>    screenshots, blocking issues only.
> 7. **Give me a one-page proof pack:** each "Done when" line with its verdict and evidence,
>    the commands run, the screenshots, what was not verified, and the decisions you made for
>    me.
> 8. **When I report a bug,** first add a check that fails because of it, show it failing, then
>    fix it and show the same check passing.
