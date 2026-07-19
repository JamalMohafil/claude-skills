#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# agent-starter-kit — one command sets up the essential skills + plugins/MCPs
# every AI coding agent should start with.
#
# Two tiers:
#   TIER 1 — SKILLS: installed via `npx skills` → works on 70+ agents
#            (Claude Code, Codex, Cursor, Gemini CLI, Copilot, Cline, …)
#   TIER 2 — PLUGINS / MCPs: Claude Code only (installed via the `claude` CLI)
#
# Usage:
#   bash install.sh                    # default agent = claude-code, installs everything
#   bash install.sh --agent cursor     # install the cross-agent SKILLS into Cursor
#   bash install.sh --agent codex      # …into Codex
#   bash install.sh --agent '*'        # into every detected agent
#   bash install.sh --skills-only      # skip the Claude-Code-only plugins/MCPs
#
# Requires: node + npx (for Tier 1). Tier 2 also needs the `claude` CLI.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

AGENT="claude-code"
SKILLS_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --agent) AGENT="${2:-claude-code}"; shift 2 ;;
    --skills-only) SKILLS_ONLY=1; shift ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1"; exit 1 ;;
  esac
done

ok=0; fail=0
say()  { printf '\n\033[1;35m▸ %s\033[0m\n' "$1"; }
good() { printf '  \033[1;32m✓ %s\033[0m\n' "$1"; ok=$((ok+1)); }
warn() { printf '  \033[1;33m⚠ %s\033[0m\n' "$1"; fail=$((fail+1)); }

if ! command -v npx >/dev/null 2>&1; then
  echo "✘ npx (Node.js) not found — install Node first: https://nodejs.org"; exit 1
fi

# ── TIER 1 — cross-agent skills ──────────────────────────────────────────────
# format: "owner/repo|skill-name"
SKILLS=(
  "vercel-labs/skills|find-skills"                     # discover + install any skill on demand
  "vercel-labs/agent-browser|agent-browser"            # give the agent a browser it drives itself
  "forrestchang/andrej-karpathy-skills|karpathy-guidelines"  # behavior rules: no silent assumptions
  "nextlevelbuilder/ui-ux-pro-max-skill|ui-ux-pro-max" # design-system intelligence (styles/palettes)
  "juliusbrussee/caveman|caveman"                      # blunt, no-fluff responses
  "JamalMohafil/claude-skills|arabic-design"           # clean Arabic in AI-generated designs (ours)
)

say "TIER 1 — installing skills for: $AGENT"
for entry in "${SKILLS[@]}"; do
  repo="${entry%%|*}"; skill="${entry##*|}"
  if npx -y skills add "$repo" --skill "$skill" --agent "$AGENT" >/dev/null 2>&1; then
    good "$skill"
  else
    warn "$skill — run manually: npx -y skills add $repo --skill $skill --agent $AGENT"
  fi
done

# ── TIER 2 — Claude Code plugins / MCPs ──────────────────────────────────────
if [ "$AGENT" != "claude-code" ] && [ "$AGENT" != '*' ]; then
  say "TIER 2 skipped — plugins/MCPs below are Claude Code only."
  echo "  For $AGENT: playwright & github are MCP servers you can add via that agent's MCP config."
elif [ "$SKILLS_ONLY" -eq 1 ]; then
  say "TIER 2 skipped (--skills-only)."
elif ! command -v claude >/dev/null 2>&1; then
  say "TIER 2 skipped — 'claude' CLI not found."
  echo "  Install these from inside Claude Code with /plugin install <name>."
else
  say "TIER 2 — installing Claude Code plugins/MCPs"
  # official-marketplace plugins (frontend-design, code-review, claude-md-management)
  # + MCP servers packaged as plugins (playwright, github)
  for p in frontend-design code-review claude-md-management playwright github; do
    if claude plugin install "$p@claude-plugins-official" --scope user >/dev/null 2>&1 \
       || claude plugin install "$p" --scope user >/dev/null 2>&1; then
      good "$p"
    else
      warn "$p — run in Claude Code:  /plugin install $p@claude-plugins-official"
    fi
  done
  # superpowers lives in its own community marketplace
  claude plugin marketplace add obra/superpowers >/dev/null 2>&1 || true
  if claude plugin install "superpowers@superpowers" --scope user >/dev/null 2>&1 \
     || claude plugin install "superpowers" --scope user >/dev/null 2>&1; then
    good "superpowers"
  else
    warn "superpowers — run in Claude Code:  /plugin marketplace add obra/superpowers  then  /plugin install superpowers"
  fi
fi

# ── summary ──────────────────────────────────────────────────────────────────
printf '\n\033[1;35m── done: %s installed, %s need a manual step ──\033[0m\n' "$ok" "$fail"
[ "$AGENT" = "claude-code" ] && echo "Restart Claude Code (or run /plugin) so new plugins load."
exit 0
