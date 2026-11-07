#!/usr/bin/env python3
"""Generate the story's characters with Meshy and wire them into the game.

For every character in tools/meshy_characters.json:
  1. text-to-3d preview  (geometry)
  2. refine              (PBR textures)
  3. auto-rig            (skeleton + basic walk/run clips)
  4. extra animations    (optional: idle, punch, hit… from Meshy's animation library)
  5. download GLBs into models/<id>/ and add "model"/"animationFiles" to the story

Resumable: task ids are saved in models/meshy_state.json, so re-running continues where
it stopped without paying for finished steps again. Standard library only.

Usage:
  export MESHY_API_KEY=...            (never commit it)
  python3 tools/generate_meshy.py                       # all characters
  python3 tools/generate_meshy.py --only nightjar vale  # some of them
  python3 tools/generate_meshy.py --dry-run             # show prompts, call nothing
"""
import argparse, json, os, sys, time, urllib.error, urllib.request

API = "https://api.meshy.ai/openapi"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def call(method, path, body=None):
    key = os.environ.get("MESHY_API_KEY")
    if not key:
        sys.exit("MESHY_API_KEY is not set")
    req = urllib.request.Request(f"{API}{path}", method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")
            if e.code in (429, 500, 502, 503, 504) and attempt < 4:
                time.sleep(5 * 2 ** attempt)
                continue
            sys.exit(f"Meshy {method} {path} failed: HTTP {e.code} {msg}")
        except urllib.error.URLError as e:
            if attempt < 4:
                time.sleep(5 * 2 ** attempt)
                continue
            sys.exit(f"Meshy {method} {path} unreachable: {e}")


def start(path, body):
    r = call("POST", path, body)
    tid = r.get("result") or r.get("id")
    if not tid:
        sys.exit(f"Unexpected response from {path}: {r}")
    return tid


def wait(path, tid, label, timeout=45 * 60):
    t0 = time.time()
    last = None
    while True:
        r = call("GET", f"{path}/{tid}")
        st = r.get("status")
        prog = r.get("progress")
        if (st, prog) != last:
            print(f"    {label}: {st} {prog if prog is not None else ''}", flush=True)
            last = (st, prog)
        if st == "SUCCEEDED":
            return r
        if st in ("FAILED", "CANCELED", "EXPIRED"):
            raise RuntimeError(f"{label} {st}: {r.get('task_error') or r}")
        if time.time() - t0 > timeout:
            raise RuntimeError(f"{label} timed out")
        time.sleep(10)


def glb_urls(obj, prefix=""):
    """All GLB download links in a task result, keyed by their JSON path."""
    out = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            p = f"{prefix}.{k}" if prefix else k
            if isinstance(v, str) and v.startswith("http") and (k == "glb" or k.endswith("glb_url") or ".glb" in v.split("?")[0]):
                out[p] = v
            else:
                out.update(glb_urls(v, p))
    return out


def download(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with urllib.request.urlopen(url, timeout=300) as r, open(dest, "wb") as f:
        f.write(r.read())
    print(f"    saved {os.path.relpath(dest, ROOT)} ({os.path.getsize(dest) // 1024} KB)")


def compact(o, ind=0):
    """JSON with short objects kept on one line (matches the story file's style)."""
    one = json.dumps(o, ensure_ascii=False)
    if len(one) + ind < 150 or not isinstance(o, (dict, list)):
        return one
    pad = "  " * (ind + 1)
    if isinstance(o, dict):
        return "{\n" + ",\n".join(f"{pad}{json.dumps(k)}: {compact(v, ind + 1)}" for k, v in o.items()) + "\n" + "  " * ind + "}"
    return "[\n" + ",\n".join(pad + compact(v, ind + 1) for v in o) + "\n" + "  " * ind + "]"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=os.path.join(ROOT, "tools/meshy_characters.json"))
    ap.add_argument("--story", default=os.path.join(ROOT, "story/the-grinning-hour.json"))
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-rig", action="store_true", help="skip rigging (static models, procedural motion)")
    args = ap.parse_args()

    cfg = json.load(open(args.config))
    d = cfg["defaults"]
    chars = {k: v for k, v in cfg["characters"].items() if not args.only or k in args.only}
    state_path = os.path.join(ROOT, "models/meshy_state.json")
    state = json.load(open(state_path)) if os.path.exists(state_path) else {}
    save = lambda: (os.makedirs(os.path.dirname(state_path), exist_ok=True), json.dump(state, open(state_path, "w"), indent=1))

    for cid, c in chars.items():
        prompt = f"{c['prompt']}, {d['style_suffix']}"
        print(f"\n== {cid} ==\n  {prompt}")
        if args.dry_run:
            continue
        s = state.setdefault(cid, {})
        try:
            # 1. geometry
            if "preview" not in s:
                s["preview"] = start("/v2/text-to-3d", {
                    "mode": "preview", "prompt": prompt[:600], "art_style": c.get("art_style", d["art_style"]),
                    "ai_model": d["ai_model"], "topology": d["topology"], "target_polycount": c.get("target_polycount", d["target_polycount"]),
                    "should_remesh": True, "symmetry_mode": "auto", "pose_mode": d["pose_mode"],
                }); save()
            wait("/v2/text-to-3d", s["preview"], "preview")
            # 2. textures
            if "refine" not in s:
                s["refine"] = start("/v2/text-to-3d", {"mode": "refine", "preview_task_id": s["preview"], "enable_pbr": True, "texture_prompt": c["prompt"][:600]}); save()
            refined = wait("/v2/text-to-3d", s["refine"], "refine")
            static_url = (refined.get("model_urls") or {}).get("glb")
            files = {}
            rigged = False
            # 3. skeleton + basic clips
            if not args.no_rig:
                try:
                    if "rig" not in s:
                        s["rig"] = start("/v1/rigging", {"input_task_id": s["refine"], "height_meters": c.get("height_m", 1.8)}); save()
                    rig = wait("/v1/rigging", s["rig"], "rigging")
                    urls = glb_urls(rig.get("result", rig))
                    char_url = next((u for k, u in urls.items() if "rigged_character" in k), None)
                    if char_url:
                        download(char_url, os.path.join(ROOT, f"models/{cid}/{cid}.glb"))
                        rigged = True
                    for k, u in urls.items():
                        for role, key in (("walk", "walk"), ("run", "run")):
                            if key in k.lower() and role not in files:
                                download(u, os.path.join(ROOT, f"models/{cid}/{role}.glb"))
                                files[role] = f"models/{cid}/{role}.glb"
                    # 4. extra library animations (action ids configured per role)
                    for role, action_id in {**d.get("animations", {}), **c.get("animations", {})}.items():
                        if role in files or action_id in (None, ""):
                            continue
                        key = f"anim_{role}"
                        if key not in s:
                            s[key] = start("/v1/animations", {"rig_task_id": s["rig"], "action_id": action_id}); save()
                        an = wait("/v1/animations", s[key], f"animation {role}")
                        u = next(iter(glb_urls(an.get("result", an)).values()), None)
                        if u:
                            download(u, os.path.join(ROOT, f"models/{cid}/{role}.glb"))
                            files[role] = f"models/{cid}/{role}.glb"
                except RuntimeError as e:
                    print(f"    rigging/animation failed ({e}); using the static model")
            if not rigged:
                if not static_url:
                    raise RuntimeError("no GLB in refine result")
                download(static_url, os.path.join(ROOT, f"models/{cid}/{cid}.glb"))
            s["done"] = {"rigged": rigged, "animations": files}
            save()
        except RuntimeError as e:
            print(f"  !! {cid}: {e} (re-run to retry)")
            continue

        # 5. wire into the story (procedural look stays as the fallback)
        story = json.load(open(args.story))
        look = story["characters"][cid]["look"]
        look["model"] = f"models/{cid}/{cid}.glb"
        look["modelHeight"] = c.get("height_m", 1.8)
        if files:
            look["animationFiles"] = files
        else:
            look.pop("animationFiles", None)
        open(args.story, "w").write(compact(story) + "\n")
        print(f"  ✓ {cid} added to the story")

    print("\nDone. Check each model in dev/models.html (facing, scale, clip mapping).")


if __name__ == "__main__":
    main()
