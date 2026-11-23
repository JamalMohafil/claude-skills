#!/usr/bin/env python3
"""ship-complete stop gate.

Runs when an agent tries to finish its turn: Claude Code (Stop, SubagentStop),
Codex (Stop), Gemini CLI (AfterAgent) and Cursor (stop). It sends the agent
back to work when:

  1. the configured checks (typecheck, tests, ...) fail for the packages the
     current diff touches, or
  2. the agent's last message claims the work is done or fixed but carries no
     proof (no command output, no screenshot, no proof pack).

It is built never to trap an agent:
  * no diff (nothing changed) -> it allows the stop at once;
  * after `max_consecutive_blocks` blocks in a row it lets go and warns the
    human instead (Claude Code also caps stop-hook continuations at 8);
  * any internal error allows the stop.

Python 3.8+ standard library only. Works on macOS and Linux.

Manual use (any agent, CI, a human):
  python3 .ship/stop_gate.py --manual [--all] [--message-file FILE]

Other modes used by the installed hooks:
  --session-start    record the HEAD a session started from (Claude Code SessionStart)
  --record-response  save the agent's last message (Cursor afterAgentResponse)
"""

import fnmatch
import hashlib
import json
import os
import re
import signal
import subprocess
import sys
import time

VERSION = "1.0.0"
CONFIG_REL = os.path.join(".ship", "config.json")
STATE_REL = os.path.join(".ship", ".state")

# Phrases that claim the work is finished. Matched case-insensitively against
# the last message with code blocks removed. A config key of the same name
# replaces the list.
CLAIM_PATTERNS = [
    r"\b(?:is|are|was|were|been|it's|that's|now|all|everything(?:'s)?|i've|i have|we've|we have)\s+"
    r"(?:now\s+|all\s+|fully\s+)?(?:done|fixed|finished|complete|completed|implemented|resolved|"
    r"working|ready|shipped|deployed|live)\b",
    r"(?:^|[\n.!]\s*)(?:done|fixed|finished|complete|completed|all set|shipped|deployed)\s*[.!:]",
    r"\b(?:all\s+)?(?:tests?|checks?|specs?|build|typecheck|type-check|lint)\s+(?:now\s+)?"
    r"(?:pass|passes|passed|passing|green|clean|succeeds?|succeeded)\b",
    r"\bworks\s+(?:now|correctly|fine|as expected|end[- ]to[- ]end)\b",
    r"\bready\s+(?:for|to)\s+(?:review|test|testing|ship|merge|use|go)\b",
    r"\b(?:successfully|fully)\s+(?:implemented|fixed|deployed|completed|built|shipped)\b",
    "\u2705",
    "(?<!\\w)(?:\u062a\u0645|\u062a\u0645\u062a|\u062e\u0644\u0635|\u062e\u0644\u0635\u062a|"
    "\u062e\u0644\u0635\u0646\u0627|\u0627\u0646\u062a\u0647\u0649|\u0627\u0646\u062a\u0647\u064a\u062a|"
    "\u0627\u0643\u062a\u0645\u0644|\u0627\u0643\u062a\u0645\u0644\u062a|\u062c\u0627\u0647\u0632|"
    "\u062c\u0627\u0647\u0632\u0629|\u0627\u0634\u062a\u063a\u0644|\u0627\u0634\u062a\u063a\u0644\u062a|"
    "\u0634\u063a\u0627\u0644|\u0634\u063a\u0627\u0644\u0629|\u0632\u0628\u0637|\u0632\u0628\u0637\u062a|"
    "\u0627\u0646\u062d\u0644|\u0627\u0646\u062d\u0644\u062a|\u062a\u0635\u0644\u062d|"
    "\u062a\u0635\u0644\u062d\u062a)(?!\\w)",
]

# Negated phrases ("not done yet", "isn't fixed") are removed before claims
# are looked for, so an honest "not done" never counts as a claim.
NEGATION_PATTERNS = [
    r"\b(?:not|isn't|aren't|wasn't|weren't|never|no longer)\s+(?:yet\s+|fully\s+|quite\s+)?"
    r"(?:done|fixed|finished|complete|completed|working|ready|passing|green|implemented|resolved|"
    r"deployed|live)\b",
    "(?<!\\w)(?:\u0645\u0627|\u0645\u0648|\u0645\u0634|\u0644\u0645|\u0644\u0627|\u063a\u064a\u0631)\\s+"
    "(?:\\w+\\s+)?(?:\u062e\u0644\u0635|\u062e\u0644\u0635\u062a|\u062c\u0627\u0647\u0632|"
    "\u062c\u0627\u0647\u0632\u0629|\u0627\u0634\u062a\u063a\u0644|\u0627\u0634\u062a\u063a\u0644\u062a|"
    "\u0634\u063a\u0627\u0644|\u0634\u063a\u0627\u0644\u0629|\u0632\u0628\u0637|\u0632\u0628\u0637\u062a|"
    "\u0627\u0646\u062d\u0644|\u0627\u0646\u062d\u0644\u062a|\u064a\u0643\u062a\u0645\u0644|\u062a\u0645)(?!\\w)",
]

