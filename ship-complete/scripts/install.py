#!/usr/bin/env python3
"""Install the ship-complete enforcement into the current project.

Adds, without clobbering anything:
  .ship/stop_gate.py, proof_pack.py, bug_ledger.py   the gate and its helpers
  .ship/config.json                                  check commands per package (detected; edit freely)
  .claude/settings.json                              SessionStart + Stop + SubagentStop hooks, merged
  .claude/agents/verifier.md                         the skeptical verifier subagent
  docs/ship/                                         brief template, proof template, bug ledger
  AGENTS.md                                          a marked section so other agents run the gate by hand
Optional: --codex (.codex/hooks.json), --cursor (.cursor/hooks.json), --gemini (.gemini/settings.json).

Running it twice changes nothing. An existing settings file is backed up to
.ship/.state/backups/ before it is changed; a file that is not valid JSON is
left alone and the install stops.

Usage:
  python3 install.py [--project DIR] [--dry-run] [--codex] [--cursor] [--gemini]
  python3 install.py --uninstall [--project DIR]

Python 3.8+ standard library only.
"""

import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
MARK = ".ship/stop_gate.py"
START = "<!-- ship-complete:start -->"
END = "<!-- ship-complete:end -->"

CLAUDE_CMD = 'python3 "$CLAUDE_PROJECT_DIR/.ship/stop_gate.py"'
GIT_ROOT_CMD = 'python3 "$(git rev-parse --show-toplevel)/.ship/stop_gate.py"'

sys.path.insert(0, HERE)
import stop_gate  # noqa: E402  (same folder; shares the defaults)


class Plan(object):
    def __init__(self, root, dry):
        self.root, self.dry, self.log = root, dry, []
        self.stamp = time.strftime("%Y%m%d-%H%M%S")

    def rel(self, path):
        return os.path.relpath(path, self.root)

    def note(self, status, path, extra=""):
        self.log.append((status, self.rel(path) if os.path.isabs(path) else path, extra))

    def backup(self, path):
        if self.dry or not os.path.exists(path):
            return
        dest = os.path.join(self.root, ".ship", ".state", "backups", "%s.%s" % (os.path.basename(path), self.stamp))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy2(path, dest)
        self.note("backup", dest, "of " + self.rel(path))

    def write_text(self, path, text, overwrite=False, mode=None):
        """Create a file, or replace it only when overwrite is set and content differs."""
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as fh:
                old = fh.read()
            if old == text:
                self.note("unchanged", path)
                return False
            if not overwrite:
                self.note("kept", path, "exists and differs; left as is")
                return False
            if not self.dry:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(text)
            self.note("updated", path)
        else:
            if not self.dry:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(text)
            self.note("created", path)
        if mode and not self.dry:
            os.chmod(path, mode)
        return True

    def write_json(self, path, data, existed):
        text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
        if existed:
            with open(path, "r", encoding="utf-8") as fh:
                if fh.read() == text:
                    self.note("unchanged", path)
                    return
            self.backup(path)
        if not self.dry:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(text)
        self.note("updated" if existed else "created", path)


def read(path):
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def load_json_file(path):
    """(data, existed). Raises ValueError with a clear message on bad JSON."""
    if not os.path.exists(path):
        return {}, False
    text = read(path)
    if not text.strip():
        return {}, True
    try:
        data = json.loads(text)
    except ValueError as exc:
        raise ValueError("%s is not valid JSON (%s). Fix it by hand; nothing was changed." % (path, exc))
    if not isinstance(data, dict):
        raise ValueError("%s does not hold a JSON object; nothing was changed." % path)
    return data, True


# ------------------------------------------------------------ detection

def read_pkg(path):
    try:
        with open(os.path.join(path, "package.json"), "r", encoding="utf-8") as fh:
            data = json.load(fh)
            return data if isinstance(data, dict) else None
    except (OSError, ValueError):
        return None


def package_manager(root):
    for lock, pm in (("pnpm-lock.yaml", "pnpm"), ("yarn.lock", "yarn"), ("bun.lockb", "bun"),
                     ("bun.lock", "bun"), ("package-lock.json", "npm")):
        if os.path.exists(os.path.join(root, lock)):
            return pm
    pkg = read_pkg(root) or {}
    declared = str(pkg.get("packageManager", ""))
    for pm in ("pnpm", "yarn", "bun"):
        if declared.startswith(pm):
            return pm
    return "npm"


