---
name: agent-starter-kit
description: One-command setup for a new AI coding agent. Installs the essential starter skills (find-skills, agent-browser, karpathy-guidelines, ui-ux-pro-max, caveman, arabic-design) across 70+ agents, plus the core Claude Code plugins/MCPs (frontend-design, superpowers, code-review, playwright, github, claude-md-management). Use when the user is setting up a new project or a fresh agent and asks for "the skills/MCPs I should start with", a "starter pack", or "set up my agent".
---

# Agent Starter Kit

The skills, plugins, and MCP servers worth installing the moment you open a new
agent — bundled into one install. Instead of hunting them down one by one, run the
installer and the agent starts with real capabilities: it can find and install more
skills on demand, drive a browser, reason with guardrails, design clean UI (Arabic
included), review its own code, and automate the browser + GitHub.

## What it installs

**Tier 1 — Skills (work on 70+ agents via `npx skills`: Claude Code, Codex, Cursor, …):**
| Skill | What it gives the agent |
|---|---|
| `find-skills` | Discovers and installs any other skill on demand — the meta-skill |
| `agent-browser` | A real browser the agent controls itself (open, click, fill, verify) |
| `karpathy-guidelines` | Behavior rules: no silent assumptions, minimal solutions, verify before acting |
| `ui-ux-pro-max` | Design-system intelligence — styles, color palettes, font pairings |
| `caveman` | Blunt, no-fluff answers when you want signal over politeness |
| `arabic-design` | Clean Arabic in AI-generated designs (fixes the letter-spacing/RTL traps) |

**Tier 2 — Plugins / MCPs (Claude Code only):**
| Plugin / MCP | What it gives Claude Code |
|---|---|
| `frontend-design` | Anthropic's design guidance for polished, non-generic UI |
| `superpowers` | TDD + subagent orchestration workflow (brainstorm → design → build → review) |
| `code-review` | `/code-review` on any branch/PR — scored, actionable review |
| `playwright` (MCP) | Browser automation & end-to-end testing |
| `github` (MCP) | Read/manage GitHub repos, PRs, and issues from the agent |
| `claude-md-management` | Keeps your `CLAUDE.md` files organized and current |

## How to run it

From the skill directory:

```bash
bash install.sh                 # Claude Code — installs everything
bash install.sh --agent cursor  # Cursor — installs the Tier 1 skills
bash install.sh --agent codex   # Codex  — installs the Tier 1 skills
bash install.sh --agent '*'     # every detected agent
bash install.sh --skills-only   # skip the Claude-Code-only plugins/MCPs
```

The script is **best-effort and safe to re-run**: each item installs independently, and
anything it can't install automatically prints the exact manual command to finish it.

## When invoked as a skill

If an agent loads this skill to set up an environment: run `install.sh` with the right
`--agent` for the current agent. Then confirm what installed and surface any manual
fallback lines the script printed. In Claude Code, remind the user to restart (or run
`/plugin`) so the new plugins load.

## Honest scope note

- **Tier 1 skills are genuinely cross-agent** — `npx skills` targets 70+ agents.
- **Tier 2 is Claude Code only.** Codex/Cursor have no "plugin" equivalent. Their two
  *MCP* items (`playwright`, `github`) can still be added to Codex/Cursor through that
  agent's own MCP config — the script says so when you pass a non-Claude `--agent`.
