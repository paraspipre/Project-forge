#!/usr/bin/env python3
"""Render voice-over for every line in tools/voice_lines.json with Kokoro (Apache-2.0 neural TTS,
runs on the CPU). Each character gets a voice blended from Kokoro's Hindi voices (for the Indian
accent) and its English ones (for variety). Output: voice/<key>.mp3 + voice/manifest.json.

  pip install kokoro-onnx soundfile imageio-ffmpeg
  # model files: kokoro-v1.0.onnx + voices-v1.0.bin from
  #   https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
  node tools/voice_lines.mjs > tools/voice_lines.json
  python tools/gen_voices.py --models <dir with the two model files>

Clips already rendered are kept, so re-running after story edits only renders new lines.
"""
import argparse, json, os, re, subprocess, sys, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "voice")

# speaker id -> (voice blend, speed). Blends are "a*w+b*w".
M_GRUFF = "hm_psi*0.8+bm_george*0.2"
M_UNCLE = "hm_psi*0.65+bm_george*0.35"
M_YOUNG = "hm_omega*0.65+am_puck*0.35"
M_TECH = "hm_omega*0.55+am_michael*0.45"
M_PLAIN = "hm_omega"
M_ALT = "hm_psi"
F_PLAIN = "hf_alpha"
F_WARM = "hf_beta"
F_YOUNG = "hf_alpha*0.65+af_bella*0.35"
F_AUNTY = "hf_beta*0.8+bf_isabella*0.2"
F_PRO = "hf_alpha*0.7+bf_emma*0.3"

VOICES = {
    # MG Road
    "manju": (M_GRUFF, 0.95), "ajji": (F_AUNTY, 0.88), "prateek": (M_YOUNG, 1.1), "sita": (F_PLAIN, 0.92),
    "eshwar": (M_PLAIN, 1.08), "gowramma": (F_WARM, 1.0), "rakesh": ("hm_omega*0.7+bm_lewis*0.3", 1.05),
    "placard": (M_TECH, 1.05), "pradeep2": (M_TECH, 1.05),
    # Silk Board
    "thimmappa": (M_UNCLE, 0.92), "tejas": (M_TECH, 1.12), "manjula": (F_PRO, 1.0), "snack": (M_ALT, 1.05),
    # Koramangala
    "dinesh": (M_PLAIN, 1.12), "farah": ("hf_alpha*0.6+af_bella*0.4", 1.08), "vc2": ("hm_psi*0.5+bm_daniel*0.5", 0.98), "kora_uncle": (M_UNCLE, 0.9),
    # Indiranagar
    "broker": ("hm_omega*0.8+bm_lewis*0.2", 1.06), "drummer": (M_YOUNG, 1.0),
    # Basavanagudi
    "seenappa": (M_ALT, 1.0), "priest": (M_UNCLE, 0.88), "gardener": (F_WARM, 0.95),
    # Bellandur
    "dr_lake": (F_PLAIN, 1.02), "orr_techie": ("hf_beta*0.7+af_nicole*0.3", 1.08),
    # Majestic, Malleshwaram, E-City, Whitefield
    "tourist": (F_AUNTY, 0.95), "coolie": (M_UNCLE, 0.9), "ctr": (M_ALT, 0.95), "veena": ("hm_omega*0.6+bm_george*0.4", 0.92),
    "security": (M_ALT, 0.95), "fresher": (F_YOUNG, 1.1), "wf_commuter": (M_PLAIN, 1.05),
    # story mode: your phone, the traffic AI, its creator, the news
    "maga": ("hm_psi*0.55+am_puck*0.45", 1.12), "signal": ("bm_george*0.5+hm_omega*0.5", 0.84), "vasu": (F_AUNTY, 0.88),
    "news": (F_PRO, 1.08),
    # the hangout in every district (Namma Club, boutique, kaapi)
    "mamta": (F_WARM, 1.05), "dj": ("hm_omega*0.6+am_puck*0.4", 1.1), "quizmaster": ("hm_psi*0.6+bm_george*0.4", 0.98),
    "kaapi": (M_GRUFF, 0.92), "bhavana": (F_YOUNG, 1.06),
    # locals in every district
    "local0": (M_UNCLE, 0.92), "local1": (M_TECH, 1.08), "local2": (M_ALT, 1.05), "local3": (M_PLAIN, 1.12),
    # one-off characters (spoken as named speakers)
    "Counter 1": (M_GRUFF, 0.92), "Counter 2": (M_UNCLE, 0.85), "Xerox Uncle": (M_UNCLE, 0.95), "Auto driver": (M_GRUFF, 0.95),
    "VC Vasundhara": (F_PRO, 0.98), "Anxious Ananya": (F_YOUNG, 1.15), "Professor Prasad": (M_UNCLE, 0.9), "Gym Bro Girish": (M_YOUNG, 1.08),
    "Pivot Pavan": (M_YOUNG, 1.1), "Blockchain Bhavana": (F_YOUNG, 1.08), "Burnout Bharath": (M_TECH, 0.9), "Debug Deepa": (F_PRO, 1.05),
    "Landlord Lakshman": (M_UNCLE, 0.9), "Landlady Leela": (F_AUNTY, 0.95), "Landlord Lokesh": (M_GRUFF, 0.95),
    "The Queue": (M_ALT, 1.0), "Line-cutter": (M_YOUNG, 1.05),
}
DEFAULT = (M_PLAIN, 1.0)


