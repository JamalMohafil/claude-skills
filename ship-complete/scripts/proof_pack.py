#!/usr/bin/env python3
"""Build the proof pack a human reads before testing a feature.

A proof pack is one page: each "Done when" line from the brief with a verdict
and its evidence, the commands that ran (real output, exit code, commit), the
screenshots, and what was NOT verified. It lives in docs/ship/proof/<slug>/.

  proof_pack.py new <slug> [--title T] [--brief PATH] [--url URL] [--sample PATH]
  proof_pack.py run <slug> [--label L] -- <command> [args...]
  proof_pack.py shot <slug> <image> [--caption C] [--viewport phone|desktop|...]
  proof_pack.py verdict <slug> <n> PASS|FAIL|UNTESTED [--evidence TEXT]
  proof_pack.py check <slug>        exit 1 while the pack is incomplete or stale

Python 3.8+ standard library only.
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import time

COMMANDS = "<!-- proof:commands -->"
SHOTS = "<!-- proof:shots -->"
FALLBACK_TEMPLATE = """# Proof pack: {title}

- Brief: {brief}
- Commit: {commit} on {branch} ({tree})
- Live URL: {url}
- Picked sample: {sample}
- Made: {date}

## Done when: verdicts

| # | Done when (the user's words) | Verdict | Evidence |
|---|---|---|---|
{rows}

## Commands run

<!-- proof:commands -->

## Screenshots

<!-- proof:shots -->

## Not verified

<!-- Say plainly what was not checked and why. Write "Nothing" only if that is true. -->

## Decisions made for the user