def run_script(pm, name):
    return "%s run %s" % (pm, name)


def node_checks(path, pm, root_pkg=None):
    pkg = read_pkg(path)
    if not pkg:
        return {}
    scripts = pkg.get("scripts") or {}
    checks = {}
    for name in ("typecheck", "type-check", "check-types", "types:check", "tsc"):
        if name in scripts:
            checks["typecheck"] = run_script(pm, name)
            break
    else:
        deps = {}
        for src in (pkg, root_pkg or {}):
            for key in ("dependencies", "devDependencies"):
                deps.update(src.get(key) or {})
        if os.path.exists(os.path.join(path, "tsconfig.json")) and "typescript" in deps:
            checks["typecheck"] = {"pnpm": "pnpm exec tsc --noEmit", "yarn": "yarn tsc --noEmit",
                                   "bun": "bunx tsc --noEmit"}.get(pm, "npx --no-install tsc --noEmit")
    test = scripts.get("test", "")
    if test and "no test specified" not in test:
        checks["test"] = {"pnpm": "pnpm test", "yarn": "yarn test", "bun": "bun run test"}.get(pm, "npm test")
    return checks


def workspace_dirs(root, pkg):
    patterns = []
    ws = (pkg or {}).get("workspaces")
    if isinstance(ws, list):
        patterns += ws
    elif isinstance(ws, dict):
        patterns += ws.get("packages") or []
    pnpm_ws = os.path.join(root, "pnpm-workspace.yaml")
    if os.path.exists(pnpm_ws):
        in_packages = False
        for line in read(pnpm_ws).splitlines():
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if not line.startswith((" ", "\t", "-")):
                in_packages = line.strip().startswith("packages")
                continue
            item = line.strip()
            if in_packages and item.startswith("-"):
                patterns.append(item[1:].strip().strip("'\""))
    dirs = []
    for pat in patterns:
        if pat.startswith("!"):
            continue
        for d in sorted(glob.glob(os.path.join(root, pat))):
            if os.path.isdir(d) and os.path.exists(os.path.join(d, "package.json")) and "node_modules" not in d:
                dirs.append(d)
    return dirs


