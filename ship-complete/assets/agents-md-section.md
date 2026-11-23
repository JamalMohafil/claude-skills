## Ship gate (ship-complete)

This project uses a stop gate. Claude Code runs it automatically when an agent stops. Every
other agent runs it by hand before saying a task is done, and pastes its output:

    python3 .ship/stop_gate.py --manual

It runs the checks in `.ship/config.json` for the packages you touched and prints PASS or what
failed. Add `--all` to run every package's checks.

Before you say "done", "fixed" or "ready":

1. Run the gate and paste its output.
2. Prove the behaviour on the running app: the command you ran and its real output, or a
   screenshot path at phone and desktop size. "Tests pass" on its own is a claim, not proof.
3. Say plainly what you did not verify.

The brief for the current work is in `docs/ship/briefs/`; its "Done when" lines are the target.
The proof pack for the human goes in `docs/ship/proof/<slug>/` (`python3 .ship/proof_pack.py`).

A bug the human reports goes in the ledger first and gets a check that fails because of it,
before any fix:

    python3 .ship/bug_ledger.py add "what the human saw" --bucket ui
    python3 .ship/bug_ledger.py red B-001 --check "what it proves" -- <command that fails today>
    python3 .ship/bug_ledger.py green B-001 -- <same command, passing after the fix>

Never edit, skip or delete a test to make it pass. Mark test data by fixed IDs, never by
names. Commit with pathspecs; never sweep up another agent's files.
