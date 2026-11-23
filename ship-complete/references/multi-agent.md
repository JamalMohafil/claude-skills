# Many agents at once

Read this when more than one agent works on the same repository: background subagents, a
coordinator with builders, parallel worktrees, or long runs that can be cut off by a usage
limit.

Why: in one real build (about 45 commits a day, waves of 4–5 agents) every rule below comes
from something that went wrong: commits that swept up another agent's files, a HEAD that never
compiled on its own, 7–10 agents stopped at once by a usage limit, a stale watcher, a stale
worktree, and a coordinator that called built work "not started".

## 1. Roles

- **The coordinator** splits the work, writes each builder's brief, checks every report
  itself, commits or merges, deploys, and reports to the human. A builder's report is a
  claim; the coordinator re-runs the checks before believing it.
- **Builders** each own one slice, in their own worktree when files might overlap.
- **The verifier** is a fresh agent that never saw the build (Step 6). The agent that built a
  slice never reviews it.
- **The human** accepts the work. Agents don't merge to the main branch, force-push, spend
  money, publish or message customers unless the human said so for that action.

Keep waves small: 4–5 agents at most, each slice about an hour of work. **End each wave with
the live journeys green before starting the next.** Large waves multiply merge conflicts and
make it impossible to tell which change broke the live app.

## 2. Worktrees: make them yourself, from the current main

Tool-made worktrees were once based on a stale commit, so agents built on old code. Create
them yourself, after a fetch:

```sh
git fetch origin
mkdir -p ../wt && git worktree add ../wt/<slug> -b "feat/<slug>" origin/main   # outside the repo: nothing to ignore
git -C ../wt/<slug> rev-parse --short HEAD      # must equal: git rev-parse --short origin/main
```

If your agent tool creates worktrees for you (for example a subagent with `isolation:
worktree`), check its base commit before the agent starts work.

## 3. Commit only your own changes

A plain `git commit` once swept another agent's staged files into an unrelated commit. In a
tree that other agents share:

- **Commit with a pathspec:** `git commit -m "<message>" -- path/one path/two`. Never
  `git add -A`, `git add .` or `git commit -a`.
- **In a file someone else is also editing, stage only your hunks.** Make a patch of just your
  change and apply it to the index:

  ```sh
  git diff -U0 -- path/shared.ts > /tmp/mine.patch   # then delete the hunks that are not yours
  git apply --cached --unidiff-zero /tmp/mine.patch
  git diff --cached --stat                            # check exactly what will be committed
  git commit -m "<message>"                           # the index now holds only your hunks
  ```
- **Check before every commit:** `git diff --cached --stat` lists only your files.
- **Small commits.** Finished pieces committed early are what survives an interruption.
- **Never leave a worktree dirty when you stop.** Commit work in progress on your branch with a
  clear "WIP" message rather than leaving loose edits for the next agent to trip over.

## 4. Verify the committed HEAD, not the dirty tree

Agents once reported "tests pass, typecheck clean for my files" while the committed HEAD had
never compiled on its own: the shared working tree held other agents' half-done edits. Only the
server build found out.

The stop gate runs on the working tree. It is a fast first net, not proof that a commit works.
Before you say a commit is good, check it alone:

```sh
sha=$(git rev-parse HEAD)
git worktree add --detach "/tmp/verify-$sha" "$sha"
cd "/tmp/verify-$sha" && <install deps> && <typecheck> && <tests>
cd - && git worktree remove --force "/tmp/verify-$sha"
```

Or push the branch and wait for the pipeline on that exact commit; a green local run proves less.

## 5. Briefs a stopped agent can resume from

A usage limit or a login change once stopped 7–10 background agents mid-task. The work survived
only because finished pieces were committed and a handoff file existed. Give every builder a
brief it could be restarted from, and ask for a report in a fixed shape.

**Builder brief.** Fill it in for every slice you hand to an agent:

```text
SLICE BRIEF (unattended: nobody will answer questions, so decide and write down why)

Repo:       <absolute path>
Worktree:   <absolute path>. Touch nothing outside it.
Branch:     <branch>, cut from <commit>. Commit here. Do not push.
Brief:      docs/ship/briefs/<slug>.md, slice <n>: <one line>
Target:     <this slice's Done-when lines, copied word for word>

How to work
- Start by reading AGENTS.md.
- Stay inside this slice; leave unrelated code alone.
- Order: a check that fails, then the code, then proof on the running app.
- Small commits, by pathspec. Tests are never edited or deleted to get a pass.
- Stuck? Commit what works, and say exactly what fails and what you tried.

Hand back exactly this
- Result: DONE | DONE_WITH_RISKS | NEEDS_DECISION | BLOCKED (+ why, unless DONE)
- Commits: <sha>: <what it does>, one per line
- Proof: every command you ran with its real exit code and summary; screenshot paths
- Choices I made for you: each one, and what it costs if I chose wrong
- Not done yet: what this slice asks for that is still missing (or "nothing")
- Needs you: steps only the human can take, e.g. a key, an account, a production run (or "nothing")
```

"Not done yet" and "Needs you" are different: work the repo could still do means the slice is
not done; a step only the human can take does not make it partial.

## 6. The HANDOFF file

Write `HANDOFF.md` at the repo root before any long absence, before a risky long run, and when
usage is near its limit. Overwrite it; it is a snapshot, not a log.

```markdown
# Handoff <date and time>

## Live now
<commit deployed, URL, how you know (version endpoint, deploy log)>

## In flight
| Agent / slice | Worktree and branch | Last commit | State | Next step |
|---|---|---|---|---|

## Waiting on the human
<decisions, picks, keys, approvals: one line each>

## Running in the background
<watchers, timers, long jobs: what each does, when it stops, how to stop it>

## Do not touch
<files, branches or servers mid-change>

## To resume
1. Read this file, then `git log --oneline -20` and `git worktree list`.
2. Check the live state before calling anything done or not started.
3. Re-dispatch only slices with no commits; never redo committed work.
```

## 7. Watchers and background jobs

A watcher left running from an earlier plan would have unpacked an old release archive over
newer source when its condition finally came true.

- **Time-bounded:** every wait loop has a deadline (`timeout 30m ...`, or a loop that checks
  the clock) and exits when it passes.
- **Idempotent:** before acting, check that the action is still needed and still the right one
  (compare versions or hashes); act once; record that it acted.
- **Stopped when the plan changes,** and listed in HANDOFF while they run.
- **Match processes safely.** `pgrep -f name` inside `ssh host '...'` matched its own command
  line, so a wait loop never ended. Use `ps -eo args | grep "[n]ame"` (the brackets stop grep
  matching itself).
- **Quote and split options with arrays.** zsh does not word-split unquoted variables, so
  `ssh $OPTS host` broke. Use `opts=(-o BatchMode=yes); ssh "${opts[@]}" host`.

## 8. Honest status

The coordinator once told the human that features already built were "not started", because it
read file names instead of the live app and the git log. Before you say "done", "live", "not
started" or "broken":

1. `git log --oneline` (and the branch or worktree it would be on);
2. the build notes and HANDOFF;
3. the **live** state: open the URL, call the version endpoint, read the live logs.

Report status with its evidence:

| Feature | State | Evidence |
|---|---|---|
| <name> | live / merged, not deployed / in progress / not started / broken | <commit, URL + screenshot, log line> |

## 9. The human decides the finish

Mark nothing as accepted. Agents open pull requests, deploy when allowed, and hand over the
proof pack; the human accepts or rejects. Never force-push, never merge without the human's
say-so, never mark someone else's review as answered.
