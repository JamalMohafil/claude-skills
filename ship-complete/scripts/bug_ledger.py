#!/usr/bin/env python3
"""The bug ledger: every bug the human reports becomes a permanent check first.

Rule: a reported bug gets a check (test, journey, eval scenario or lint) that
FAILS on the current, unfixed code ("red"). Only then is it fixed, and the same
check must PASS ("green"). Bugs that no automated check can hold (taste, a
misread requirement) are closed with a reason and a brief or sample update.

  bug_ledger.py add "<what the human saw>" [--where URL/SCREEN] [--bucket B]
  bug_ledger.py red <ID> --check "<what the check proves>" -- <command> [args...]
  bug_ledger.py green <ID> -- <command> [args...]
  bug_ledger.py close <ID> --reason "<why no automated check, and what changed instead>"
  bug_ledger.py list [--open]
  bug_ledger.py stats

Data: docs/ship/ledger.json (source) and docs/ship/LEDGER.md (rendered).
Python 3.8+ standard library only.
"""

import argparse
import json
import os
import subprocess
import sys
import time

BUCKETS = ["taste", "requirement", "capability", "ui", "claimed-done", "integration", "ai", "regression", "other"]
NETS = {
    "taste": "a picked sample + a Done-when line the verifier checks",
    "requirement": "a Done-when line in the user's words + the verifier",
    "capability": "a jobs-list eval scenario, or a plain 'cannot yet' in the plan",
    "ui": "a browser journey at phone and desktop size",
    "claimed-done": "a journey on the real stack + proof in the stop message",
    "integration": "a live check of the integration after every deploy",
    "ai": "an eval scenario (hard rule k of k)",
    "regression": "a regression test or eval scenario",
    "other": "the closest check that would have failed",
}


