// agent-flags.mjs — the ONE place the agent CLI's confinement flags are built.
//
// COPY TO: engine/app/src/lib/agent-flags.mjs (unchanged; edit only the lines marked EDIT:).
//
// Plain ESM, so engine/tools/verify-tenants.mjs spawns with exactly the flags the app uses: the isolation
// canaries test the real thing, not a copy of it. Written for the `claude` CLI (headless --print mode).
// For another CLI, map every flag explicitly and re-prove isolation with the canaries (reference 3 §10b).
//
// ─────────────────────────────────────────────────────────────────────────────
// MEASURED BEHAVIOUR (re-run the canaries after every CLI upgrade: these semantics have shifted).
//
// • `--tools` REPLACES the tool set, it does not add. Adding `--tools Bash` to a default run left ONLY
//   Bash. So every profile names the full set it needs, and `--tools ""` means no tools.
//
// • `--restricted` CANNOT load a tenant's project skills, even with `--setting-sources project`, and
//   generation depends on the tenant's builder skills. `--bare` refuses subscription (OAuth) auth. So the
//   base is `--setting-sources project`: it loads the tenant's own skills while excluding the operator's
//   user-level ~/.claude skills (which would leak one tenant's skills into all of them).
//
// • ⭐ A SHELL BREAKS ISOLATION ON EVERY RUNG. A file planted at content/probe/export.mjs matched a
//   tenant's own `Bash(node content/**/export.mjs)` allow rule; `node` is an ordinary OS process with the
//   operator's full filesystem access, and from the attacker tenant it read another tenant's canary token.
//   No CLI flag confines a child process. Therefore NO profile gets Bash. The ROUTE scaffolds before the
//   spawn and runs the trusted exporter/renderer after it.
//
// • ⭐ CONFINEMENT IS ENGINE-OWNED AND INLINE. Passing `--settings <tenant>/.claude/settings.json` was
//   self-defeating: that file is re-read on every spawn and the build profile can write inside the tenant.
//   One injected turn could delete the deny rules, or add a hooks.PostToolUse command (a shell string the
//   CLI runs OUTSIDE the --tools gate), and the NEXT spawn would come up unconfined, with a shell. So the
//   rules are serialised INLINE into --settings (args go through spawn as an array with no shell, so no
//   quoting problem). DENY always wins a settings merge: a tenant's own settings can add restrictions but
//   never weaken these.
//
// • ⭐ .claude/ is NOT writable, skills included. A skill's frontmatter can carry `hooks:`,
//   `allowed-tools:` or !`…` lines, which the CLI runs as a SHELL outside --tools. How a tenant's pieces
//   look lives in brand/templates/*.html and brand/*.md, which the skills read.
//
// `--dangerously-skip-permissions` is the opposite of isolation and is never emitted.
// ─────────────────────────────────────────────────────────────────────────────

export const PROFILES = ["text", "build", "scout", "chat", "read"];

/**
 * Tools that publish, schedule, comment or message a real account: they must always ASK, never auto-run.
 * ⭐ Single source of truth: new-tenant.mjs imports it for each tenant's settings.json.
 * EDIT: list EVERY publish/write tool of EVERY MCP server on this machine, under EVERY server name it was
 * ever configured as (a connector added through a web UI and the same server configured locally get
 * different prefixes). The entries below are examples for two common schedulers.
 */
export const PUBLISH_ASK = [
  // a scheduler connected through the claude.ai web UI
  "mcp__claude_ai_Buffer__create_post", "mcp__claude_ai_Buffer__update_post", "mcp__claude_ai_Buffer__edit_post",
  "mcp__claude_ai_Buffer__delete_post", "mcp__claude_ai_Buffer__share_post",
  // the same tools through a locally configured MCP server named "buffer"
  "mcp__buffer__create_post", "mcp__buffer__update_post", "mcp__buffer__edit_post",
  "mcp__buffer__delete_post", "mcp__buffer__share_post",
  // another scheduler
  "mcp__blotato__blotato_create_post", "mcp__blotato__blotato_update_schedule", "mcp__blotato__blotato_delete_schedule",
  "mcp__blotato__blotato_post_comment", "mcp__blotato__blotato_send_message",
];

/**
 * The confinement rules, in deny-wins form. Also written into each tenant's .claude/settings.json by
 * new-tenant.mjs, so the owner's hand-run `claude` in a tenant folder gets the same protection.
 *
 * SYNTAX: `Write(path)` rules are INERT (the CLI warns that only Edit(path) rules are matched by file
 * permission checks). Every write-side rule is spelled `Edit(...)`, which covers the Write tool too,
 * including creating a file that does not exist yet.
 */