# What counts as proof in the message itself.
PROOF_PATTERNS = [
    r"```",  # a fenced block: the command and its output
    r"(?m)^\s*(?:\$|PS>)\s+\S+",  # a shell prompt line
    r"\bexit(?:ed)?(?:\s+with)?(?:\s+(?:code|status))?\s*[:=]?\s*\d+\b",
    r"\b\d+\s+(?:passed|passing|failed|failing)\b",
    r"\b(?:tests?|specs?|suites?)\s*:\s*\d+",
    r"(?-i:\b(?:PASS|FAIL)\b)",  # verdict table, upper case only
    r"\.(?:png|jpe?g|webp|gif|mp4|webm)\b",  # a screenshot or a recording
    r"docs/ship/proof/",  # a proof pack
]

# Honest status: the agent says plainly what it did not verify. A claim next
# to one of these is not blocked (the checks still run).
HONEST_PATTERNS = [
    r"\bnot\s+(?:yet\s+)?(?:verified|tested|checked|run)\b",
    r"\bunverified\b",
    r"\b(?:unable to|could(?:n't| not)|did(?:n't| not)|can(?:'t|not))\s+(?:verify|test|check|run|reproduce)\b",
    r"(?-i:\b(?:BLOCKED|NEEDS_[A-Z_]+|DONE_WITH_[A-Z_]+)\b)",
    "(?:\u0644\u0645 \u0623\u062a\u062d\u0642\u0642|\u0645\u0627 \u062a\u062d\u0642\u0642\u062a|"
    "\u0645\u0627 \u0627\u062a\u062d\u0642\u0642\u062a|\u0645\u0627 \u062c\u0631\u0628\u062a|"
    "\u0644\u0645 \u0623\u062c\u0631\u0628|\u0644\u0645 \u0623\u062e\u062a\u0628\u0631|"
    "\u0645\u0627 \u0627\u062e\u062a\u0628\u0631\u062a|\u063a\u064a\u0631 \u0645\u062a\u062d\u0642\u0642)",
]

DEFAULTS = {
    "enabled": True,
    "packages": [],
    "check_timeout_sec": 300,
    "gate_budget_sec": 540,
    "max_consecutive_blocks": 3,
    "require_proof_for_claims": True,
    "skip_paths": [".ship/", "docs/ship/", ".claude/", ".codex/", ".cursor/", ".gemini/", "*.md"],
    "subagent_skip_types": ["Explore", "Plan", "verifier", "claude-code-guide", "statusline-setup"],
    "session_reminder": True,
    "claim_patterns": CLAIM_PATTERNS,
    "negation_patterns": NEGATION_PATTERNS,
    "proof_patterns": PROOF_PATTERNS,
    "honest_patterns": HONEST_PATTERNS,
}

SESSION_REMINDER = (
    "This project uses the ship-complete gate. When you stop, the checks in .ship/config.json run for "
    "the packages you touched, and a message that says done/fixed/ready must carry proof: the command "
    "and its real output, a screenshot path, or a proof pack in docs/ship/proof/. Say plainly what you "
    "did not verify. A bug the human reports goes in the ledger with a failing check before any fix "
    "(python3 .ship/bug_ledger.py). A fresh 'verifier' subagent checks the live app against the brief."
)


# ---------------------------------------------------------------- utilities

def git(root, *args, **kw):
    """Run git in root. Returns (exit code, stdout as text)."""
    try:
        p = subprocess.run(
            ["git", "-C", root] + list(args),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=kw.get("timeout", 20),
        )
        return p.returncode, p.stdout.decode("utf-8", "replace")
    except (OSError, subprocess.SubprocessError):
        return 1, ""


def toplevel(path):
    if not path or not os.path.isdir(path):
        return None
    code, out = git(path, "rev-parse", "--show-toplevel")
    if code != 0:
        return None
    return out.strip() or None


