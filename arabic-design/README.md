# arabic-design — make AI-generated designs render Arabic correctly

**The problem:** every AI tool designs beautiful English — but the moment you add Arabic, the
letters disconnect, words reverse, and diacritics get clipped.
**The root cause:** the AI is tuned for English design, so it applies negative `letter-spacing` —
and Arabic is a *connected* script, so negative tracking shatters it. On top of that it picks fonts
with no Arabic glyphs and gets the RTL direction wrong.
**The fix:** this skill injects the correct rules into your agent — so any design containing Arabic
comes out clean automatically.

Built from rules battle-tested on hundreds of real Arabic designs — every rule in it is a bug that
kept happening and got fixed.

## Install (30 seconds)

**With the `skills` CLI (Claude Code, Codex, Cursor, and 70+ agents):**
```bash
npx -y skills add JamalMohafil/claude-skills --skill arabic-design --agent claude-code
```

**Or manually — one project:**
```bash
mkdir -p .claude/skills/arabic-design
curl -o .claude/skills/arabic-design/SKILL.md \
  https://raw.githubusercontent.com/JamalMohafil/claude-skills/main/arabic-design/SKILL.md
```

**Or manually — all your projects:**
```bash
mkdir -p ~/.claude/skills/arabic-design
curl -o ~/.claude/skills/arabic-design/SKILL.md \
  https://raw.githubusercontent.com/JamalMohafil/claude-skills/main/arabic-design/SKILL.md
```

Then ask for any design containing Arabic — the skill activates on its own and fixes negative
spacing, the font, line-height for diacritics, mixed Arabic+Latin direction, and directional icons.

## What it covers

| Problem | Rule |
|---|---|
| Letters disconnected / crushed together | Never negative *or* positive `letter-spacing` on Arabic |
| Font renders broken | Real Arabic fonts with a correct fallback stack |
| Clipped diacritics | Line-height that clears the diacritics |
| "The words are reversed" | RTL/bidi rules (incl. the `direction:ltr` leak and the `الـ`-before-Latin-word trap) |
| Punctuation on the wrong side | Isolating Latin words + Arabic punctuation |
| Small text disappears on mobile | Minimum size and weight thresholds |

---

**Made by [@jamal_mohafil](https://instagram.com/jamal_mohafil)** — I build with AI and document everything in Arabic.
