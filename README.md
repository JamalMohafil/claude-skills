# Claude Skills — @jamal_mohafil

Skills for Claude (and other AI coding agents) built from real problems I hit while building —
every rule in them is a bug that actually happened and got fixed. Each skill is used daily in my
own work.

## Skills

| Skill | What it does |
|---|---|
| [`security-review`](./security-review/) | Recreates Claude Code's `/security-review` in **any** agent — audits your diff/PR for real, exploitable vulnerabilities (injection, auth bypass, secrets, RCE, XSS…) with a strict two-pass false-positive filter, then optionally fixes them |
| [`agent-starter-kit`](./agent-starter-kit/) | One command installs the essential starter skills + Claude Code plugins/MCPs across 70+ agents |
| [`arabic-design`](./arabic-design/) | Makes AI-generated designs render Arabic correctly — fixes the letter-spacing trap, font fallbacks, clipped diacritics, and RTL/bidi bugs |

*(More coming — follow to hear when a new skill drops.)*

## Install

**One skill, for all your projects (global):**
```bash
mkdir -p ~/.claude/skills/arabic-design
curl -o ~/.claude/skills/arabic-design/SKILL.md \
  https://raw.githubusercontent.com/JamalMohafil/claude-skills/main/arabic-design/SKILL.md
```

**Or with the `skills` CLI (works on Claude Code, Codex, Cursor, and 70+ agents):**
```bash
npx -y skills add JamalMohafil/claude-skills --skill arabic-design --agent claude-code
```

Then just use your agent normally — the skill activates automatically when relevant.

---

**Jamal Mohafil** — I build with AI and document everything in Arabic.
[Instagram @jamal_mohafil](https://instagram.com/jamal_mohafil) · [jamalmohafil.com](https://jamalmohafil.com/links)
