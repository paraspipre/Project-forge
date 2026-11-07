#!/usr/bin/env python3
"""Screenshot pages of the local game with headless Chrome (WebGL via SwiftShader/ANGLE).
   python tools/shot.py <url> <out.png> [width height wait_ms]"""
import sys, asyncio
from playwright.async_api import async_playwright

async def main():
    url, out = sys.argv[1], sys.argv[2]
    w, h = int(sys.argv[3]) if len(sys.argv) > 3 else 1280, int(sys.argv[4]) if len(sys.argv) > 4 else 720
    wait = int(sys.argv[5]) if len(sys.argv) > 5 else 4000
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=default", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": w, "height": h})
        logs = []
        pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
        pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
        await pg.goto(url)
        try:
            await pg.wait_for_function("window.__ready === true", timeout=60000)
        except Exception as e:
            logs.append(f"[timeout] {e}")
        await pg.wait_for_timeout(wait)
        await pg.screenshot(path=out)
        for l in (logs[:12] + ["..."] + logs[-8:] if len(logs) > 20 else logs):
            print(l)
        await b.close()

asyncio.run(main())