<!-- Each decision, with what it costs if it is wrong. "None" if there were none. -->
"""


def git(root, *args):
    try:
        p = subprocess.run(["git", "-C", root] + list(args), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        return p.stdout.decode("utf-8", "replace").strip() if p.returncode == 0 else ""
    except OSError:
        return ""


def repo_root():
    return git(os.getcwd(), "rev-parse", "--show-toplevel") or os.getcwd()


def commit_info(root):
    sha = git(root, "rev-parse", "--short", "HEAD") or "none"
    dirty = bool(git(root, "status", "--porcelain"))
    return sha, git(root, "rev-parse", "--abbrev-ref", "HEAD") or "?", dirty


def pack_path(root, slug):
    if not re.match(r"^[A-Za-z0-9._-]+$", slug):
        sys.exit("slug may only hold letters, digits, dot, dash and underscore")
    return os.path.join(root, "docs", "ship", "proof", slug, "PROOF.md")


def read(path):
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def cell(text):
    return (text or "").replace("|", "\\|").replace("\n", " ").strip()


def done_when_lines(brief_text):
    lines, inside = [], False
    for line in brief_text.splitlines():
        if re.match(r"^#{1,6}\s", line):
            inside = bool(re.match(r"^#{1,6}\s*done when", line, re.I))
            continue
        if inside:
            m = re.match(r"^\s*(?:[-*]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)(.+)$", line)
            text = m.group(1).strip() if m else ""
            if text and text.lower() not in ("[ ]", "[x]") and not text.startswith("<!--"):
                lines.append(text)
    return lines


def insert_after(text, marker, chunk):
    i = text.find(marker)
    if i < 0:
        return text.rstrip("\n") + "\n\n" + chunk + "\n"
    j = text.find("\n## ", i)
    if j < 0:
        return text.rstrip("\n") + "\n\n" + chunk + "\n"
    return text[:j].rstrip("\n") + "\n\n" + chunk + "\n" + text[j:]


def cmd_new(root, a):
    path = pack_path(root, a.slug)
    if os.path.exists(path):
        print("exists: %s" % os.path.relpath(path, root))
        return 0
    rows = []
    if a.brief:
        for n, line in enumerate(done_when_lines(read(os.path.join(root, a.brief))), 1):
            rows.append("| %d | %s | UNTESTED | |" % (n, cell(line)))
    if not rows:
        rows.append("| 1 | (copy each Done-when line from the brief) | UNTESTED | |")
    tpl_path = os.path.join(root, "docs", "ship", "PROOF-TEMPLATE.md")
    tpl = read(tpl_path) if os.path.exists(tpl_path) else FALLBACK_TEMPLATE
    sha, branch, dirty = commit_info(root)
    text = tpl.format(title=a.title or a.slug, brief=a.brief or "(none)", commit=sha, branch=branch,
                      tree="uncommitted changes" if dirty else "clean", url=a.url or "(none)",
                      sample=a.sample or "(none)", date=time.strftime("%Y-%m-%d %H:%M"), rows="\n".join(rows))
    write(path, text)
    print("created %s with %d Done-when rows" % (os.path.relpath(path, root), len(rows)))
    return 0


def cmd_run(root, a):
    path = pack_path(root, a.slug)
    if not os.path.exists(path):
        sys.exit("no pack yet: run `proof_pack.py new %s` first" % a.slug)
    argv = a.command[1:] if a.command and a.command[0] == "--" else a.command
    if not argv:
        sys.exit("give the command after --")
    start = time.time()
    try:
        p = subprocess.run(argv, cwd=os.getcwd(), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        code, out = p.returncode, p.stdout.decode("utf-8", "replace")
    except OSError as exc:
        code, out = 127, "could not start: %s" % exc
    secs = time.time() - start
    sha, _, dirty = commit_info(root)
    logs = os.path.join(os.path.dirname(path), "logs")
    os.makedirs(logs, exist_ok=True)
    n = len([f for f in os.listdir(logs) if f.endswith(".log")]) + 1
    label = re.sub(r"[^A-Za-z0-9._-]+", "-", a.label or argv[0])[:40]
    log = os.path.join(logs, "%02d-%s.log" % (n, label))
    write(log, out)
    shown = "\n".join(out.rstrip().splitlines()[-30:])
    chunk = "```\n$ %s\n%s\n```\n[exit %d, %.1fs, commit %s%s, %s, full log: %s]" % (
        " ".join(argv), shown, code, secs, sha, "+dirty" if dirty else "", time.strftime("%Y-%m-%d %H:%M"),
        os.path.relpath(log, os.path.dirname(path)))
    write(path, insert_after(read(path), COMMANDS, chunk))
    print(shown)
    print("[exit %d] recorded in %s" % (code, os.path.relpath(path, root)))
    return code


def cmd_shot(root, a):
    path = pack_path(root, a.slug)
    if not os.path.exists(path):
        sys.exit("no pack yet: run `proof_pack.py new %s` first" % a.slug)
    if not os.path.isfile(a.image):
        sys.exit("no such image: %s" % a.image)
    dest = os.path.join(os.path.dirname(path), os.path.basename(a.image))
    if os.path.abspath(a.image) != os.path.abspath(dest):
        shutil.copy2(a.image, dest)
    sha, _, dirty = commit_info(root)
    chunk = "![%s](%s)\n%s (%s, commit %s%s)" % (cell(a.caption or os.path.basename(dest)), os.path.basename(dest),
                                               a.caption or "", a.viewport or "viewport not given", sha,
                                               "+dirty" if dirty else "")
    write(path, insert_after(read(path), SHOTS, chunk))
    print("added %s" % os.path.basename(dest))
    return 0


def cmd_verdict(root, a):
    path = pack_path(root, a.slug)
    text = read(path)
    rx = re.compile(r"^\| %d \| (.*?) \| (PASS|FAIL|UNTESTED) \| (.*?) ?\|$" % a.n, re.M)
    m = rx.search(text)
    if not m:
        sys.exit("row %d not found in %s" % (a.n, path))
    row = "| %d | %s | %s | %s |" % (a.n, m.group(1), a.verdict, cell(a.evidence or m.group(3)))
    write(path, text[:m.start()] + row + text[m.end():])
    print(row)
    return 0


def cmd_check(root, a):
    path = pack_path(root, a.slug)
    if not os.path.exists(path):
        print("no pack: %s" % os.path.relpath(path, root))
        return 1
    text = read(path)
    problems = []
    rows = re.findall(r"^\| (\d+) \| (.*?) \| (PASS|FAIL|UNTESTED) \| (.*?) ?\|$", text, re.M)
    if not rows:
        problems.append("no Done-when rows")
    for n, line, verdict, evidence in rows:
        if verdict != "PASS":
            problems.append("row %s is %s: %s" % (n, verdict, line[:70]))
        elif not evidence.strip():
            problems.append("row %s is PASS with no evidence" % n)
    if COMMANDS in text and "```" not in text.split(COMMANDS, 1)[1].split("\n## ", 1)[0] \
            and "![" not in text:
        problems.append("no command output and no screenshot")
    nv = re.search(r"^## Not verified\s*\n(.*?)(?=^## |\Z)", text, re.M | re.S)
    if nv is None or not re.sub(r"<!--.*?-->", "", nv.group(1), flags=re.S).strip():
        problems.append("'Not verified' is empty: say what was not checked, or write Nothing")
    sha, _, dirty = commit_info(root)
    seen = re.findall(r"commit ([0-9a-f]{4,40}|none)", text)
    if seen and seen[-1] != sha:
        problems.append("latest evidence is from commit %s but HEAD is %s: re-run on this commit" % (seen[-1], sha))
    for p in problems:
        print("MISSING  " + p)
    print("PROOF PACK: %s (%s)" % ("COMPLETE" if not problems else "INCOMPLETE", os.path.relpath(path, root)))
    return 0 if not problems else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd")
    p = sub.add_parser("new")
    p.add_argument("slug")
    p.add_argument("--title")
    p.add_argument("--brief", help="brief path relative to the repo root")
    p.add_argument("--url")
    p.add_argument("--sample")
    p = sub.add_parser("run")
    p.add_argument("slug")
    p.add_argument("--label")
    p.add_argument("command", nargs=argparse.REMAINDER)
    p = sub.add_parser("shot")
    p.add_argument("slug")
    p.add_argument("image")
    p.add_argument("--caption")
    p.add_argument("--viewport")
    p = sub.add_parser("verdict")
    p.add_argument("slug")
    p.add_argument("n", type=int)
    p.add_argument("verdict", choices=["PASS", "FAIL", "UNTESTED"])
    p.add_argument("--evidence")
    p = sub.add_parser("check")
    p.add_argument("slug")
    a = ap.parse_args()
    if not a.cmd:
        ap.print_help()
        return 2
    root = repo_root()
    return {"new": cmd_new, "run": cmd_run, "shot": cmd_shot, "verdict": cmd_verdict, "check": cmd_check}[a.cmd](root, a)


if __name__ == "__main__":
    sys.exit(main())
