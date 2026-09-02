# Reference 2 — Brand knowledge base + design system

Everything reads from `brand-kit.json`. This stage produces the docs the AI generation grounds in, plus the design tokens the app and the exported assets share.

## 2a. Brand knowledge base — `content-os/brand/`

Generate these markdown docs from the interview answers. Keep them tight and real (no filler). The app displays them (Brand view) and every generation prompt reads them.

- **`identity.md`** — name, handle(s), tagline, niche, audience, positioning, goal metric, the real projects to ground in.
- **`voice.md`** — tone/register, the do's and don'ts (as hard rules), emoji policy, the sample lines, language + RTL note. This governs HOW content sounds.
- **`strategy.md`** — pillars + ratio, the platform priority, the default CTA + destination, the "one CTA per piece" rule, what never to mix.
- **`visual-system.md`** — the palette(s), fonts, canvas sizes, and any surface rules (e.g. dark palette for social, cream for print). Points at `design-tokens.css`.
- **`no-gos.md`** — the hard filters: forbidden topics, banned words/claims, privacy rules. Referenced by radar + every generation prompt.

## 2b. Design tokens — `content-os/app/src/app/design-tokens.css`

Define the tokens **once** here (imported by `globals.css`) and derive them from `visual.colors`. The standalone export HTML **cannot** share this file over `file://` (no bundler, brittle relative paths, dev server absent during export) — so the scaffold **inlines the same `:root{…}` block + a font `<link>`** into every generated piece (reference 4). The "single source" is the copied token values, not a shared file loaded over `file://`.

**Palette derivation** (when the user gave only a primary):
- `--accent` = primary lightened ~25% (or the user's accent).
- Dark theme: `--bg` = a very dark desaturated tint of primary; `--text` = near-white (`#ece7f8`-ish); `--muted` = mid tint; `--surface` = translucent dark tint of primary.
- Light theme: `--bg` = near-white tint of primary; `--text` = near-black tint of primary; surfaces = translucent primary at low alpha.
- Always define theme-aware **field** + **hover** tokens so form controls never render as flat gray in light mode (a real bug worth pre-empting):

```css
:root { /* dark (default) */
  --bg: /* gradient or solid from primary */;
  --text:#ece7f8; --text-dim:#a99fc9; --muted:#7a6da6;
  --primary:#7c3aed; --accent:#a78bfa; --accent-2:#c4b5fd;
  --surface: rgba(30,18,55,.55); --border: rgba(167,139,250,.18);
  --win: rgba(18,11,34,.78);
  --field: rgba(167,139,250,.06); --field-brd: rgba(167,139,250,.16); --field-focus:#a78bfa; --hov: rgba(167,139,250,.14);
  --green:#34d399; --code-bg: rgba(124,58,237,.2);
}
:root.light { /* overrides — toggled by adding class="light" on <html> */
  --bg:/* light */; --text:#1e0f3c; --text-dim:#3a2a63; --muted:#7a6da6;
  --surface: rgba(255,255,255,.62); --border: rgba(124,58,237,.16); --win: rgba(255,255,255,.86);
  --field: rgba(124,58,237,.05); --field-brd: rgba(124,58,237,.16); --field-focus:#7c3aed; --hov: rgba(124,58,237,.09);
}
.field{background:var(--field);border:1px solid var(--field-brd);border-radius:12px;transition:border-color .15s,background .15s}
.field:focus,.field-wrap:focus-within{border-color:var(--field-focus);outline:none}
.hov:hover{background:var(--hov)}
```
Swap the hexes for the user's. Keep the **token names stable** — the app and templates reference them.

**Theme toggle (no-flash):** the app toggles `document.documentElement.classList.toggle("light")` and persists to `localStorage`; a tiny inline script in the HTML `<head>` applies the saved theme before paint. Provide both dark and light unless the user chose one.

**Fonts:** load via CSS `@import url(...)` from Google Fonts (avoids build-time font pipelines that break some bundlers). Display + mono per the kit. The `@import url(...)` must be the **very first line** of `globals.css` — before `@import "tailwindcss"` and before any selector — or Tailwind v4 / Lightning CSS silently drops it and the brand fonts never load.

## 2c. RTL (only if `language.rtl` is true)

- Set `dir="rtl"` + `lang` on the **root** `<html>`. Direction inherits — never hardcode `dir` on individual components.
- Use logical Tailwind/CSS properties: `ms-*/me-*`, `ps-*/pe-*`, `start-*/end-*`, `text-start/text-end` — not `ml-*/text-left`.
- Flip directional icons (arrows/chevrons) by language, not by patching `dir`.
- **Never apply negative `letter-spacing` to Arabic/Farsi** — it crushes the letters. Give diacritics room with slightly larger `line-height`.
- Fix bidi glitches (floating punctuation around embedded English) by rewriting the sentence so it doesn't straddle an embedded LTR word mid-clause — not with inline `dir`.

## 2d. Two-surface palettes (optional, if `visual.secondPalette` set)
Scope palettes by surface: e.g. dark-editorial for social assets, cream-editorial for print/booklets. Each builder picks the palette its format uses. Keep one shared font + icon set across both.
