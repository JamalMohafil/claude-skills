# agent-starter-kit — كل السكيلز والـ MCPs اللي لازم تبلش فيها

بدل ما تدوّر على السكيلات والإضافات وحدة وحدة كل ما تفتح مشروع جديد — **أمر واحد** بيركّبلك
الأساسيات اللي بتخلي أي agent (كلود كود، كودكس، كورسر...) يبلش وهو فعلاً قوي: يلاقي ويركّب
سكيلات لحاله، يسوق متصفح، يفكّر بقواعد، يصمّم واجهات نظيفة (بالعربي كمان)، يراجع كوده، ويأتمت
المتصفح وGitHub.

One command installs the skills + plugins + MCP servers worth having the moment you open a
new agent — instead of hunting each one down.

## التركيب | Install

```bash
# نزّل السكيل (أو انسخ الريبو)
npx -y skills add JamalMohafil/claude-skills --skill agent-starter-kit --agent claude-code

# بعدها شغّل المُركّب من مجلد السكيل:
bash ~/.claude/skills/agent-starter-kit/install.sh
```

خيارات | Options:

```bash
bash install.sh                 # كلود كود — بيركّب كل شي
bash install.sh --agent cursor  # كورسر — بيركّب السكيلز (Tier 1)
bash install.sh --agent codex   # كودكس — بيركّب السكيلز (Tier 1)
bash install.sh --agent '*'     # كل agent متوفّر
bash install.sh --skills-only   # بدون إضافات كلود كود
```

المُركّب **آمن تعيد تشغيله** — كل عنصر بينركّب لحاله، وأي شي ما ينركّب تلقائياً بيطبعلك الأمر
اليدوي بالضبط لتخلّصه.

## شو بينركّب | What it installs

**Tier 1 — سكيلز (بتشتغل على 70+ agent عبر `npx skills`):**
find-skills · agent-browser · karpathy-guidelines · ui-ux-pro-max · caveman · **arabic-design** (تبعنا)

**Tier 2 — إضافات / MCPs (كلود كود فقط):**
frontend-design · superpowers · code-review · playwright (MCP) · github (MCP) · claude-md-management

## ملاحظة صدق | Honest scope

- **Tier 1 عبر كل الـ agents فعلاً** — `npx skills` بيدعم 70+ agent.
- **Tier 2 لكلود كود بس.** كودكس/كورسر ما عندهم "plugins"، بس عنصرين منهم (`playwright`,
  `github`) هم أصلاً MCP servers فيك تضيفهم لكودكس/كورسر عبر إعدادات الـ MCP تبعهم — والمُركّب
  بيقلك هيك لما تمرّر `--agent` مش كلود.

---

**Made by [@jamal_mohafil](https://instagram.com/jamal_mohafil)** — أبني بالـ AI وأوثق كل شي بالعربي.