def git(root, *args):
    try:
        p = subprocess.run(["git", "-C", root] + list(args), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        return p.stdout.decode("utf-8", "replace").strip() if p.returncode == 0 else ""
    except OSError:
        return ""


def repo_root():
    return git(os.getcwd(), "rev-parse", "--show-toplevel") or os.getcwd()


def paths(root):
    d = os.path.join(root, "docs", "ship")
    return os.path.join(d, "ledger.json"), os.path.join(d, "LEDGER.md")


def load(root):
    jp, _ = paths(root)
    if not os.path.exists(jp):
        sys.exit("no ledger: run the ship-complete installer, or `bug_ledger.py init`")
    with open(jp, "r", encoding="utf-8") as fh:
        return json.load(fh)


def cell(text):
    return (text or "").replace("|", "\\|").replace("\n", " ").strip()


def render(data):
    bugs = data.get("bugs", [])
    out = ["# Bug ledger", "",
           "Every bug a human reports is written here first. It gets a check that fails on the unfixed code "
           "(red), then the fix makes the same check pass (green). Never fix a reported bug without its red "
           "check. Edit with `python3 .ship/bug_ledger.py`; this file is generated from ledger.json.", ""]
    counts = {}
    for b in bugs:
        counts.setdefault(b["bucket"], [0, 0])
        counts[b["bucket"]][0] += 1
        if b["status"] in ("fixed", "closed"):
            counts[b["bucket"]][1] += 1
    if counts:
        out.append("**By bucket:** " + ", ".join("%s %d (%d done)" % (k, v[0], v[1]) for k, v in sorted(counts.items())))
        out.append("")
    out += ["| ID | Reported | Bucket | What the human saw | Check | Red | Green | Status |",
            "|---|---|---|---|---|---|---|---|"]
    for b in bugs:
        red = b.get("red") or {}
        green = b.get("green") or {}
        out.append("| %s | %s | %s | %s | %s | %s | %s | %s |" % (
            b["id"], b["reported"], b["bucket"], cell(b["seen"] + (" (" + b["where"] + ")" if b.get("where") else "")),
            cell(b.get("check") or "-"),
            ("exit %s @ %s" % (red["exit"], red["commit"])) if red else "-",
            ("exit %s @ %s" % (green["exit"], green["commit"])) if green else "-",
            cell(b["status"] + (": " + b["reason"] if b.get("reason") else ""))))
    return "\n".join(out) + "\n"


def save(root, data):
    jp, mp = paths(root)
    os.makedirs(os.path.dirname(jp), exist_ok=True)
    with open(jp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    with open(mp, "w", encoding="utf-8") as fh:
        fh.write(render(data))


def init(root):
    jp, _ = paths(root)
    if not os.path.exists(jp):
        save(root, {"version": 1, "bugs": []})


def find(data, bug_id):
    for b in data["bugs"]:
        if b["id"].lower() == bug_id.lower():
            return b
    sys.exit("no bug %s" % bug_id)


def run(argv):
    argv = argv[1:] if argv and argv[0] == "--" else argv
    if not argv:
        sys.exit("give the check command after --")
    try:
        p = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        code, out = p.returncode, p.stdout.decode("utf-8", "replace")
    except OSError as exc:
        code, out = 127, "could not start: %s" % exc
    print("\n".join(out.rstrip().splitlines()[-25:]))
    return code, " ".join(argv), "\n".join(out.rstrip().splitlines()[-15:])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd")
    sub.add_parser("init")
    p = sub.add_parser("add")
    p.add_argument("seen")
    p.add_argument("--where")
    p.add_argument("--bucket", choices=BUCKETS, default="other")
    p = sub.add_parser("red")
    p.add_argument("id")
    p.add_argument("--check", required=True)
    p.add_argument("command", nargs=argparse.REMAINDER)
    p = sub.add_parser("green")
    p.add_argument("id")
    p.add_argument("command", nargs=argparse.REMAINDER)
    p = sub.add_parser("close")
    p.add_argument("id")
    p.add_argument("--reason", required=True)
    p = sub.add_parser("list")
    p.add_argument("--open", action="store_true")
    sub.add_parser("stats")
    a = ap.parse_args()
    root = repo_root()
    if a.cmd == "init":
        init(root)
        print("ledger ready: docs/ship/LEDGER.md")
        return 0
    if not a.cmd:
        ap.print_help()
        return 2
    data = load(root)
    sha = git(root, "rev-parse", "--short", "HEAD") or "none"
    if a.cmd == "add":
        bug_id = "B-%03d" % (len(data["bugs"]) + 1)
        data["bugs"].append({"id": bug_id, "reported": time.strftime("%Y-%m-%d"), "bucket": a.bucket,
                             "seen": a.seen, "where": a.where or "", "status": "open: needs a red check"})
        save(root, data)
        print("%s added (%s). Next: write the check that fails today, then\n"
              "  python3 .ship/bug_ledger.py red %s --check \"...\" -- <command>\n"
              "The check this bucket usually needs: %s" % (bug_id, a.bucket, bug_id, NETS[a.bucket]))
        return 0
    if a.cmd == "red":
        b = find(data, a.id)
        code, cmd, out = run(a.command)
        if code == 0:
            print("\nREFUSED: the check PASSES on the unfixed code, so it does not catch %s. "
                  "Make it fail first (and make sure it fails for the bug's reason)." % b["id"])
            return 1
        b.update({"check": a.check, "status": "open: red, fix next",
                  "red": {"exit": code, "commit": sha, "cmd": cmd, "tail": out, "at": time.strftime("%Y-%m-%d %H:%M")}})
        save(root, data)
        print("\n%s red recorded (exit %d at %s). Now fix it, then run `green` with the same command." % (b["id"], code, sha))
        return 0
    if a.cmd == "green":
        b = find(data, a.id)
        if not b.get("red"):
            print("REFUSED: %s has no red check yet. Show the check failing on the unfixed code first." % b["id"])
            return 1
        code, cmd, out = run(a.command)
        if code != 0:
            print("\nStill failing (exit %d): %s is not fixed." % (code, b["id"]))
            return 1
        if cmd != b["red"]["cmd"]:
            print("note: green ran `%s`, red ran `%s`; make sure it is the same check." % (cmd, b["red"]["cmd"]))
        b.update({"status": "fixed", "green": {"exit": code, "commit": sha, "cmd": cmd, "tail": out,
                                               "at": time.strftime("%Y-%m-%d %H:%M")}})
        save(root, data)
        print("\n%s fixed: the check failed at %s and passes at %s. Commit the check with the fix." % (
            b["id"], b["red"]["commit"], sha))
        return 0
    if a.cmd == "close":
        b = find(data, a.id)
        b.update({"status": "closed", "reason": a.reason})
        save(root, data)
        print("%s closed without an automated check: %s" % (b["id"], a.reason))
        return 0
    if a.cmd == "list":
        for b in data["bugs"]:
            if a.open and b["status"] in ("fixed", "closed"):
                continue
            print("%s  %-12s %-28s %s" % (b["id"], b["bucket"], b["status"][:28], b["seen"][:80]))
        return 0
    if a.cmd == "stats":
        total = len(data["bugs"])
        print("%d reported" % total)
        for k in BUCKETS:
            n = [b for b in data["bugs"] if b["bucket"] == k]
            if n:
                done = len([b for b in n if b["status"] in ("fixed", "closed")])
                print("  %-12s %3d  (%d%%)  done %d   net: %s" % (k, len(n), round(100.0 * len(n) / total), done, NETS[k]))
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
