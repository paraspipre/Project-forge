#!/usr/bin/env python3
"""Render the social preview image (og.png): a scenic in-game view with the logo."""
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=default", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 1200, "height": 630})
        await pg.goto("http://127.0.0.1:8765/index.html?autoplay")
        await pg.wait_for_function("window.game && window.game.state === 'play'", timeout=90000)
        await pg.evaluate("""() => {
          const g = game; g.atmo.override = 0.71; g.photo(true);
          document.getElementById('photobar').style.display = 'none';
          const s = g.city.spots.vidhanaSteps;
          g.player.place(s[0] + 60, s[1] + 18, -Math.PI / 2 - 0.25);
          g.camRig.yaw = -Math.PI / 2 - 0.35; g.camRig.pitch = 0.12; g.camRig.dist = 12; g.camRig.maxDist = 45;
          const o = document.createElement('div');
          o.innerHTML = '<div style="font-family:Baloo Tamma 2;font-weight:800;color:#8e5bb5;letter-spacing:2px;font-size:22px;text-shadow:0 0 6px #fff6e6">ನಮ್ಮ ಬೆಂಗಳೂರು · YEAR 2099</div><h1 class="logo" style="margin:0"><span>PEAK</span><span>BENGALURU</span></h1><div style="font-weight:800;font-size:22px;color:#2a2226;text-shadow:0 0 6px #fff6e6,0 0 6px #fff6e6">The real city map. Hover autos. Same old traffic.</div>';
          o.style.cssText = 'position:absolute;left:40px;top:34px;z-index:9;text-align:left';
          document.getElementById('app').appendChild(o);
        }""")
        await pg.wait_for_timeout(5000)
        await pg.screenshot(path="og.png")
        await b.close()
asyncio.run(main())
