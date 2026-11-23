# Proof pack: {title}

- Brief: {brief}
- Commit: {commit} on {branch} ({tree})
- Live URL: {url}
- Picked sample: {sample}
- Made: {date}

<!--
One page the human reads before testing. Fill it with python3 .ship/proof_pack.py
(new, run, shot, verdict, check). Every verdict needs evidence the human could re-check:
a command with its real output, or a screenshot of the live app at a named viewport.
The human tests only after `proof_pack.py check` says COMPLETE and every row is PASS.
-->

## Done when: verdicts

| # | Done when (the user's words) | Verdict | Evidence |
|---|---|---|---|
{rows}

## Verifier

<!-- The fresh verifier's report: who ran it, on which URL and commit, its PASS/FAIL table and
     blocking issues. Paste it here, or "not run" and why. -->

## Commands run

<!-- proof:commands -->

## Screenshots

<!-- proof:shots -->

## Not verified

<!-- Say plainly what was not checked and why. Write "Nothing" only if that is true. -->

## Decisions made for the user

<!-- Each decision, with what it costs if it is wrong. "None" if there were none. -->

## Can't do yet

<!-- From the brief's capability check, plus anything found while building. -->

## Known issues

<!-- Non-blocking problems found, each with a ledger ID if one was opened. "None" if none. -->
