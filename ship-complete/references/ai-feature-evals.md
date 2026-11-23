# Evals for AI features

Read this when the feature's output comes from a model: a reply bot, an assistant, a
generator, a classifier, an agent with tools. Unit tests cannot judge those answers; an eval
can.

Why: in one real build, 17 of 89 owner-found failures (19%) were wrong AI answers, and most of
the 17 "missing abilities" showed up as the assistant refusing a job. The assistant's eval was
built only in week eight, from that day's failures. Before that, each failure was patched with
another "never do X" line in the prompt, until the prompt had to be rewritten from scratch.

## 1. Build the set from real failures, not imagination

- **Start with 20–50 simple scenarios drawn from real failures.** That is enough to start
  gating; grow it from there.
- **Do the error analysis yourself first.** It is the most important part of evals. Label at
  least 30 real traces yourself: read each conversation, mark it pass or fail, and write down
  *why* it failed. The failure types you
  find are the scenarios you need.
- **Write the jobs list once.** Ask the human for every request they will actually make, in
  their words ("open the site on the left", "approve this one", "make it an animated video").
  Each job becomes a scenario. Jobs the system cannot do yet are said plainly in the brief's
  "Can't do yet", never promised.
- **Every human-reported AI bug becomes a scenario before the prompt changes** (Step 8). The
  scenario's `why` names the real failure.

## 2. Scenario shape

Keep scenarios as data next to the code (for example `evals/scenarios/*.json`):

```json
{
  "id": "greeting-returning-contact",
  "why": "A returning customer said hello and got asked about an old project as if it were current.",
  "input": [{"role": "user", "content": "hello, how are you?"}],
  "context": {"contact": "returning", "previous_topic": "an earlier quote"},
  "hard_rules": [
    {"rule": "reply is a greeting", "check": "judge"},
    {"rule": "does not mention the previous topic", "check": "not_contains", "value": "quote"},
    {"rule": "no phone number or email in the reply", "check": "regex_absent", "value": "\\+?\\d[\\d\\s-]{7,}|@"}
  ],
  "scored": [{"criterion": "sounds like a person, not a template", "check": "judge"}]
}
```

- **Check actions, not only words.** When the AI uses tools, assert on the tool calls and the
  artifacts. In one build the model claimed it "wrote every slide's text" without writing one.
- **Prefer code checks** (contains, regex, JSON shape, tool called with these arguments, file
  exists). Use a model judge only for what code cannot check.
- **Pass/fail labels, not 1–10 scores.** They are faster to agree on and easier to trust.

## 3. Trust the judge only after checking it

AI judges are measurably biased by answer position, by length, and toward their own outputs. Before a judge gates
anything, run it on 20–30 examples the human labelled and compare. Re-check when the judge's
model or prompt changes. Rule of thumb: a judge that disagrees with the human on more than
about one hard-rule label in ten is not ready to gate.

## 4. The gate: hard rules k of k, and no drop in score

Two numbers, because "every check passes" never happens. In one build even the accepted prompt
scored 448 of 451, so a gate that required everything to pass would have blocked every deploy.

1. **Hard rules must pass in all k runs** (k = 3 for anything customer-facing). Use pass^k, not
   pass@k: an answer right 75% of the time passes all 3 runs only about 42% of the time, so
   flaky behaviour cannot sneak through on a lucky run. Typical hard rules:
   - no leaked phone numbers, emails or private data;
   - no invented facts, prices, numbers or claims about the system's state (never say ads are
     running unless the system says so);
   - no hand-off or refusal where the policy says to answer;
   - answer in the user's language; the human's style rules;
   - a constraint the user stated survives into the next plan;
   - on-screen or published text comes only from the approved script.
2. **The total score must not fall below the last accepted run.** Keep the last accepted run's
   per-scenario results in a baseline file (for example `evals/baseline.json`). Update it only
   when the human accepts a run.

```
gate(run):
  for scenario in run:
      if any(hard_rule failed in any of the k trials): FAIL (name the scenario and rule)
  if run.score < baseline.score: FAIL (list scenarios that got worse)
  PASS
```

**Run it on every change to a prompt, a tool, a model or the retrieval.** The k-run version
costs real quota; run it on those changes, not on every commit.

## 5. Keep it alive

- **Every week:** an agent labels about 30 real conversations, the human confirms the labels,
  and each new failure type becomes a scenario.
- **Regression scenarios** should pass nearly 100% of the time. A regression scenario that
  starts failing is a bug, not noise.
- **Check the eval catches things:** now and then, break the prompt on purpose (drop a rule) and
  confirm the eval fails. An eval that passes everything is not checking anything. (For code,
  the same idea is mutation testing: break the code on purpose and confirm a test fails.)
- **Keep prompts lean.** When a failure is fixed by a scenario plus a small prompt change, the
  prompt stays short. Stacked "never" lines make prompts long, contradictory and stale.
- **Prune monthly:** remove scenarios and rules that no longer match the product.

## 6. Over-promising is an eval failure too

The capability check (Step 3) applies inside the product. If the AI is asked for something the
engine cannot make, it says so plainly and never puts it in an option, a plan or a draft's name.
When it delivers, it lists what was not applied. In one build an assistant promised shapes from
a reference video that the renderer could not draw, named the draft after them, and showed a
hardcoded preview that had nothing to do with the reference. Write a scenario for that.
