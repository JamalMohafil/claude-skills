# Reference 1 — The intake interview + `brand-kit.json`

Run this **before building anything**. Ask in the user's language. Keep it conversational — one section at a time, accept short answers, propose defaults, and let them skip with "defaults." When done, echo a compact summary and get an explicit "yes."

## The questions (ask all; group them so it doesn't feel like a form)

### A. Identity
- Brand or creator name?
- @handle(s) and the platforms they're on?
- One sentence: what do you do / who are you for?
- Niche / industry?
- Primary language? Any secondary language? **Is the primary language right-to-left (Arabic/Hebrew/Farsi)?**

### B. Audience & interests
- Who exactly do you serve? Their level (total beginner → advanced)?
- The 4–8 topics/interests your content covers.
- **1–3 personas** — for each: a short id, a label, what they want, what they're stuck on, and the
  objection they raise before buying. (Offer to derive these from the answer above if they'd rather
  not enumerate. They matter: the radar targets a persona, not "everyone.")

### C. Voice
- Tone/register — formal, casual, a specific dialect or slang? Energetic or calm?
- 2–3 **do's** (how you always sound).
- 2–3 **don'ts** (words/claims/moves you never make).
- Emoji policy (love them / a few / never).
- 1–2 sample lines that sound unmistakably like you (paste real ones if you have them).

### D. Visual identity
- Primary brand color (hex or "pick one for me from X").
- Accent color.
- Default appearance: **dark, light, or both** (with a toggle)?
- Background feel: flat / soft gradient / rich editorial?
- Display font (headlines) + body font. Mono/code font (if you show code/terminals).
- Path to a logo or profile image, if you have one (else we use a placeholder).
- Optional: a **second palette** for a different surface (e.g. dark for social, cream for print/booklets).

### E. Platforms & formats
- Which platforms, in **priority order**?
- Which formats do you make: Reel, Carousel, Story, YouTube long, Short, Presentation/slides, Post, TikTok, LinkedIn…?
- Any custom canvas sizes? (Defaults: carousel 1080×1350, story/short 1080×1920, presentation 1920×1080 or full-screen responsive, square 1080×1080.)

### F. Strategy
- Your content **pillars** and their **ratio** (e.g. 70% teaching / 20% behind-the-scenes / 10% offer).
- ⭐ **Brand associations — 2–4 things you want to be known for.** Ask it as: *"if someone described
  you to a friend in three words, which three do you want?"* For each, a one-line **test** you can
  apply to a piece ("does this show me actually building, not explaining?"). **This becomes a hard
  gate**: an idea that reinforces none of them is dropped by the radar rather than logged. It is the
  difference between an idea feed that sharpens your positioning and one that dilutes it.
- Your **funnel stages** (default: `reach` → `trust` → `conversion`) and the goal of each.
- Your **offers** — for each: an id, a name, the CTA keyword(s) if you gate by comment/DM, the main
  objection and your answer to it. Mark exactly one as the default CTA.
- Your default **CTA**, and the **destination** you funnel to (community / product / waitlist / newsletter).
- Is it **one CTA per piece**? Any CTA you must never mix?
- **Is a no-CTA piece acceptable?** (Usually yes. Say so explicitly — otherwise the AI invents an
  invite to fill the field on every single piece.)

### G. Radar (the trend scout)
- The **topics/keywords** the radar should scout for content ideas.
- **Sources / competitors / handles** to watch (news sites, X accounts, creators, subreddits…).
- **Daily scan time** (e.g. 09:00 local).
- **Hard filters / no-gos** — topics the radar must NEVER surface (legal, ethical, off-brand).

