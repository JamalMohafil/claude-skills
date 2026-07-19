# Claude Skills — @jamal_mohafil

سكيلز لكلود بتحل مشاكل حقيقية انحرقت فيها وأنا أبني — مش نظريات. كل سكيل هون مستخدم فعلياً بشغلي اليومي.

Skills for Claude built from real problems I hit while building — every rule in them is a bug that
actually happened and got fixed. Each skill is used daily in my own work.

## السكيلز | Skills

| Skill | شو بيعمل | What it does |
|---|---|---|
| [`agent-starter-kit`](./agent-starter-kit/) | أمر واحد بيركّب كل السكيلز والـ MCPs اللي لازم تبلش فيها أي agent (كلود كود، كودكس، كورسر) | One command installs the essential starter skills + Claude Code plugins/MCPs across 70+ agents |
| [`arabic-design`](./arabic-design/) | بيخلي تصاميم الـ AI تطلع بعربي سليم — بيصلح فخ الـ letter-spacing، الخطوط، التشكيل، وأخطاء الـ RTL | Makes AI-generated designs render Arabic correctly — fixes the letter-spacing trap, font fallbacks, clipped diacritics, and RTL/bidi bugs |

*(المزيد جاي — تابعني لتعرف أول ما ينزل سكيل جديد | more coming)*

## التركيب | Install

**سكيل واحد لكل مشاريعك (global):**
```bash
mkdir -p ~/.claude/skills/arabic-design
curl -o ~/.claude/skills/arabic-design/SKILL.md \
  https://raw.githubusercontent.com/JamalMohafil/claude-skills/main/arabic-design/SKILL.md
```

**أو لمشروع واحد (project):**
```bash
mkdir -p .claude/skills/arabic-design
curl -o .claude/skills/arabic-design/SKILL.md \
  https://raw.githubusercontent.com/JamalMohafil/claude-skills/main/arabic-design/SKILL.md
```

بعدها افتح Claude Code واطلب شغلك عادي — السكيل بيشتغل لحاله وقت الحاجة.
Then just use Claude Code normally — the skill activates automatically when relevant.

---

**Jamal Mohafil** — أبني بالـ AI وأوثق كل شي بالعربي
[Instagram @jamal_mohafil](https://instagram.com/jamal_mohafil) · [jamalmohafil.com](https://jamalmohafil.com/links)
