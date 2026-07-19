# agent-starter-kit — the skills and MCPs to start any agent with

Instead of hunting down skills and extensions one by one every time you open a new project,
**one command** installs the essentials that make any agent (Claude Code, Codex, Cursor…) start
out genuinely capable: it can find and install more skills on its own, drive a browser, reason
with guardrails, design clean UI (Arabic included), review its own code, and automate the browser
and GitHub.

One command installs the skills + plugins + MCP servers worth having the moment you open a new
agent.

## Install

```bash
# get the skill (or clone the repo)
npx -y skills add JamalMohafil/claude-skills --skill agent-starter-kit --agent claude-code

# then run the installer from the skill directory:
bash ~/.claude/skills/agent-starter-kit/install.sh
```

Options:

```bash
bash install.sh                 # Claude Code — installs everything
bash install.sh --agent cursor  # Cursor — installs the Tier 1 skills
bash install.sh --agent codex   # Codex  — installs the Tier 1 skills
bash install.sh --agent '*'     # every detected agent
bash install.sh --skills-only   # skip the Claude-Code-only plugins/MCPs
```

The installer is **safe to re-run** — each item installs independently, and anything it can't
install automatically prints the exact manual command to finish it.

## What it installs

**Tier 1 — Skills (work on 70+ agents via `npx skills`):**
find-skills · agent-browser · karpathy-guidelines · ui-ux-pro-max · caveman · **arabic-design** (ours)

**Tier 2 — Plugins / MCPs (Claude Code only):**
frontend-design · superpowers · code-review · playwright (MCP) · github (MCP) · claude-md-management

## Honest scope

- **Tier 1 is genuinely cross-agent** — `npx skills` supports 70+ agents.
- **Tier 2 is Claude Code only.** Codex/Cursor have no "plugin" concept. But two of them
  (`playwright`, `github`) are MCP servers, so you can still add them to Codex/Cursor through that
  agent's own MCP config — the installer tells you so when you pass a non-Claude `--agent`.

---

**Made by [@jamal_mohafil](https://instagram.com/jamal_mohafil)** — I build with AI and document everything in Arabic.