def key(id_, text):
    h = 0x811C9DC5
    for b in f"{id_}|{text}".encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


SPELL = {"ORR": "O R R", "AI": "A I", "VC": "V C", "PM": "P M", "IT": "I T", "CTR": "C T R", "KSR": "K S R",
         "ETA": "E T A", "EMIs": "E M Is", "ESOPs": "E sops", "LinkedIn": "Linked In", "ITPL": "I T P L", "RCB": "R C B",
         "BBMP": "B B M P", "2BHK": "two B H K", "1BHK": "one B H K", "1RK": "one R K", "Q3": "Q 3", "OK": "okay"}


def speakable(text):
    t = re.sub(r"\*[^*]*\*", " ", text)                      # stage directions are not spoken
    t = re.sub(r"[\U0001F000-\U0001FFFF☀-➿]", " ", t)  # emoji
    t = re.sub(r"[ಀ-೿]+", " ", t)                    # Kannada script (subtitles only)
    t = re.sub(r"₹\s?([\d,]+)(\s?crore|\s?lakh)?", lambda m: f"{m.group(1)}{m.group(2) or ''} rupees", t)
    for k, v in SPELL.items():
        t = re.sub(rf"\b{re.escape(k)}\b", v, t)
    t = t.replace("%", " percent").replace("&", " and ").replace("…", "...").replace("—", ", ").replace("–", ", ")
    t = re.sub(r"\s+", " ", t).strip()
    return t


def blend(kokoro, spec):
    import numpy as np
    total = None
    for part in spec.split("+"):
        name, w = (part.split("*") + ["1"])[:2]
        v = kokoro.get_voice_style(name.strip()) * float(w)
        total = v if total is None else total + v
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", required=True)
    ap.add_argument("--lines", default=os.path.join(ROOT, "tools", "voice_lines.json"))
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    from kokoro_onnx import Kokoro
    import soundfile as sf
    import imageio_ffmpeg
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    kokoro = Kokoro(os.path.join(a.models, "kokoro-v1.0.onnx"), os.path.join(a.models, "voices-v1.0.bin"))
    lines = json.load(open(a.lines, encoding="utf-8"))
    os.makedirs(OUT, exist_ok=True)
    styles = {}
    done, made, t0 = 0, 0, time.time()
    keys, groups = [], {}
    for i, ln in enumerate(lines):
        if a.limit and made >= a.limit:
            break
        text = speakable(ln["text"])
        if not text:
            continue
        k = key(ln["id"], ln["text"])
        path = os.path.join(OUT, f"{k}.mp3")
        keys.append(k)
        groups.setdefault(ln["id"], []).append(k)
        if os.path.exists(path):
            done += 1
            continue
        spec, speed = VOICES.get(ln["id"], DEFAULT)
        if spec not in styles:
            styles[spec] = blend(kokoro, spec)
        samples, sr = kokoro.create(text, voice=styles[spec], speed=speed, lang="en-gb")
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            wav = tmp.name
        sf.write(wav, samples, sr)
        # mono 48 kbps mp3 with a little loudness normalisation
        subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", wav, "-af", "loudnorm=I=-17:TP=-1.5,highpass=f=70",
                        "-ac", "1", "-ar", "24000", "-b:a", "48k", path], check=True)
        os.remove(wav)
        made += 1
        el = time.time() - t0
        print(f"[{i + 1}/{len(lines)}] {ln['id']}: {text[:60]}  ({el:.0f}s)", flush=True)
    manifest = {"keys": keys, "groups": groups}
    json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8"), separators=(",", ":"))
    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"{made} rendered, {done} kept, {len(keys)} in manifest, {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