export const CONFINEMENT_DENY = [
  "Read(../**)",                       // no reading another tenant, or the engine
  "Edit(../**)",                       // …and no writing there either
  "Edit(brand/strategy.json)",         // human-controlled: AI reads and proposes, never writes
  "Edit(.claude/settings.json)",       // ⭐ cannot re-arm itself with a hook or an allow rule
  "Edit(.claude/settings.local.json)", // ⭐ same, via the local override the CLI also reads
  "Edit(tenant.json)",                 // cannot grant itself modules, formats or engines
  "Read(.env.local)",                  // credentials stay out of the transcript
  "Edit(.env.local)",
];

/**
 * ⭐ Files the ENGINE writes, never a spawned agent. Each has a route that writes it from validated data,
 * so denying the agent breaks nothing.
 *
 * INLINE ONLY: deliberately not in CONFINEMENT_DENY (which new-tenant.mjs writes into each tenant's
 * settings.json). That file governs the OWNER's hand-run `claude`, and the owner must stay able to edit their own
 * CLAUDE.md, skills and idea store there.
 */
export const ENGINE_WRITES_DENY = [
  "Edit(content/ideas.json)",          // ideas-core: validation, dedup, saturation, mutex, atomic write
  "Edit(brand/strategy.draft.json)",   // written by the chat/draft ROUTE from the agent's fenced block
  "Edit(brand/strategy.draft.notes.md)",
  "Edit(brand/strategy.json.prev)",
  "Edit(CLAUDE.md)",                   // the tenant's law is loaded into every prompt: no persistent injection
  "Edit(AGENTS.md)",                   // the same law, for Codex
  "Edit(.claude/**)",                  // skills, agents, commands: a skill's frontmatter can run a shell
  "Edit(content/chats.json)",
  "Edit(content/planning/publishing.json)",
  "Edit(content/planning/scheduled.json)",
  "Edit(content/planning/published.json)",
  "Edit(work/crm/**)",                 // money and clients: only the CRM route writes them
  // The optional owner vault (brain/) is spawned as a pseudo-tenant through these same flags. sources/**
  // is the sync's output, .brain/** its index, inbox/** the owner's raw drops (only the engine moves
  // them). No tenant has these paths, so the rules cost a tenant agent nothing.
  "Edit(sources/**)",
  "Edit(.brain/**)",
  "Edit(inbox/**)",
];

/**
 * The scout reads untrusted pages with WebFetch, so a planted instruction could ask it to fetch the
 * dashboard's own API (http://127.0.0.1:<port>/api/<other-tenant>/strategy): an Origin-less GET from a
 * loopback Host is exactly what the proxy lets through for local tools. Deny-wins rules close that door
 * for the literal loopback names (a DNS name that resolves to 127.0.0.1 arrives with its own Host header,
 * which the proxy already refuses). INLINE ONLY. Hardening beyond the reference build: whether the CLI
 * matches IP literals this way is version-dependent, so canary 6 in verify-tenants.mjs is the proof. If
 * the CLI warns that a rule is invalid, drop that rule and keep the canary.
 */
export const NETWORK_DENY = [
  "WebFetch(domain:localhost)",
  "WebFetch(domain:*.localhost)",
  "WebFetch(domain:127.0.0.1)",
  "WebFetch(domain:0.0.0.0)",
  "WebFetch(domain:[::1])",
];

// ⭐ MEASURED: the deny list ALONE leaves the agent unable to write anything. Under
// `--permission-mode dontAsk`, a write that would normally prompt is DENIED, and nothing grants writes by
// default: the positive-control canary failed, every generation silently broke, and every escape probe
// "passed" vacuously. `Edit(**)` re-grants writing; deny still wins for the paths above.
// ⭐ MEASURED: WebFetch/WebSearch also PROMPT, so under dontAsk they were silently refused and the scout
// "researched" with no internet. Only the scout profile carries them in --tools, so allowing them here
// grants nothing to the other profiles.
const CONFINEMENT_ALLOW = ["Edit(**)", "WebFetch", "WebSearch"];

export function confinementSettings() {
  return {
    permissions: {
      allow: [...CONFINEMENT_ALLOW],
      deny: [...CONFINEMENT_DENY, ...ENGINE_WRITES_DENY, ...NETWORK_DENY],
      ask: [...PUBLISH_ASK],
    },
  };
}

/**
 * ⭐ The ENVIRONMENT a spawned agent (or the exporter/renderer) gets: an ALLOWLIST built from the SERVER
 * env, never the tenant env. The tenant env carries API keys and the tenant's own account tokens; the
 * routes need those, but an agent has no shell and no use for them, and the exporter renders
 * agent-authored HTML. Handing them over only put every secret one hook or one crafted page away from a
 * transcript. A tenant's .env.local can never smuggle a variable in here.
 */