### H. Grounding & goals (the proof bank)
- Real projects / ventures / offers to **ground content in** (so it's proof-driven, not generic).
- ⭐ **Proof points you can actually stand behind** — real numbers, shipped things, verifiable
  results. This list is what the AI is allowed to cite. Anything not on it must be framed as
  build-in-public or left out. Ask explicitly: **"is there anything you used to say that you no
  longer want repeated?"** (retired claims, outdated numbers, a client you can't name) — those go in
  the no-gos, not the proof bank.
- Your **goal metric** (followers, subscribers, revenue, launches).

### I. Analytics & competitors (optional layer — skip cleanly if they don't want it)
- Do you want your **own posts pulled into the OS** (numbers, comments, playback) so you don't open Instagram/YouTube to check performance?
- Which accounts? **Instagram must be a Business/Creator account linked to a Facebook Page** — a personal account cannot use the API at all. YouTube needs the channel id.
- Which credentials do you have or can create: a **Meta app** (app id + secret + access token + IG account id), a **YouTube Data API key**, an **OpenAI key** (for transcription)? If they have none, offer to write setup guides and stub the tabs until keys arrive.
- Which **competitors/creators** do you want to study? (YouTube @handles or channel URLs; Instagram usernames — they must also be Business/Creator accounts to be readable.)
- **Transcription cost preference:** free YouTube captions where available + OpenAI only for Instagram (cheaper), or always OpenAI for one consistent engine?
- Be upfront about the limits before they answer: a competitor's **private** metrics (reach, retention, audience) are not available from any API — you get their hooks, public view/like/comment counts, and transcripts. And **per-post audience demographics don't exist even for your own posts** (account-level only).

### J. Ops
- Package manager: pnpm / npm / yarn?
- Can your agent run shell commands + a local dev server?
- **Which coding agent is running this, and can it invoke ITSELF headlessly** — i.e. is there a non-interactive CLI (like `claude --print`, `codex exec`, `cursor-agent -p`) that a Node process can `spawn`? (This decides whether the Generate/Radar buttons run automatically or fall back to prompt-handoff.) If yes, note its **binary name**, its **streaming/JSON flag** (or "plain text"), and its **auto-approve/non-interactive flag**.
- Scheduler available? macOS→launchd or cron, Linux→cron, Windows→Task Scheduler, or "none / I'll run radar manually."
- Any connectors to wire (optional): Notion (calendar import), Buffer/Blotato (scheduling), etc.
- **Publishing** — do you want the OS to *draft and schedule* posts through a connector, or just hand
  you the assets + caption to post yourself (the default)? State the rule back to them either way:
  **nothing is ever posted to a live account without an explicit go-ahead at that moment.** → reference 8.

## Storage — `content-os/brand-kit.json`

Write every answer here. **This is the single source of truth for every AI surface in the OS** — the
renderer in reference 7 turns it into the prompt block that generation, radar, chat, hooks and edit
all read fresh on every request. Editing this file changes what the whole system knows; no route code
is touched. Fill unknowns with sensible defaults and mark them `"_default": true` so you can revisit.

⚠️ **Two rules that the rest of the build depends on:**
1. **Every `id` here is a taxonomy value.** `ideas-core.mjs` validates `pillar_id`, `persona_ids`,
   `funnel_stage`, `brand_associations` and `suggested_cta_id` against these exact strings and
   **rejects anything else**. Use short, stable, kebab-case ids and don't rename them casually.
2. **This file is human-controlled. The AI reads it and may propose changes — it must never write
   it.** Serve it read-only (`GET /api/strategy`, no POST/PATCH/DELETE) and show it in a read-only
   Strategy view. A system that can rewrite its own guardrails doesn't have any.

```json
{
  "identity": {
    "name": "", "handles": {"instagram": "", "youtube": "", "tiktok": ""},
    "tagline": "", "niche": "",
    "language": {"primary": "ar", "secondary": ["en"], "rtl": true}
  },
  "audience": {
    "who": "", "level": "beginner-to-intermediate", "topics": [],
    "personas": [
      {"id": "", "label": "", "priority": 1, "wants": [], "pains": [],
       "objection": "", "objection_answer": ""}
    ]
  },
  "voice": {
    "tone": "", "register": "", "dos": [], "donts": [],
    "emoji": "none|some|love", "samples": []
  },
  "visual": {
    "colors": {"primary": "#7c3aed", "accent": "#a78bfa", "bg": "#0a0613", "text": "#ece7f8"},
    "theme": "dark|light|both",
    "background": "gradient",
    "fonts": {"display": "Cairo", "body": "Cairo", "mono": "JetBrains Mono"},
    "logo": "content-os/assets/logo.png",
    "secondPalette": null
  },
  "platforms": {"order": ["instagram","youtube","tiktok"], "formats": ["Reel","Carousel","Story","Presentation","Post"]},
  "canvas": {"carousel": [1080,1350], "story": [1080,1920], "presentation": [1920,1080], "square": [1080,1080]},
  "strategy": {
    "pillars": [
      {"id":"teach","label":"","ratio":70,"funnel":"reach","description":"","examples":[]},
      {"id":"journey","label":"","ratio":20,"funnel":"trust","description":"","examples":[]},
      {"id":"offer","label":"","ratio":10,"funnel":"conversion","description":"","examples":[]}
    ],
    "associations": [
      {"id":"", "label":"", "test":"one line: how do I check a piece reinforces this?"}
    ],
    "funnel": [
      {"id":"reach","label":"","goal":""},
      {"id":"trust","label":"","goal":""},
      {"id":"conversion","label":"","goal":""}
    ],
    "offers": [
      {"id":"", "name":"", "is_default_cta": true, "keywords": [],
       "objection": "", "objection_answer": ""}
    ],
    "cta_library": [{"id":"", "label":"", "text":""}],
    "cta_rule": "one sentence: where you sell and where you never sell",
    "cta_destination": "", "one_cta_per_piece": true, "no_cta_is_valid": true, "never_mix": [],
    "idea_scoring": null
  },
  "radar": {"topics": [], "sources": [], "handles": [], "scan_time": "09:00", "no_gos": []},
  "grounding": {"projects": [], "proof_points": [], "retired_claims": [], "goal_metric": ""},
  "analytics": {
    "enabled": true,
    "instagram": {"business_account": true, "ig_account_id": "", "meta_app_id": "", "has_token": false},
    "youtube": {"channel_id": "", "has_api_key": false, "private_analytics_oauth": false},
    "transcription": {"engine": "captions-first|always-openai", "has_openai_key": false},
    "competitors": [{"platform": "youtube|instagram", "handle": "", "note": ""}]
  },
  "ops": {"pm": "pnpm", "shell": true, "scheduler": "launchd|cron|task-scheduler|none", "connectors": [],
    "agent": {"name": "claude", "bin": "claude", "headless_self_spawn": true,
      "stream_flags": ["--print","--verbose","--output-format","stream-json"],
      "auto_approve_flag": "--dangerously-skip-permissions", "max_turns": 60}}
}
```

## Defaults you may offer (so the user can move fast)
- Theme: **both** (dark default + toggle). Fonts: a clean display font + JetBrains Mono. Background: soft gradient.
- Pillars: 70 teach / 20 journey / 10 offer. One CTA per piece: **yes**. No-CTA valid: **yes**.
- Funnel: `reach` → `trust` → `conversion`. Personas: derive 2 from the audience answer and read them back.
- Associations: propose 3 from their tagline + niche and let them correct — this one is worth the extra minute.
- Canvas: the standard sizes above. Scan time: 09:00. PM: pnpm.
- If the user picks a primary color only, derive accent (lighter tint), bg (very dark tint of primary for dark / near-white for light), and text (near-white / near-black) automatically — see reference 2's palette derivation.

## Checkpoint before building anything

```bash
node -e "const k=require('./content-os/brand-kit.json');
 const ids=o=>(o||[]).map(x=>x.id);
 console.log('pillars     ', ids(k.strategy.pillars));
 console.log('associations', ids(k.strategy.associations));
 console.log('funnel      ', ids(k.strategy.funnel));
 console.log('personas    ', ids(k.audience.personas));
 console.log('ctas        ', [...ids(k.strategy.cta_library), ...ids(k.strategy.offers)]);
 console.log('proof items ', (k.grounding.projects||[]).length + (k.grounding.proof_points||[]).length);"
```
Every list must be non-empty and every id a real string — **no blanks, no `undefined`**. These are
the exact values `ideas-core.mjs` validates against; an empty `associations` list silently disables
the intentionality gate, and an empty proof bank means the AI has nothing real to stand on and will
reach for invention.

Then read the summary back to the user in their language and **get an explicit "yes" before Stage 2.**
