---
name: youtube-chapters
description: Use when someone gives a YouTube link (or a local video/audio file) and wants chapter timestamps, a chapter list, video sections, a timeline, or timestamps for the description — including Arabic/RTL videos. Triggers on "get timestamps", "make chapters", "YouTube chapters", "split this video into sections", "توقيتات", "فصول", "شبترات للفيديو".
---

# YouTube Chapters

## Overview

Turn any video into ready-to-paste YouTube chapters. Two moves:

1. **Run the helper** to get a clean, timestamped transcript.
2. **You cut it into chapters** and output them in the exact format below.

The script handles fetching/transcribing (any language). The chaptering judgment — where topics change and what to call them — is yours.

## When to use

- A **YouTube URL** (any language) and they want chapters / timestamps / sections.
- A **local video or audio file** ("here's my video, timestamp it").
- A **transcript or SRT they paste** — skip Step 1, go to Step 2.

Not for: summarizing without timestamps (that's just a summary), or cutting/editing the video.

## Step 1 — Get a timestamped transcript

```
python3 scripts/transcript.py "<youtube-url-or-file-path>"
```

Options: `--lang ar` (force a language), `--window 12` (seconds per line), `--out t.txt` (also save it).

It prints `TITLE`, `DURATION`, `LANGUAGE`, `SOURCE`, then `M:SS⇥text` lines:
- **YouTube with captions** → pulled via `yt-dlp` (fast: subtitle track only, no video download, no speech-to-text). Manual subtitles beat auto-captions.
- **Local file, or a video with no captions** → Whisper speech-to-text, using whatever is present: `GROQ_API_KEY` or `OPENAI_API_KEY` (Whisper API), else `pip install faster-whisper`, else the `whisper` CLI. If none exists, the script prints exactly what to install.

Read the **whole** transcript before chaptering, and note `DURATION` — the last chapter must start before it.

## Step 2 — Cut it into chapters (your judgment)

- Mark where the **topic changes**, not every sentence. Aim for one chapter every ~1–3 minutes — more for long videos, **never fewer than 3**.
- Set each chapter's time to the transcript timestamp where that topic **starts** (use that line's `M:SS`).
- The **first chapter is always `0:00`** — retitle the opening; never invent a line before 0:00.
- Keep chapters **≥ ~10s apart**; the last one must start **before `DURATION`**.
- **Titles:** short, specific, scannable — say what the section delivers (a question or a payoff beats a vague noun). Write them in the video's spoken language; for Arabic keep it natural dialect (RTL), not formalized.
- Keep tech/brand terms in **Latin** for search: `Claude Code`, `Next.js`, `API`, `GitHub`, `Vercel`, `MCP`.
- Never invent content that isn't in the transcript.

## Step 3 — Output format (do exactly this)

**Default — YouTube standard, timestamp first, one per line:**

```
0:00 <title>
0:24 <title>
1:05 <title>
```

YouTube only shows chapters when: the first line is `0:00`, there are **≥ 3** lines, and each is **≥ 10s** after the previous. Break any of these and no chapters appear.

Deliver as plain lines (no code fence unless asked) and save to `<video-title-slug> - youtube chapters.txt`.

**Variant — timestamp at the END** (`<title> 0:00`): some creators, often Arabic/RTL channels, put the time last and report YouTube still accepts it. Use this **only if the creator confirms it works on their channel**; otherwise use the standard above. The `0:00` / ≥3 / ≥10s rules still apply.

## Quick reference

| Input | What runs | Needs |
|---|---|---|
| YouTube URL, has captions | `yt-dlp` subtitle pull | yt-dlp, ffmpeg |
| YouTube URL, no captions | audio + Whisper | + one Whisper option |
| Local video / audio file | ffmpeg audio + Whisper | + one Whisper option |
| Pasted transcript / SRT | skip Step 1 | — |

## Common mistakes

- **First chapter not `0:00`** → YouTube shows no chapters. Always start at 0:00.
- **A chapter per sentence** → cut on topic shifts, aim for 1–3 min apart.
- **Time before speech or after the end** → keep every chapter within `[0:00, DURATION)`.
- **Formalizing Arabic titles** → keep the creator's natural wording; only tech terms in Latin.
- **Quoting a caption as the title** → titles describe the section, they don't transcribe it.