def head_sha(root):
    code, out = git(root, "rev-parse", "HEAD")
    return out.strip() if code == 0 else None


def safe_key(text):
    return hashlib.sha1((text or "none").encode("utf-8")).hexdigest()[:16]


def read_json(path, default=None):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = "%s.tmp-%d" % (path, os.getpid())
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    os.replace(tmp, path)


def load_config(root):
    raw = read_json(os.path.join(root, CONFIG_REL))
    if not isinstance(raw, dict):
        return None
    cfg = dict(DEFAULTS)
    cfg.update({k: v for k, v in raw.items() if not k.startswith("_")})
    return cfg


def find_root(data):
    """The repository the agent works in. Prefer the hook's cwd (a worktree
    agent reports its worktree), then the project dir Claude Code exports."""
    candidates = []
    if isinstance(data.get("cwd"), str):
        candidates.append(data["cwd"])
    roots = data.get("workspace_roots")
    if isinstance(roots, list) and roots and isinstance(roots[0], str):
        candidates.append(roots[0])
    for env in ("CLAUDE_PROJECT_DIR", "GEMINI_PROJECT_DIR"):
        if os.environ.get(env):
            candidates.append(os.environ[env])
    candidates.append(os.getcwd())
    for cand in candidates:
        top = toplevel(cand)
        if top and os.path.isfile(os.path.join(top, CONFIG_REL)):
            return top
    return None


def detect_format(data):
    event = data.get("hook_event_name", "")
    if "prompt_response" in data or event == "AfterAgent":
        return "gemini"
    if "loop_count" in data or event in ("stop", "subagentStop"):
        return "cursor"
    if "turn_id" in data:
        return "codex"
    return "claude"


def last_message(data, fmt, root):
    if fmt == "gemini":
        return data.get("prompt_response") or ""
    if fmt == "cursor":
        key = safe_key(str(data.get("conversation_id")))
        path = os.path.join(root, STATE_REL, "last-response-%s.txt" % key)
        try:
            with open(path, "r", encoding="utf-8") as fh:
                return fh.read()
        except OSError:
            return ""
    return data.get("last_assistant_message") or ""


# ------------------------------------------------------------ what changed

def parse_status(out):
    """Paths from `git status --porcelain=v1 -z`."""
    files = []
    parts = out.split("\0")
    i = 0
    while i < len(parts):
        entry = parts[i]
        i += 1
        if len(entry) < 4:
            continue
        xy, path = entry[:2], entry[3:]
        files.append(path)
        if "R" in xy or "C" in xy:
            i += 1  # the next field is the original path
    return files


def is_skipped(path, skip):
    for pat in skip:
        if pat.endswith("/"):
            if path.startswith(pat) or path == pat.rstrip("/"):
                return True
        elif "/" not in pat:
            if fnmatch.fnmatch(os.path.basename(path), pat):
                return True
        elif fnmatch.fnmatch(path, pat):
            return True
    return False


def changed_files(root, cfg, baseline=None, base_ref=None):
    files = set()
    code, out = git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all")
    if code == 0:
        files.update(parse_status(out))
    since = base_ref or baseline
    if since:
        head = head_sha(root)
        if head and since != head:
            ok, _ = git(root, "merge-base", "--is-ancestor", since, head)
            if ok == 0:
                code, out = git(root, "diff", "--name-only", "-z", since, head)
                if code == 0:
                    files.update(p for p in out.split("\0") if p)
    skip = cfg.get("skip_paths") or []
    return sorted(f for f in files if f and not is_skipped(f, skip))


def norm_pkg(path):
    p = (path or ".").strip().strip("/")
    return "" if p in ("", ".") else p


def select_entries(cfg, files, run_all=False):
    pkgs = [p for p in (cfg.get("packages") or []) if isinstance(p, dict) and p.get("checks")]
    if run_all:
        return [(p, []) for p in pkgs]
    chosen = {}
    order = []
    for f in files:
        best, best_len = None, -1
        for p in pkgs:
            pp = norm_pkg(p.get("path"))
            if pp == "" or f == pp or f.startswith(pp + "/"):
                if len(pp) > best_len:
                    best, best_len = p, len(pp)
        if best is None:
            continue
        key = norm_pkg(best.get("path"))
        if key not in chosen:
            chosen[key] = (best, [])
            order.append(key)
        chosen[key][1].append(f)
    return [chosen[k] for k in order]


