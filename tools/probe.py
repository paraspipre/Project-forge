#!/usr/bin/env python3
"""Evaluate a JS expression in a page once it is ready: python tools/probe.py <url> "<js expr>" """
import sys, asyncio, json
from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=default", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1280, "height": 720})
        logs = []
        pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
        pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
        await pg.goto(sys.argv[1])
        await pg.wait_for_function("window.__ready === true", timeout=60000)
        await pg.wait_for_timeout(1500)
        print(json.dumps(await pg.evaluate(sys.argv[2]), indent=1)[:6000])
        for l in logs[:15]:
            print(l[:500])
        await b.close()

asyncio.run(main())
