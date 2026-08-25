# youtube-chapters

Give your AI agent a **YouTube link** (or a local **video/audio file**) and get
**ready-to-paste chapter timestamps** for the description — in any language,
Arabic/RTL included.

It's a two-step skill:

1. `scripts/transcript.py` fetches a **clean, timestamped transcript**
   - YouTube with captions → pulled with `yt-dlp` (subtitle track only — no video download, no transcription). Manual subs preferred over auto-captions.
   - Local file, or a video with no captions → **Whisper** speech-to-text.
2. The agent reads that transcript and **cuts it into chapters** (topic changes,
   first chapter at `0:00`, ≥3 chapters, sensible titles), then formats them for YouTube.

## Use it

Once installed, just ask your agent in plain language:

> "Make YouTube chapters for https://youtu.be/… "
> "Here's my video — timestamp it into sections."
> "سوّيلي توقيتات لهالفيديو"

Or run the transcript engine directly:

```bash
python3 scripts/transcript.py "https://www.youtube.com/watch?v=VIDEO_ID"
python3 scripts/transcript.py ./my-video.mp4 --lang ar --window 12
```

## Requirements

- **`yt-dlp`** and **`ffmpeg`** on your PATH (`pip install -U yt-dlp`).
- For local files or videos **without captions**, one Whisper option:
  - `GROQ_API_KEY` or `OPENAI_API_KEY` (Whisper API), **or**
  - `pip install faster-whisper`, **or**
  - the `whisper` CLI (`pip install -U openai-whisper`).

  The script tells you exactly what to install if none is present.

## Install

```bash
npx -y skills add JamalMohafil/claude-skills --skill youtube-chapters --agent claude-code
```

Or copy the folder into your agent's skills directory (e.g. `~/.claude/skills/youtube-chapters/`).

---

**Jamal Mohafil** · [Instagram @jamal_mohafil](https://instagram.com/jamal_mohafil) · [jamalmohafil.com](https://jamalmohafil.com/links)
