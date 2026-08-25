#!/usr/bin/env python3
"""
transcript.py — get a clean, timestamped transcript for a YouTube URL or a local
media file, so an AI agent can turn it into YouTube chapters.

    python3 transcript.py "https://www.youtube.com/watch?v=..."
    python3 transcript.py ./my-video.mp4 --lang ar --window 12

Output (stdout):

    TITLE: ...
    DURATION: 1120  (18:40)
    LANGUAGE: en
    SOURCE: manual subtitles (en)
    ----
    0:00	first line of speech ...
    0:11	next chunk of speech ...
    ...

How it gets the transcript, in order of preference:
  1. YouTube URL with captions  -> yt-dlp downloads the subtitle track only
     (no video download, no speech-to-text). Manual subs beat auto-captions.
  2. Local file, or a video with NO captions -> Whisper speech-to-text, using
     whatever is available: GROQ_API_KEY or OPENAI_API_KEY (Whisper API),
     else the `faster-whisper` Python package, else the `whisper` CLI.

Requirements: yt-dlp + ffmpeg on PATH. (STT fallback needs one Whisper option.)
"""

import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile


def eprint(*a):
    print(*a, file=sys.stderr)


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def have(binary):
    return shutil.which(binary) is not None


def is_url(s):
    return s.startswith("http://") or s.startswith("https://")


