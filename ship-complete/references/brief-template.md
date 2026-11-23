# Brief: <feature name>

<!--
HOW TO USE THIS TEMPLATE (delete this comment in the real brief)

Copy to docs/ship/briefs/<slug>.md. One brief per feature or product slice. Keep it to one
page: a long spec pins the architecture, not the user's taste, and agents stop following long
instruction files.

1. Interview first. Ask every question below that the conversation has not answered, in ONE
   batch, then stop asking. Use the user's own words wherever you can.
2. Write "None identified" in any section with no real content. Never invent detail to make a
   section look complete.
3. Constraints hold only what the user DECIDED, stated as a requirement. An option you only
   discussed is not a constraint. Builders, including agents that cannot ask, treat this
   section as binding.
4. Show the draft to the user and get a yes before building. Their yes on the Done-when lines
   and on the picked sample is the contract the verifier checks.

Interview question bank (ask only what is still open):
- Who uses this, and what are they trying to get done? What happens today instead?
- Walk me through it: what do you click or say first, and what do you expect to see next?
- What would make you say "this is wrong" the moment you open it?
- Show me 1–3 real products, screens or posts you want this to feel like. What do you like in
  each? Anything you never want to see (looks, words, templates)?
- What should happen on a phone? With no data yet? When something fails?
- Which real accounts, data and integrations must it work with on day one?
- Anything that spends money, publishes, or messages a customer? (It needs your approval.)
- For an AI feature: list the requests you will actually make, in your words. Each becomes an
  eval scenario. What must it never do or say?
- What is out of scope for now?
-->

## Problem
<!-- The problem as the user tells it: who hits it, when, and what it costs them. -->

## Outcome
<!-- The result the user will notice when this works. Describe the effect, never the code. -->

## Done when
<!--
Each line is behaviour a person can SEE on the real, deployed app, in the user's words.
The verifier checks each line, PASS or FAIL, with a screenshot or command output. The proof
pack copies these lines verbatim, so keep one behaviour per line.

Good: "On my phone I paste a reel link and within a minute I see a draft that uses my picked
       look, and the words on screen are the words in the script."
Good: "A customer who says hello gets a greeting back, nothing about an older chat."
Bad:  "Upload endpoint implemented."  (structure, not behaviour)
Bad:  "Looks modern and clean."       (no one can check this: point at the picked sample)
-->
- [ ] 
- [ ] 
- [ ] 

## Picked sample
<!--
For anything visible (a screen, a look, a piece of content): 2–3 real rendered samples were
shown and the user picked one. Path or URL of the pick, and what they said about it. The
verifier compares the live result to this side by side. "Not visible" if nothing is.
-->

## Can't do yet
<!--
The capability check. Every part of the ask that the current stack, engine, provider or plan
cannot do, said plainly, with what happens instead. Never put these in an option, a plan or a
name. "None identified" only after you checked.
-->

## Constraints
<!-- Decisions the user made, as requirements. Approvals needed for money, publishing or
     customer-facing actions. Banned looks, words or templates. -->

## Real-stack proof
<!--
How each Done-when line will be proven on the real stack: which browser journey (phone and
desktop), which real integration call, which real account or test data (marked by fixed IDs,
never by names), which eval scenarios for AI behaviour. Name anything that will NOT be proven
live, and why.
-->

## Slices
<!-- About an hour each, one behaviour each, in build order. Each ends with its check green
     on the real stack. -->
1. 
2. 

## Open questions
<!-- Genuinely unresolved. Leave them open rather than guessing. -->

## Affected users and systems
<!-- Blast radius: the screens, services, data, integrations and people this change reaches. -->
