#!/usr/bin/env python3
"""Screenshot the game as a phone (touch, landscape): python tools/mobile_shot.py <url> <out.png> [w h]"""
import sys, asyncio
from playwright.async_api import async_playwright

async def main():
    url, out = sys.argv[1], sys.argv[2]
    w = int(sys.argv[3]) if len(sys.argv) > 3 else 844
    h = int(sys.argv[4]) if len(sys.argv) > 4 else 390
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=default", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2.5, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        logs = []
        pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}") if m.type == 'error' else None)
        pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
        await pg.goto(url)
        await pg.wait_for_function("window.__ready === true", timeout=90000)
        await pg.wait_for_timeout(5000)
        await pg.screenshot(path=out)
        print(await pg.evaluate("({ q: game.qualityKey, dpr: game.ren.r.getPixelRatio(), state: game.state })"))
        for l in logs[:10]: print(l[:300])
        await b.close()

asyncio.run(main())
