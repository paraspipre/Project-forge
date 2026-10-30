#!/usr/bin/env python3
"""Build a host-ready copy of the game in one folder (default: dist/).

- rewrites bare `from 'three'` imports to relative paths (no import map needed)
- inlines the stylesheet into the page
- copies only what the game loads: src/, vendor/, the story, the voice-over

  python3 tools/build_web.py [--out dist] [--fragment]

--fragment writes index.html as page content only (no <html>/<head>/<body>), for hosts
that wrap the page in their own document skeleton.
"""
import argparse, os, re, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rel_three(path_in_out):
    depth = path_in_out.count("/")
    return ("../" * depth if depth else "./") + "vendor/three.module.js"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "dist"))
    ap.add_argument("--story", default="the-grinning-hour")
    ap.add_argument("--fragment", action="store_true")
    a = ap.parse_args()
    out = a.out
    if os.path.exists(out):
        shutil.rmtree(out)
    files = []

    def copy(rel, transform=None):
        src = os.path.join(ROOT, rel)
        dst = os.path.join(out, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if transform:
            open(dst, "w", encoding="utf-8").write(transform(open(src, encoding="utf-8").read(), rel))
        else:
            shutil.copyfile(src, dst)
        files.append(rel)

    fix = lambda text, rel: re.sub(r"""from\s+(['"])three\1""", f"from '{rel_three(rel)}'", text)
    for base in ("src", "vendor"):
        for dirpath, _, names in os.walk(os.path.join(ROOT, base)):
            for n in names:
                rel = os.path.relpath(os.path.join(dirpath, n), ROOT).replace(os.sep, "/")
                if rel.endswith(".css") or "draco_encoder" in rel or rel.endswith(".LICENSE"):
                    continue
                copy(rel, fix if rel.endswith(".js") else None)
    copy(f"story/{a.story}.json")
    vdir = os.path.join(ROOT, "voice")
    for n in sorted(os.listdir(vdir)):
        copy(f"voice/{n}")

    html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    css = open(os.path.join(ROOT, "src/ui/style.css"), encoding="utf-8").read()
    html = html.replace('<link rel="stylesheet" href="src/ui/style.css">', f"<style>\n{css}</style>")
    html = re.sub(r'\s*<script type="importmap">.*?</script>', "", html, flags=re.S)
    if a.fragment:
        head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
        body = re.search(r"<body>(.*?)</body>", html, re.S).group(1)
        head = re.sub(r'\s*<meta charset[^>]*>|\s*<meta name="viewport"[^>]*>', "", head)
        html = head.strip() + "\n" + body.strip() + "\n"
    open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(html)
    size = sum(os.path.getsize(os.path.join(out, f)) for f in files)
    print(f"{len(files)} files, {size / 1e6:.1f} MB → {os.path.relpath(out, ROOT) if out.startswith(ROOT) else out}")


if __name__ == "__main__":
    main()