def fingerprint(root, head, files):
    h = hashlib.sha1((head or "nohead").encode())
    for f in sorted(files):
        try:
            st = os.stat(os.path.join(root, f))
            h.update(("%s|%d|%d\n" % (f, st.st_size, st.st_mtime_ns)).encode("utf-8", "replace"))
        except OSError:
            h.update(("%s|deleted\n" % f).encode("utf-8", "replace"))
    return h.hexdigest()


# ------------------------------------------------------------ run checks

def run_command(cmd, cwd, timeout):
    """Run a shell command. Returns (exit code or None on timeout, output, seconds)."""
    env = dict(os.environ)
    env.setdefault("CI", "1")  # test runners run once instead of watching
    env["SHIP_GATE_RUNNING"] = "1"
    start = time.time()
    kwargs = {}
    if hasattr(os, "setsid"):
        kwargs["start_new_session"] = True
    try:
        proc = subprocess.Popen(
            cmd, shell=True, cwd=cwd, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, **kwargs
        )
    except OSError as exc:
        return 127, "could not start: %s" % exc, 0.0
    try:
        out, _ = proc.communicate(timeout=max(1, timeout))
        code = proc.returncode
    except subprocess.TimeoutExpired:
        try:
            if hasattr(os, "killpg"):
                os.killpg(proc.pid, signal.SIGKILL)
            else:
                proc.kill()
        except OSError:
            pass
        out, _ = proc.communicate()
        code = None
    return code, (out or b"").decode("utf-8", "replace"), time.time() - start


def tail(text, lines=40, chars=3000):
    t = "\n".join(text.rstrip().splitlines()[-lines:])
    return t[-chars:]


def run_checks(root, cfg, entries, use_cache=True, echo=None):
    """Returns (failures, warnings). Each failure is a dict with details."""
    state_dir = os.path.join(root, STATE_REL)
    cache_path = os.path.join(state_dir, "passcache.json")
    cache = read_json(cache_path, {}) if use_cache else {}
    if not isinstance(cache, dict):
        cache = {}
    head = head_sha(root)
    budget = float(cfg.get("gate_budget_sec") or 540)
    per_check = float(cfg.get("check_timeout_sec") or 300)
    started = time.time()
    failures, warnings = [], []
    for entry, files in entries:
        path = norm_pkg(entry.get("path"))
        label = path or "."
        fp = fingerprint(root, head, files) if files else None
        if use_cache and fp and cache.get(label) == fp:
            if echo:
                echo("SKIP  %s: unchanged since its last pass" % label)
            continue
        cwd = os.path.join(root, path) if path else root
        entry_ok = True
        for name, cmd in entry["checks"].items():
            if not cmd:
                continue
            left = budget - (time.time() - started)
            if left < 5:
                warnings.append("time budget used up before `%s` in %s ran" % (name, label))
                entry_ok = False
                break
            code, out, secs = run_command(cmd, cwd, min(per_check, left))
            log_dir = os.path.join(state_dir, "logs")
            os.makedirs(log_dir, exist_ok=True)
            log = os.path.join(log_dir, "%s--%s.log" % (re.sub(r"[^A-Za-z0-9._-]+", "_", label), name))
            with open(log, "w", encoding="utf-8") as fh:
                fh.write("$ %s\n(cwd %s)\n\n%s\n[exit %s, %.1fs]\n" % (cmd, cwd, out, code, secs))
            rel_log = os.path.relpath(log, root)
            if code is None:
                warnings.append("`%s` in %s timed out after %ds (log %s)" % (name, label, int(secs), rel_log))
                entry_ok = False
                if echo:
                    echo("TIME  %s: %s (%.0fs)" % (label, name, secs))
                break
            if code != 0:
                failures.append({"name": name, "path": label, "code": code, "cmd": cmd,
                                 "tail": tail(out), "log": rel_log})
                entry_ok = False
                if echo:
                    echo("FAIL  %s: %s (exit %d, %.1fs)" % (label, name, code, secs))
                break
            if echo:
                echo("PASS  %s: %s (%.1fs)" % (label, name, secs))
        if entry_ok and fp:
            cache[label] = fp
    if use_cache:
        try:
            write_json(cache_path, cache)
        except OSError:
            pass
    return failures, warnings


# ------------------------------------------------------------ claims

def compile_all(patterns):
    out = []
    for p in patterns or []:
        try:
            out.append(re.compile(p, re.IGNORECASE | re.MULTILINE))
        except re.error:
            pass
    return out


def strip_code(text):
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    return re.sub(r"`[^`\n]*`", " ", text)


