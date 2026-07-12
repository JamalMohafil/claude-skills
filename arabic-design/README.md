# arabic-design — سكيل يخلي تصاميم الـ AI تطلع بعربي سليم

**المشكلة:** كل أدوات الـ AI بتصمم إنجليزي حلو — وأول ما تكتب عربي: الحروف بتتقطع، الكلمات بتنعكس، والتشكيل بينقص.
**السبب الأساسي:** الـ AI متعود على التصميم الإنجليزي فبيحط `letter-spacing` سالب — والحروف العربية متصلة، فالمسافة السالبة بتكسرها. وفوقها خطوط ما بتدعم العربي وأخطاء اتجاه (RTL).
**الحل:** هالسكيل بيحقن القواعد الصح بكلود — فأي تصميم فيه عربي بيطلع سليم تلقائياً.

بُني من قواعد مجرّبة على مئات التصاميم العربية الحقيقية — كل قاعدة فيه كانت غلطة متكررة وانحلت.

## التركيب (٣٠ ثانية)

**Claude Code — لمشروع واحد:**
```bash
mkdir -p .claude/skills/arabic-design
cp SKILL.md .claude/skills/arabic-design/SKILL.md
```

**Claude Code — لكل مشاريعك:**
```bash
mkdir -p ~/.claude/skills/arabic-design
cp SKILL.md ~/.claude/skills/arabic-design/SKILL.md
```

بعدها اطلب أي تصميم فيه عربي — السكيل بيشتغل لحاله، وبيصلح: المسافات السالبة، الخط، ارتفاع السطر للتشكيل، اتجاه النص المختلط (عربي + إنجليزي)، والأيقونات الاتجاهية.

## شو بيغطي

| المشكلة | القاعدة |
|---|---|
| حروف متقطعة/متلاصقة | ممنوع `letter-spacing` سالب أو موجب على العربي |
| خط بيطلع مكسور | خطوط عربية حقيقية مع fallback صحيح |
| التشكيل مقصوص | line-height بيفسح للتشكيل |
| «الكلمات معكوسة» | قواعد الـ RTL والـ bidi (بما فيها تسريب `direction:ltr` وفخ «الـ» قبل الكلمة الإنجليزية) |
| علامات الترقيم بالجهة الغلط | عزل الكلمات اللاتينية + ترقيم عربي |
| نص صغير بيختفي عالموبايل | حدود دنيا لحجم ووزن الخط |

---

**Made by [@jamal_mohafil](https://instagram.com/jamal_mohafil)** — أبني بالـ AI وأوثق كل شي بالعربي.

*English: A Claude skill that makes AI-generated designs render Arabic correctly — fixes the
negative letter-spacing trap that breaks connected script, wrong font fallbacks, clipped
diacritics, and RTL/bidi bugs. Drop `SKILL.md` into `.claude/skills/arabic-design/` and any
design containing Arabic comes out clean automatically.*