def python_checks(root):
    names = os.listdir(root)
    markers = ("pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "requirements-dev.txt")
    has_tests = any(n.startswith("test_") and n.endswith(".py") for n in names) or os.path.isdir(
        os.path.join(root, "tests"))
    if not any(m in names for m in markers) and not has_tests:
        return {}
    prefix = "uv run " if "uv.lock" in names else "poetry run " if "poetry.lock" in names else ""
    py = "python" if prefix else "python3"
    text = ""
    for m in markers + ("pytest.ini", "tox.ini", "mypy.ini"):
        p = os.path.join(root, m)
        if os.path.isfile(p):
            try:
                text += read(p)
            except (OSError, UnicodeDecodeError):
                pass
    checks = {}
    if "[tool.mypy]" in text or "mypy.ini" in names:
        checks["typecheck"] = prefix + "mypy ."
    elif "[tool.pyright]" in text or "pyrightconfig.json" in names:
        checks["typecheck"] = prefix + "pyright"
    if "pytest" in text or "conftest.py" in names or "pytest.ini" in names:
        checks["test"] = "%s%s -m pytest -q" % (prefix, py)
    elif has_tests:
        checks["test"] = "%s%s -m unittest -q" % (prefix, py)
    return checks


def detect_packages(root):
    packages, notes = [], []
    pkg = read_pkg(root)
    pm = package_manager(root) if pkg else None
    root_checks = {}
    if pkg:
        ws = workspace_dirs(root, pkg)
        if ws:
            for d in ws:
                checks = node_checks(d, pm, pkg)
                if checks:
                    packages.append({"path": os.path.relpath(d, root), "checks": checks})
            notes.append("monorepo: %d workspace packages found; only their own checks run, "
                         "for the packages a diff touches" % len(ws))
        else:
            root_checks.update(node_checks(root, pm))
    py = python_checks(root)
    for k, v in py.items():
        root_checks[("py-" + k) if k in root_checks else k] = v
    if os.path.exists(os.path.join(root, "go.mod")):
        root_checks.setdefault("typecheck", "go vet ./...")
        root_checks.setdefault("test", "go test ./...")
    if os.path.exists(os.path.join(root, "Cargo.toml")):
        root_checks.setdefault("typecheck", "cargo check --quiet")
        root_checks.setdefault("test", "cargo test --quiet")
    if not root_checks and not packages and os.path.exists(os.path.join(root, "Makefile")):
        if any(line.startswith("test:") for line in read(os.path.join(root, "Makefile")).splitlines()):
            root_checks["test"] = "make test"
    if root_checks:
        packages.insert(0, {"path": ".", "checks": root_checks})
    if not packages:
        notes.append("no check commands found: add them to .ship/config.json under packages")
    return packages, notes


def make_config(root):
    packages, notes = detect_packages(root)
    d = stop_gate.DEFAULTS
    cfg = {
        "_help": "ship-complete gate settings. 'packages' maps a folder to the checks that run when "
                 "a diff touches it (deepest folder wins). Keep checks fast: they run every time an "
                 "agent stops. Optional overrides: claim_patterns, proof_patterns, honest_patterns, "
                 "negation_patterns (regex lists). Turn the gate off for one shell with SHIP_GATE=off.",
        "version": 1,
        "enabled": True,
        "packages": packages,
        "check_timeout_sec": d["check_timeout_sec"],
        "gate_budget_sec": d["gate_budget_sec"],
        "max_consecutive_blocks": d["max_consecutive_blocks"],
        "require_proof_for_claims": True,
        "skip_paths": d["skip_paths"],
        "subagent_skip_types": d["subagent_skip_types"],
        "session_reminder": True,
    }
    return cfg, notes


# ------------------------------------------------------------ hook merging

def has_our_hook(groups):
    for g in groups or []:
        for h in (g or {}).get("hooks") or []:
            if MARK in str(h.get("command", "")) or MARK in " ".join(map(str, h.get("args") or [])):
                return True
    return False


def add_group(hooks, event, command, timeout, matcher=None):
    groups = hooks.setdefault(event, [])
    if not isinstance(groups, list):
        raise ValueError("hooks.%s is not a list; nothing was changed." % event)
    if has_our_hook(groups):
        return False
    group = {"hooks": [{"type": "command", "command": command, "timeout": timeout}]}
    if matcher is not None:
        group["matcher"] = matcher
    groups.append(group)
    return True


def strip_ours(hooks):
    changed = False
    for event in list(hooks.keys()):
        groups = hooks.get(event)
        if not isinstance(groups, list):
            continue
        kept = []
        for g in groups:
            hs = [h for h in (g or {}).get("hooks") or []
                  if MARK not in str(h.get("command", "")) and MARK not in " ".join(map(str, h.get("args") or []))]
            if len(hs) != len((g or {}).get("hooks") or []):
                changed = True
            if hs:
                g = dict(g)
                g["hooks"] = hs
                kept.append(g)
        if kept:
            hooks[event] = kept
        else:
            del hooks[event]
            changed = True
    return changed


def merge_claude(plan):
    path = os.path.join(plan.root, ".claude", "settings.json")
    data, existed = load_json_file(path)
    hooks = data.setdefault("hooks", {})
    if not isinstance(hooks, dict):
        raise ValueError("%s: 'hooks' is not an object; nothing was changed." % path)
    changed = add_group(hooks, "SessionStart", CLAUDE_CMD + " --session-start", 15)
    changed = add_group(hooks, "Stop", CLAUDE_CMD, 600) or changed
    changed = add_group(hooks, "SubagentStop", CLAUDE_CMD, 600) or changed
    if changed:
        plan.write_json(path, data, existed)
    else:
        plan.note("unchanged", path, "hooks already present")


def merge_codex(plan):
    path = os.path.join(plan.root, ".codex", "hooks.json")
    data, existed = load_json_file(path)
    hooks = data.setdefault("hooks", {})
    if add_group(hooks, "Stop", GIT_ROOT_CMD, 600):
        plan.write_json(path, data, existed)
    else:
        plan.note("unchanged", path, "hooks already present")


def merge_cursor(plan):
    path = os.path.join(plan.root, ".cursor", "hooks.json")
    data, existed = load_json_file(path)
    data.setdefault("version", 1)
    hooks = data.setdefault("hooks", {})
    changed = False
    for event, cmd, extra in (("afterAgentResponse", "python3 .ship/stop_gate.py --record-response", {}),
                              ("stop", "python3 .ship/stop_gate.py", {"loop_limit": 3})):
        entries = hooks.setdefault(event, [])
        if not any(MARK in str(e.get("command", "")) for e in entries):
            e = {"command": cmd}
            e.update(extra)
            entries.append(e)
            changed = True
    if changed:
        plan.write_json(path, data, existed)
    else:
        plan.note("unchanged", path, "hooks already present")


def merge_gemini(plan):
    path = os.path.join(plan.root, ".gemini", "settings.json")
    data, existed = load_json_file(path)
    hooks = data.setdefault("hooks", {})
    if add_group(hooks, "AfterAgent", GIT_ROOT_CMD, 600000):
        plan.write_json(path, data, existed)
    else:
        plan.note("unchanged", path, "hooks already present")


def unmerge(plan, rel, cursor=False):
    path = os.path.join(plan.root, rel)
    if not os.path.exists(path):
        return
    data, existed = load_json_file(path)
    hooks = data.get("hooks")
    if not isinstance(hooks, dict):
        return
    if cursor:
        changed = False
        for event in list(hooks.keys()):
            entries = hooks.get(event) or []
            kept = [e for e in entries if MARK not in str(e.get("command", ""))]
            if len(kept) != len(entries):
                changed = True
                if kept:
                    hooks[event] = kept
                else:
                    del hooks[event]
    else:
        changed = strip_ours(hooks)
    if changed:
        if not hooks:
            del data["hooks"]
        plan.write_json(path, data, existed)


# ------------------------------------------------------------ AGENTS.md

def agents_section():
    return "%s\n%s%s\n" % (START, read(os.path.join(SKILL, "assets", "agents-md-section.md")).rstrip() + "\n", END)


def merge_agents_md(plan):
    path = os.path.join(plan.root, "AGENTS.md")
    section = agents_section()
    if not os.path.exists(path):
        plan.write_text(path, "# AGENTS.md\n\n" + section)
        return
    text = read(path)
    if START in text and END in text:
        before, rest = text.split(START, 1)
        after = rest.split(END, 1)[1]
        new = before + section.rstrip("\n") + after
    else:
        new = text.rstrip("\n") + "\n\n" + section
    if new == text:
        plan.note("unchanged", path)
        return
    plan.backup(path)
    if not plan.dry:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(new)
    plan.note("updated", path, "ship-complete section")


def unmerge_agents_md(plan):
    path = os.path.join(plan.root, "AGENTS.md")
    if not os.path.exists(path):
        return
    text = read(path)
    if START not in text or END not in text:
        return
    before, rest = text.split(START, 1)
    after = rest.split(END, 1)[1]
    plan.backup(path)
    new = (before.rstrip("\n") + "\n" + after.lstrip("\n")).strip("\n") + "\n"
    if not plan.dry:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(new)
    plan.note("updated", path, "ship-complete section removed")


# ------------------------------------------------------------ main

def project_root(arg):
    start = os.path.abspath(arg or os.getcwd())
    try:
        out = subprocess.run(["git", "-C", start, "rev-parse", "--show-toplevel"],
                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.decode().strip(), True
    except OSError:
        pass
    return start, False


def install(plan, args):
    root = plan.root
    ship = os.path.join(root, ".ship")
    for name in ("stop_gate.py", "proof_pack.py", "bug_ledger.py"):
        plan.write_text(os.path.join(ship, name), read(os.path.join(HERE, name)), overwrite=True, mode=0o755)
    plan.write_text(os.path.join(ship, ".gitignore"), ".state/\n", overwrite=True)

    cfg_path = os.path.join(ship, "config.json")
    detected_notes = []
    if os.path.exists(cfg_path):
        load_json_file(cfg_path)  # validate
        plan.note("kept", cfg_path, "your settings are never overwritten")
    else:
        cfg, detected_notes = make_config(root)
        plan.write_text(cfg_path, json.dumps(cfg, indent=2, ensure_ascii=False) + "\n")

    merge_claude(plan)
    if args.codex:
        merge_codex(plan)
    if args.cursor:
        merge_cursor(plan)
    if args.gemini:
        merge_gemini(plan)

    plan.write_text(os.path.join(root, ".claude", "agents", "verifier.md"),
                    read(os.path.join(SKILL, "agents", "verifier.md")))
    docs = os.path.join(root, "docs", "ship")
    plan.write_text(os.path.join(docs, "BRIEF-TEMPLATE.md"),
                    read(os.path.join(SKILL, "references", "brief-template.md")))
    plan.write_text(os.path.join(docs, "PROOF-TEMPLATE.md"), read(os.path.join(SKILL, "assets", "proof-template.md")))
    for sub in ("briefs", "proof"):
        keep = os.path.join(docs, sub, ".gitkeep")
        if not os.path.exists(keep):
            plan.write_text(keep, "")
    ledger_json = os.path.join(docs, "ledger.json")
    if os.path.exists(ledger_json):
        plan.note("kept", ledger_json)
    else:
        sys.path.insert(0, HERE)
        import bug_ledger
        if not plan.dry:
            bug_ledger.init(root)
        plan.note("created", ledger_json, "and LEDGER.md")
    if not args.no_agents_md:
        merge_agents_md(plan)
    return detected_notes


def uninstall(plan):
    unmerge(plan, os.path.join(".claude", "settings.json"))
    unmerge(plan, os.path.join(".codex", "hooks.json"))
    unmerge(plan, os.path.join(".gemini", "settings.json"))
    unmerge(plan, os.path.join(".cursor", "hooks.json"), cursor=True)
    unmerge_agents_md(plan)


def main():
    ap = argparse.ArgumentParser(description="Install the ship-complete gate into a project.")
    ap.add_argument("--project", help="project folder (default: the git root of the current folder)")
    ap.add_argument("--dry-run", action="store_true", help="show what would change; write nothing")
    ap.add_argument("--codex", action="store_true", help="also add a Codex Stop hook (.codex/hooks.json)")
    ap.add_argument("--cursor", action="store_true", help="also add Cursor hooks (.cursor/hooks.json)")
    ap.add_argument("--gemini", action="store_true", help="also add a Gemini CLI AfterAgent hook")
    ap.add_argument("--no-agents-md", action="store_true", help="do not add the AGENTS.md section")
    ap.add_argument("--uninstall", action="store_true", help="remove the hooks and the AGENTS.md section")
    args = ap.parse_args()

    root, is_git = project_root(args.project)
    plan = Plan(root, args.dry_run)
    try:
        notes = [] if args.uninstall else install(plan, args)
        if args.uninstall:
            uninstall(plan)
    except ValueError as exc:
        print("ship-complete install stopped: %s" % exc)
        return 2

    print("ship-complete %s%s in %s" % ("uninstall" if args.uninstall else "install",
                                       " (dry run, nothing written)" if args.dry_run else "", root))
    width = max([len(s) for s, _, _ in plan.log] + [7])
    for status, path, extra in plan.log:
        print("  %-*s  %s%s" % (width, status, path, ("  (" + extra + ")") if extra else ""))
    changed = [s for s, _, _ in plan.log if s in ("created", "updated")]
    if args.uninstall:
        print("\nLeft in place: .ship/, docs/ship/, .claude/agents/verifier.md. Delete them by hand if you want.")
        return 0
    if not is_git:
        print("\nWARNING: this folder is not a git repository. The gate finds work through git, so it "
              "will allow every stop until you run `git init`.")
    cfg = load_json_file(os.path.join(root, ".ship", "config.json"))[0] if not args.dry_run else make_config(root)[0]
    print("\nChecks per package (.ship/config.json):")
    for p in cfg.get("packages") or []:
        for name, cmd in (p.get("checks") or {}).items():
            print("  %-14s %-10s %s" % (p.get("path"), name, cmd))
    if not cfg.get("packages"):
        print("  (none detected)")
    for n in notes:
        print("  note: " + n)
    if changed or args.dry_run:
        print("\nNext:\n"
              "  1. Run the checks once by hand and make sure they pass and are fast:\n"
              "       python3 .ship/stop_gate.py --manual --all\n"
              "  2. Commit .ship/, docs/ship/, .claude/ and AGENTS.md so every agent and teammate gets the gate.\n"
              "  3. Claude Code picks up the hooks automatically; check them with /hooks.")
        if args.codex:
            print("  Codex: review and trust the new hook with /hooks (Codex skips untrusted hooks).")
        if args.gemini:
            print("  Gemini CLI: confirm hooks are enabled in your version (see the skill's other-agents.md).")
    else:
        print("\nNothing changed: the gate is already installed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