def claim_without_proof(message, cfg):
    """Returns the claim snippet when the message claims done without proof."""
    if not message or not cfg.get("require_proof_for_claims", True):
        return None
    prose = strip_code(message)
    for rx in compile_all(cfg.get("negation_patterns")):
        prose = rx.sub(" ", prose)
    claim = None
    for rx in compile_all(cfg.get("claim_patterns")):
        m = rx.search(prose)
        if m:
            claim = m.group(0).strip(" \n.!:")
            break
    if not claim:
        return None
    for rx in compile_all(cfg.get("proof_patterns")):
        if rx.search(message):
            return None
    for rx in compile_all(cfg.get("honest_patterns")):
        if rx.search(message):
            return None
    return claim[:80]


# ------------------------------------------------------------ messages

def failure_reason(failures, warnings):
    f = failures[0]
    lines = [
        "ship-complete gate: `%s` failed in %s (exit %d)." % (f["name"], f["path"], f["code"]),
        "$ %s" % f["cmd"],
        "```",
        f["tail"] or "(no output)",
        "```",
        "Full log: %s" % f["log"],
    ]
    if len(failures) > 1:
        lines.append("Also failing: " + ", ".join("`%s` in %s" % (x["name"], x["path"]) for x in failures[1:]))
    lines.append(
        "Fix the cause, then stop again. If this failure was there before your change, prove it "
        "(run the same command on the base commit) and say so. Never edit, skip or delete a test "
        "to make it pass.")
    if warnings:
        lines.append("Note: " + "; ".join(warnings))
    return "\n".join(lines)


def claim_reason(claim):
    return (
        "ship-complete gate: your last message claims the work is finished (\"%s\") but shows no "
        "proof. Before you stop, add the evidence: the command you ran and its real output in a code "
        "block, a screenshot path, or the proof pack in docs/ship/proof/. If you did not verify "
        "something, say \"not verified\" and why. A bare \"tests pass\" or \"done\" is a claim, not "
        "proof." % claim)


def emit_allow(fmt, note=None):
    out = {}
    if note:
        if fmt == "claude":
            out["systemMessage"] = note
        sys.stderr.write(note + "\n")
    sys.stdout.write(json.dumps(out) + "\n")
    sys.exit(0)


def emit_block(fmt, reason):
    if len(reason) > 6000:
        reason = reason[:6000] + "\n[...]"
    if fmt == "cursor":
        out = {"followup_message": reason}
    elif fmt == "gemini":
        out = {"decision": "deny", "reason": reason}
    else:
        out = {"decision": "block", "reason": reason}
    sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")
    sys.exit(0)


# ------------------------------------------------------------ modes

def session_start(data):
    root = find_root(data)
    if not root:
        sys.exit(0)
    cfg = load_config(root) or {}
    head = head_sha(root)
    sid = data.get("session_id")
    if head and sid:
        try:
            path = os.path.join(root, STATE_REL, "baseline-%s.txt" % safe_key(sid))
            if not os.path.exists(path):
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(head)
        except OSError:
            pass
    if cfg.get("enabled", True) and cfg.get("session_reminder", True):
        sys.stdout.write(json.dumps({"hookSpecificOutput": {
            "hookEventName": "SessionStart", "additionalContext": SESSION_REMINDER}}) + "\n")
    sys.exit(0)


def record_response(data):
    roots = data.get("workspace_roots") or []
    root = find_root(data) or (toplevel(roots[0]) if roots else None)
    if root:
        key = safe_key(str(data.get("conversation_id")))
        path = os.path.join(root, STATE_REL, "last-response-%s.txt" % key)
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(str(data.get("text") or ""))
        except OSError:
            pass
    sys.stdout.write("{}\n")
    sys.exit(0)


