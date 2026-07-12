---
name: arabic-design
description: Make AI-generated designs render Arabic text correctly — clean, connected, professional. Fixes the letter-spacing trap that breaks connected script, wrong font fallbacks, clipped diacritics, and RTL/bidi bugs in mixed Arabic+English text. Use whenever generating or styling ANY Arabic text in HTML/CSS/React/UI — especially when Arabic "looks broken", letters overlap or disconnect, words render in the wrong order, or diacritics get clipped.
---

# Arabic Design — clean Arabic in AI-generated UI

Arabic is a **cursive, connected script**: letters join, and diacritics (ً ّ َ) sit above/below the
baseline. Most AI-generated CSS is tuned for Latin type — and that's exactly what breaks Arabic.
Apply these rules by default whenever the design contains Arabic; don't wait to be told.

## Rule 1 — NEVER negative `letter-spacing` on Arabic (the #1 bug)

Latin design trends love tight tracking (`letter-spacing: -0.02em`). On Arabic, negative tracking
overlaps the letter joins and crushes words into an unreadable blur. Positive tracking is just as
wrong — it *disconnects* letters that must join.

```css
/* ❌ WRONG — crushes connected letters into a blur */
h1 { letter-spacing: -1.5px; }        /* element contains Arabic */

/* ✅ RIGHT */
h1 { letter-spacing: normal; }        /* or 0 — always, for any element containing Arabic */
```

- Any element containing Arabic (or mixed Arabic+Latin) → `letter-spacing: normal`. Full stop.
- Negative/positive tracking is allowed **only** on pure-Latin/numeric elements (big stat numbers,
  `$99`, `VS`, all-caps Latin labels).

## Rule 2 — Use a real Arabic font (never Latin-font fallback)

A Latin font with no Arabic glyphs silently falls back to a system font — mismatched weight, broken
look. Always declare an Arabic-capable font explicitly, with a full stack:

```css
/* pick one that matches the design's mood: */
font-family: "Cairo", "Tajawal", "IBM Plex Sans Arabic", "Noto Kufi Arabic", sans-serif;      /* modern UI */
font-family: "Almarai", "Rubik", "Baloo Bhaijaan 2", sans-serif;                              /* rounded/friendly */
font-family: "Noto Naskh Arabic", "Amiri", serif;                                             /* editorial/classic */
```

- Load the Arabic weights you actually use (400/700 at minimum).
- Never apply `font-style: italic` to Arabic (fake oblique breaks the script) and never rely on
  `text-transform` (Arabic has no case).

## Rule 3 — Line-height must clear the diacritics

Bold display Arabic needs vertical room, or dots/diacritics collide with the line above.

| Context | Safe line-height |
|---|---|
| Display headline (large, bold) | **1.3** |
| Mid headline | 1.35 |
| Body / captions | 1.5–1.7 |

If unsure, go looser. Clipped diacritics are an instant "looks broken" tell.

## Rule 4 — Direction & bidi (the "words are reversed" family of bugs)

- Set direction **once at the root** (`<html dir="rtl">` for Arabic-first pages) — children inherit.
  Don't sprinkle `dir` attributes on every element.
- Use **logical CSS properties** so layout flips correctly: `margin-inline-start`,
  `padding-inline-end`, `text-align: start` — instead of `margin-left`, `text-align: left`.
- Wrap embedded **Latin words/numbers** inside Arabic text in an isolated span so the bidi
  algorithm doesn't reorder them:
  ```css
  .ltr { display: inline-block; direction: ltr; }
  ```
  ```html
  حدد أول <span class="ltr">MVP</span> قبل ما تبدأ
  ```
- **The `direction: ltr` parent leak** (root cause of reversed word order): layout containers set to
  `direction: ltr` for card/column order leak LTR into the Arabic text inside — so
  `Marketplace مدمج` renders as `مدمج Marketplace`. Fix: LTR only for *layout order*; every Arabic
  **text** block inside gets explicit `direction: rtl`.
- **The `الـ` + Latin-word trap:** never place the Arabic definite-article prefix (`الـ`, `بالـ`,
  `للـ`) immediately before an isolated Latin word — the detached letters jump to the wrong side.
  Drop the article (`عبر CLI` not `عبر الـ CLI`) or rephrase.
- Flip directional icons (arrows) in RTL contexts; a "next" arrow points left in Arabic UI.

## Rule 5 — Punctuation & line breaks

- Use Arabic punctuation in Arabic sentences: `؟` not `?`, `،` not `,`.
- If a `?` or `،` floats to the wrong side, the cause is almost always a straddling Latin token —
  wrap it in `.ltr` or rephrase so the sentence doesn't break mid-clause around it.
- When splitting a headline across lines, each line must continue the sentence naturally — Arabic
  readers read stacked lines as one flowing thought.

## Rule 6 — Mobile legibility

Arabic letterforms are denser than Latin at the same px size. For social/mobile canvases
(e.g. 1080px wide), keep body text ≥ ~36–40px and prefer heavier weights (600–800) for display text.

---

## Pre-ship checklist

1. No negative `letter-spacing` on any Arabic-containing selector:
   ```bash
   grep -nE "letter-spacing:\s*-" file.html
   ```
   Every hit must be pure-Latin/numeric. If it wraps Arabic → `normal`.
2. Every Arabic element has an explicit Arabic-capable `font-family`.
3. Display Arabic has line-height ≥ 1.3; body ≥ 1.5.
4. Embedded Latin words/numbers wrapped in `.ltr`; no `الـ/بالـ/للـ` directly before a Latin word:
   ```bash
   grep -noE "(الـ|بالـ|للـ) ?<?[A-Za-z]" file.html
   ```
5. No `direction: ltr` ancestor leaking into Arabic text blocks.
6. **Render and look.** Screenshot the result and inspect: letters connected (not crushed, not
   separated), diacritics not clipped, punctuation on the correct side, word order correct.