def fmt(sec):
    sec = int(round(sec))
    h, r = divmod(sec, 3600)
    m, s = divmod(r, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def clean_text(s):
    s = re.sub(r"<[^>]+>", "", s)          # vtt inline tags
    s = s.replace("\n", " ").replace("&nbsp;", " ")
    s = re.sub(r"\s+", " ", s)
    return s.strip()


# ── subtitle parsing ────────────────────────────────────────────────────────
def parse_json3(path):
    data = json.load(open(path, encoding="utf-8"))
    segs = []
    for ev in data.get("events", []):
        t = ev.get("tStartMs")
        parts = ev.get("segs")
        if t is None or not parts:
            continue
        text = clean_text("".join(p.get("utf8", "") for p in parts))
        if text:
            segs.append((t / 1000.0, text))
    return segs


def _vtt_ts(ts):
    ts = ts.replace(",", ".")
    parts = ts.split(":")
    parts = [float(p) for p in parts]
    while len(parts) < 3:
        parts.insert(0, 0.0)
    h, m, s = parts[-3], parts[-2], parts[-1]
    return h * 3600 + m * 60 + s


def parse_vtt(path):
    segs = []
    cur_t = None
    buf = []
    for line in open(path, encoding="utf-8", errors="ignore"):
        line = line.rstrip("\n")
        m = re.match(r"(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->", line)
        if m:
            if cur_t is not None and buf:
                txt = clean_text(" ".join(buf))
                if txt:
                    segs.append((cur_t, txt))
            cur_t = _vtt_ts(m.group(1))
            buf = []
        elif line.strip() and not line.strip().isdigit() and "WEBVTT" not in line and "-->" not in line:
            buf.append(line)
    if cur_t is not None and buf:
        txt = clean_text(" ".join(buf))
        if txt:
            segs.append((cur_t, txt))
    return segs


# ── cleaning: dedupe rolling captions and bucket into windows ────────────────
def _merge(acc, s):
    """Append s to acc, dropping any word-overlap (rolling auto-captions)."""
    if not acc:
        return s
    aw, sw = acc.split(), s.split()
    if s.lower() in acc.lower():
        return acc
    for k in range(min(len(aw), len(sw), 14), 0, -1):
        if [w.lower() for w in aw[-k:]] == [w.lower() for w in sw[:k]]:
            return acc + " " + " ".join(sw[k:])
    return acc + " " + s


def compact(segs, window):
    # drop exact consecutive duplicates first
    dedup = []
    for t, txt in segs:
        if dedup and dedup[-1][1] == txt:
            continue
        dedup.append((t, txt))
    if window <= 0:
        return dedup
    out = []
    start = None
    acc = ""
    for t, txt in dedup:
        if start is None:
            start, acc = t, txt
        elif t - start >= window:
            out.append((start, acc))
            start, acc = t, txt
        else:
            acc = _merge(acc, txt)
    if acc:
        out.append((start, acc))
    return out


# ── YouTube path (captions via yt-dlp, no video download) ────────────────────
def pick_lang(available, want):
    if not available:
        return None
    if want:
        for a in available:
            if a == want or a.startswith(want + "-") or a.startswith(want):
                return a
    for pref in ("en", "ar"):
        for a in available:
            if a == pref or a.startswith(pref + "-") or a.startswith(pref):
                return a
    return available[0]


def youtube(url, want_lang, tmp):
    info_r = run(["yt-dlp", "-J", "--skip-download", "--no-warnings", url])
    if info_r.returncode != 0:
        eprint("yt-dlp could not read the video:\n" + info_r.stderr.strip())
        sys.exit(2)
    info = json.loads(info_r.stdout)
    title = info.get("title", "video")
    duration = info.get("duration") or 0
    orig = info.get("language")
    manual = info.get("subtitles", {}) or {}
    auto = info.get("automatic_captions", {}) or {}
    # strip live/DRM pseudo-langs
    manual_langs = [k for k in manual if not k.startswith("live_chat")]
    auto_langs = [k for k in auto if not k.startswith("live_chat")]

    want = want_lang or orig
    source = None
    lang = pick_lang(manual_langs, want)
    kind = "--write-subs"
    if lang:
        source = f"manual subtitles ({lang})"
    else:
        lang = pick_lang(auto_langs, want)
        kind = "--write-auto-subs"
        if lang:
            source = f"auto-captions ({lang})"

    segs = []
    if lang:
        run([
            "yt-dlp", "--skip-download", kind, "--sub-langs", lang,
            "--sub-format", "json3/srv3/vtt/best",
            "-o", os.path.join(tmp, "cap.%(ext)s"), "--no-warnings", url,
        ])
        files = glob.glob(os.path.join(tmp, "cap*.json3")) or \
            glob.glob(os.path.join(tmp, "cap*.srv3")) or \
            glob.glob(os.path.join(tmp, "cap*.vtt"))
        if files:
            f = files[0]
            segs = parse_json3(f) if f.endswith((".json3", ".srv3")) else parse_vtt(f)

    return title, duration, (lang or orig or "?"), source, segs


# ── speech-to-text fallback (local files / no captions) ──────────────────────
def to_wav(src, tmp):
    wav = os.path.join(tmp, "audio.wav")
    r = run(["ffmpeg", "-y", "-i", src, "-ac", "1", "-ar", "16000", "-vn", wav])
    if r.returncode != 0 or not os.path.exists(wav):
        eprint("ffmpeg could not extract audio:\n" + r.stderr[-800:])
        sys.exit(3)
    return wav


def stt_api(wav, want_lang):
    key = os.environ.get("GROQ_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not key:
        return None
    if os.environ.get("GROQ_API_KEY"):
        endpoint = "https://api.groq.com/openai/v1/audio/transcriptions"
        model = "whisper-large-v3"
    else:
        endpoint = "https://api.openai.com/v1/audio/transcriptions"
        model = "whisper-1"
    cmd = [
        "curl", "-s", endpoint, "-H", f"Authorization: Bearer {key}",
        "-F", f"file=@{wav}", "-F", f"model={model}",
        "-F", "response_format=verbose_json",
    ]
    if want_lang:
        cmd += ["-F", f"language={want_lang}"]
    r = run(cmd)
    try:
        data = json.loads(r.stdout)
        return [(s["start"], clean_text(s["text"])) for s in data.get("segments", []) if s.get("text", "").strip()]
    except Exception:
        eprint("Whisper API response was not usable:\n" + r.stdout[:500])
        return None


def stt_faster_whisper(wav, want_lang):
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except Exception:
        return None
    model = WhisperModel(os.environ.get("WHISPER_MODEL", "small"), compute_type="int8")
    segments, _ = model.transcribe(wav, language=want_lang or None, vad_filter=True)
    return [(s.start, clean_text(s.text)) for s in segments if s.text.strip()]


def stt_whisper_cli(wav, want_lang, tmp):
    if not have("whisper"):
        return None
    cmd = ["whisper", wav, "--model", os.environ.get("WHISPER_MODEL", "small"),
           "--output_format", "json", "--output_dir", tmp, "--verbose", "False"]
    if want_lang:
        cmd += ["--language", want_lang]
    run(cmd)
    js = glob.glob(os.path.join(tmp, "*.json"))
    if not js:
        return None
    data = json.load(open(js[0], encoding="utf-8"))
    return [(s["start"], clean_text(s["text"])) for s in data.get("segments", []) if s.get("text", "").strip()]


def transcribe(src, want_lang, tmp):
    wav = to_wav(src, tmp)
    for fn in (lambda: stt_api(wav, want_lang),
               lambda: stt_faster_whisper(wav, want_lang),
               lambda: stt_whisper_cli(wav, want_lang, tmp)):
        segs = fn()
        if segs:
            return segs
    eprint(
        "\nNo captions and no speech-to-text option available.\n"
        "Do ONE of these, then re-run:\n"
        "  • export GROQ_API_KEY=...   (free, fast Whisper)  — or OPENAI_API_KEY\n"
        "  • pip install faster-whisper\n"
        "  • pip install -U openai-whisper   (provides the `whisper` command)\n"
    )
    sys.exit(4)


def duration_of(src):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nk=1:nw=1", src])
    try:
        return float(r.stdout.strip())
    except Exception:
        return 0.0


def main():
    ap = argparse.ArgumentParser(description="Timestamped transcript for chapters.")
    ap.add_argument("input", help="YouTube URL or path to a local video/audio file")
    ap.add_argument("--lang", default="", help="preferred language code, e.g. ar, en")
    ap.add_argument("--window", type=int, default=10, help="seconds per transcript line (0 = raw)")
    ap.add_argument("--out", default="", help="also write the transcript to this file")
    args = ap.parse_args()

    if not have("yt-dlp") and is_url(args.input):
        eprint("yt-dlp is required for YouTube URLs. Install: pip install -U yt-dlp")
        sys.exit(1)
    if not have("ffmpeg"):
        eprint("ffmpeg is required. Install it from https://ffmpeg.org/ or your package manager.")
        sys.exit(1)

    tmp = tempfile.mkdtemp(prefix="yt-chapters-")
    try:
        if is_url(args.input):
            title, duration, lang, source, segs = youtube(args.input, args.lang, tmp)
            if not segs:  # captioned video failed / none -> download audio & STT
                eprint("No usable captions; falling back to speech-to-text…")
                audio = os.path.join(tmp, "a.m4a")
                run(["yt-dlp", "-x", "--audio-format", "mp3", "-o", audio.replace(".m4a", ".%(ext)s"),
                     "--no-warnings", args.input])
                got = glob.glob(os.path.join(tmp, "a.*"))
                if got:
                    segs = transcribe(got[0], args.lang, tmp)
                    source = "speech-to-text"
        else:
            if not os.path.exists(args.input):
                eprint(f"File not found: {args.input}")
                sys.exit(1)
            title = os.path.splitext(os.path.basename(args.input))[0]
            duration = duration_of(args.input)
            lang = args.lang or "?"
            segs = transcribe(args.input, args.lang, tmp)
            source = "speech-to-text"

        if not segs:
            eprint("Could not produce a transcript.")
            sys.exit(5)

        segs = compact(segs, args.window)
        if not duration:
            duration = segs[-1][0] + 5

        header = [
            f"TITLE: {title}",
            f"DURATION: {int(duration)}  ({fmt(duration)})",
            f"LANGUAGE: {lang}",
            f"SOURCE: {source}",
            "----",
        ]
        lines = [f"{fmt(t)}\t{txt}" for t, txt in segs]
        output = "\n".join(header + lines)
        print(output)
        if args.out:
            open(args.out, "w", encoding="utf-8").write(output + "\n")
            eprint(f"\nSaved transcript -> {args.out}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