def hook(data):
    fmt = detect_format(data)
    if os.environ.get("SHIP_GATE", "").lower() in ("off", "0", "false", "no"):
        emit_allow(fmt)
    if os.environ.get("SHIP_GATE_RUNNING"):
        emit_allow(fmt)  # a check command started an agent: never recurse
    root = find_root(data)
    if not root:
        emit_allow(fmt)
    cfg = load_config(root)
    if not cfg or not cfg.get("enabled", True):
        emit_allow(fmt)

    event = data.get("hook_event_name", "")
    if event in ("SubagentStop", "subagentStop"):
        agent_type = data.get("agent_type") or data.get("subagent_type") or ""
        if fmt == "claude" and not agent_type:
            emit_allow(fmt)  # Claude Code's own internal agents
        if agent_type in (cfg.get("subagent_skip_types") or []):
            emit_allow(fmt)

    sid = str(data.get("session_id") or data.get("conversation_id") or "manual")
    baseline = None
    try:
        with open(os.path.join(root, STATE_REL, "baseline-%s.txt" % safe_key(sid)), "r") as fh:
            baseline = fh.read().strip() or None
    except OSError:
        pass

    files = changed_files(root, cfg, baseline=baseline)
    state_path = os.path.join(root, STATE_REL, "blocks-%s.json" % safe_key(sid + "|" + str(data.get("agent_id") or "main")))
    if not files:
        emit_allow(fmt)

    state = read_json(state_path, {}) or {}
    if fmt == "cursor":
        active = int(data.get("loop_count") or 0) > 0
    else:
        active = bool(data.get("stop_hook_active"))
    count = int(state.get("blocks", 0)) if active else 0
    limit = int(cfg.get("max_consecutive_blocks") or 3)

    if count >= limit:
        try:
            write_json(state_path, {"blocks": 0})
        except OSError:
            pass
        emit_allow(fmt, "ship-complete gate: let the agent stop after %d blocks in a row. The last "
                        "reason still holds: %s Treat this work as NOT done." % (count, state.get("last", "")))

    failures, warnings = run_checks(root, cfg, select_entries(cfg, files))
    reason = None
    if failures:
        reason = failure_reason(failures, warnings)
    else:
        claim = claim_without_proof(last_message(data, fmt, root), cfg)
        if claim:
            reason = claim_reason(claim)

    if reason:
        short = reason.splitlines()[0]
        try:
            write_json(state_path, {"blocks": count + 1, "last": short})
        except OSError:
            pass
        emit_block(fmt, reason)

    try:
        write_json(state_path, {"blocks": 0})
    except OSError:
        pass
    emit_allow(fmt, ("ship-complete gate: " + "; ".join(warnings)) if warnings else None)


def manual(argv):
    import argparse
    ap = argparse.ArgumentParser(prog="stop_gate.py --manual", description="Run the ship gate by hand.")
    ap.add_argument("--manual", action="store_true")
    ap.add_argument("--all", action="store_true", help="run every package's checks, not only touched ones")
    ap.add_argument("--base", help="also count files changed since this git ref (e.g. origin/main)")
    ap.add_argument("--message", help="text of the 'done' message to check for proof")
    ap.add_argument("--message-file", help="file holding the 'done' message to check for proof")
    ap.add_argument("--no-cache", action="store_true", help="re-run checks even if unchanged since a pass")
    args = ap.parse_args(argv)
    root = toplevel(os.getcwd())
    if not root or not os.path.isfile(os.path.join(root, CONFIG_REL)):
        print("ship gate: no %s found in this repository. Install it first." % CONFIG_REL)
        return 2
    cfg = load_config(root)
    files = changed_files(root, cfg, base_ref=args.base)
    if not files and not args.all:
        print("ship gate: nothing changed (git status is clean%s). Use --all to run every check."
              % (" and nothing since " + args.base if args.base else ""))
        print("GATE: PASS")
        return 0
    entries = select_entries(cfg, files, run_all=args.all)
    if not entries:
        print("ship gate: no configured package covers the changed files. Edit %s." % CONFIG_REL)
    failures, warnings = run_checks(root, cfg, entries, use_cache=not args.no_cache, echo=print)
    message = args.message
    if args.message_file:
        with open(args.message_file, "r", encoding="utf-8") as fh:
            message = fh.read()
    claim = claim_without_proof(message or "", cfg)
    for w in warnings:
        print("WARN  " + w)
    if failures:
        print()
        print(failure_reason(failures, []))
    if claim:
        print()
        print(claim_reason(claim))
    ok = not failures and not claim
    print("GATE: %s" % ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


def main():
    argv = sys.argv[1:]
    if "--version" in argv:
        print(VERSION)
        return
    if "--manual" in argv:
        sys.exit(manual(argv))
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
        if not isinstance(data, dict):
            data = {}
    except (ValueError, OSError):
        data = {}
    try:
        if "--session-start" in argv:
            session_start(data)
        elif "--record-response" in argv:
            record_response(data)
        else:
            hook(data)
    except SystemExit:
        raise
    except Exception as exc:  # never trap the agent on our own bug
        sys.stderr.write("ship-complete gate: internal error, allowing stop: %r\n" % (exc,))
        sys.stdout.write("{}\n")
        sys.exit(0)


if __name__ == "__main__":
    main()
