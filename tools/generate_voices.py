#!/usr/bin/env python3
"""Render the voice-over for a story file with Kokoro TTS (Apache-2.0, runs offline on CPU).

Every spoken line in the story (dialogue, captions, the player's chosen replies, combat
efforts) becomes voice/<key>.mp3, where key = FNV-1a("speaker|text") — the same hash the
engine computes at runtime (src/engine/Audio.js: lineKey), so the story JSON needs no IDs.

Voices are set per character in the story:  "voice": {"kokoro": "am_fenrir*0.6+am_onyx*0.4", "speed": 0.92}
Captions use story["narrator"]["voice"].

Setup:
  pip install kokoro-onnx soundfile
  curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
  curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
Usage:
  python3 tools/generate_voices.py story/the-grinning-hour.json --models <dir with the two files>
Requires ffmpeg on PATH.
"""
import argparse, json, os, re, subprocess, sys, tempfile

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro


def line_key(speaker, text):
    h = 0x811C9DC5
    for b in f"{speaker}|{text}".encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def spoken(text):
    """Text as it should be pronounced (stage directions and sound effects removed)."""
    t = re.sub(r"\*[^*]*\*", "", text)          # *krrsh*
    t = re.sub(r"\[[^\]]*\]\s*", "", t)          # [Calm] ...
    t = t.replace("Mr.", "Mister").replace("—", ", ").replace("...", "…")
    return t.strip()


def collect(story):
    lines = []  # (speaker, text)
    default_player = story["player"]

    def walk(steps, player):
        for st in steps or []:
            if st.get("t") and st.get("s"):
                lines.append((st["s"], st["t"]))
            if st.get("caption") and st.get("voice", True):
                lines.append(("narrator", st["caption"]))
            for c in st.get("choices", []):
                if spoken(c["t"]) and not c.get("silent"):
                    lines.append((player, c["t"]))
                walk(c.get("then"), player)
            walk(st.get("then"), player)
            walk(st.get("else"), player)
            walk(st.get("talk"), player)

    for sc in story["scenes"].values():
        player = sc.get("playAs", default_player)
        walk(sc.get("intro"), player)
        walk(sc.get("resume"), player)
        for n in sc.get("npcs", []):
            walk(n.get("talk"), player)
        for it in sc.get("interactables", []):
            walk(it.get("script"), player)
        for t in sc.get("triggers", []):
            walk(t.get("script"), player)
        for w in sc.get("waves", {}).values():
            walk(w.get("onClear"), player)
    return list(dict.fromkeys(lines))


def voice_style(kokoro, spec):
    parts = []
    for term in spec.split("+"):
        name, _, w = term.partition("*")
        parts.append(kokoro.get_voice_style(name.strip()) * float(w or 1))
    return np.sum(parts, axis=0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("story")
    ap.add_argument("--models", default=".")
    ap.add_argument("--out", default="voice")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    story = json.load(open(args.story, encoding="utf-8"))
    kokoro = Kokoro(os.path.join(args.models, "kokoro-v1.0.onnx"), os.path.join(args.models, "voices-v1.0.bin"))
    os.makedirs(args.out, exist_ok=True)
    manifest_path = os.path.join(args.out, "manifest.json")
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) and not args.force else {}

    chars = story["characters"]
    def cfg(speaker):
        if speaker == "narrator":
            return story.get("narrator", {}).get("voice", {"kokoro": "bm_lewis", "speed": 0.95})
        return chars.get(speaker, {}).get("voice")

    jobs = []
    for speaker, text in collect(story):
        if cfg(speaker):
            jobs.append((speaker, text, None))
    # vocal efforts (grunts, laughs) for combat and stingers
    for speaker, c in chars.items():
        for kind, texts in c.get("efforts", {}).items():
            for i, t in enumerate(texts):
                jobs.append((speaker, t, f"{speaker}:{kind}"))

    styles = {}
    done = 0
    for speaker, text, effort in jobs:
        key = line_key(speaker if not effort else f"fx:{effort}", text)
        if key in manifest and os.path.exists(os.path.join(args.out, manifest[key]["file"])):
            continue
        v = cfg(speaker)
        if not v:
            continue
        spec = v["kokoro"]
        if spec not in styles:
            styles[spec] = voice_style(kokoro, spec)
        say = spoken(text)
        if not say:
            continue
        lang = "en-gb" if spec.startswith("b") else "en-us"
        samples, sr = kokoro.create(say, voice=styles[spec], speed=v.get("speed", 1.0) * (1.1 if effort else 1), lang=lang)
        # trim silence, short fades
        thr = 0.01
        idx = np.where(np.abs(samples) > thr)[0]
        if len(idx):
            samples = samples[max(0, idx[0] - int(sr * 0.03)): idx[-1] + int(sr * 0.12)]
        samples = samples / max(1e-6, np.max(np.abs(samples))) * 0.9
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            sf.write(tmp.name, samples, sr)
        fname = f"{key}.mp3"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp.name, "-ac", "1", "-ar", "24000", "-b:a", "56k", os.path.join(args.out, fname)], check=True)
        os.unlink(tmp.name)
        entry = {"file": fname, "dur": round(len(samples) / sr, 2), "s": speaker}
        if effort:
            entry["effort"] = effort
        manifest[key] = entry
        done += 1
        print(f"[{done}] {speaker}: {text[:70]}", flush=True)
        if done % 20 == 0:
            json.dump(manifest, open(manifest_path, "w"), indent=0)
    json.dump(manifest, open(manifest_path, "w"), indent=0)
    print(f"done: {done} new clips, {len(manifest)} total")


if __name__ == "__main__":
    sys.exit(main())