const ENV_KEYS = [
  "PATH", "HOME", "USER", "LOGNAME", "LANG", "TMPDIR", "SHELL", "TERM",
  "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy", "NODE_EXTRA_CA_CERTS",
];
const ENV_PREFIXES = ["LC_"];
const CLAUDE_PREFIXES = ["CLAUDE_", "ANTHROPIC_"];   // the CLI's OWN auth, when the owner authenticates that way

/** `forClaude: false` is the exporter's variant: no CLI auth, plus where Playwright's browsers live. */
export function agentEnv(source = process.env, { forClaude = true } = {}) {
  const prefixes = forClaude ? [...ENV_PREFIXES, ...CLAUDE_PREFIXES] : ENV_PREFIXES;
  const keys = forClaude ? ENV_KEYS : [...ENV_KEYS, "PLAYWRIGHT_BROWSERS_PATH"];
  const out = {};
  for (const [k, v] of Object.entries(source)) {
    if (typeof v !== "string") continue;
    if (keys.includes(k) || prefixes.some((p) => k.startsWith(p))) out[k] = v;
  }
  return out;
}

/**
 * ⭐ The env for a SHELL-CAPABLE helper agent that is not the confined runtime CLI: today the optional
 * Codex image backend (reference 7 §1). It runs its own sandbox, which restricts WRITES to its cwd but
 * can READ the whole filesystem, so it is treated like a shell: no API keys, no account tokens, no Claude
 * auth, a scratch cwd outside the repo, and the prompt passed as quoted data. Only what it needs to find
 * its binary and its own login under HOME (CODEX_HOME when set). verify-tenants.mjs fails any codex
 * spawn that does not use this.
 */
export function shellHelperEnv(source = process.env) {
  const keys = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "TMPDIR", "TERM", "CODEX_HOME",
    "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy", "NODE_EXTRA_CA_CERTS"];
  const out = {};
  for (const [k, v] of Object.entries(source)) {
    if (typeof v !== "string") continue;
    if (keys.includes(k) || k.startsWith("LC_")) out[k] = v;
  }
  return out;
}

/** The file tools every working profile needs. `Skill` makes the tenant's own skills invocable. */
const FILE_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "Skill"];
// Deliberately NO "Bash" anywhere. Removing it is the isolation boundary.
const BUILD_TOOLS = [...FILE_TOOLS];
const SCOUT_TOOLS = [...FILE_TOOLS, "WebFetch", "WebSearch"];
// READ-ONLY: for agents that answer over text they did not write (transcripts, research, chats). A prompt
// line was not enough to keep such an agent from writing: one injected sentence could plant a forged
// note. With no Write/Edit/Skill there is nothing to inject into.
const READ_TOOLS = ["Read", "Glob", "Grep"];

export const GLOB_RULE = "Glob and Grep: ALWAYS pass an explicit `path` (e.g. pattern \"*.md\", path \"memory\"). A Glob without `path` returns \"No files found\" even when the files exist — never conclude a file or folder is missing from a path-less Glob; retry with a path or Read the file directly.";

/** @param {string} profile @param {{ maxTurns: number, stream?: boolean, model?: string | null }} opts */
export function agentArgs(profile, { maxTurns, stream = false, model = null }) {
  if (!PROFILES.includes(profile)) throw new Error(`unknown agent profile "${profile}"`);
  const args = [
    "--print",
    "--setting-sources", "project",   // the tenant's own .claude/ (skills), NOT the operator's user settings
    "--strict-mcp-config",            // no MCP servers unless explicitly given
    "--settings", JSON.stringify(confinementSettings()),   // inline JSON, never a path the agent could edit
    "--permission-mode", "dontAsk",   // anything not allowed is refused, never prompted
    "--max-turns", String(maxTurns),
  ];
  if (stream) args.push("--verbose", "--output-format", "stream-json");
  if (model) args.push("--model", String(model));   // e.g. a lighter model for the cron, the strongest for animations
  // Measured: under the Read(../**) deny, a Glob WITHOUT an explicit path returns "No files found" even
  // when the files exist, and agents then conclude brand/ or memory/ is empty.
  if (profile !== "text") args.push("--append-system-prompt", GLOB_RULE);
  // --tools must come LAST: tests and readers treat every trailing bare word as a tool name.
  if (profile === "text") args.push("--tools", "");
  if (profile === "build") args.push("--tools", ...BUILD_TOOLS);
  if (profile === "scout") args.push("--tools", ...SCOUT_TOOLS);
  if (profile === "chat") args.push("--tools", ...BUILD_TOOLS);   // the assistant's hands: files inside its tenant, no shell
  if (profile === "read") args.push("--tools", ...READ_TOOLS);
  return args;
}
