#!/usr/bin/env python3
"""Drive the on-screen joystick and buttons with synthetic touches (phone emulation)."""
import asyncio, json
from playwright.async_api import async_playwright
TOUCH = """async ([x0, y0, x1, y1, ms]) => {
  const el = document.getElementById('joy');
  const mk = (x, y) => new Touch({ identifier: 7, target: el, clientX: x, clientY: y });
  el.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(x0, y0)], changedTouches: [mk(x0, y0)], bubbles: true, cancelable: true }));
  window.dispatchEvent(new TouchEvent('touchmove', { touches: [mk(x1, y1)], changedTouches: [mk(x1, y1)], bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, ms));
  window.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(x1, y1)], bubbles: true }));
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=default", "--ignore-gpu-blocklist"])
        ctx = await b.new_context(viewport={"width": 844, "height": 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        await pg.goto("http://127.0.0.1:8765/index.html?autoplay")
        await pg.wait_for_function("window.game && window.game.state === 'play'", timeout=90000)
        await pg.wait_for_timeout(1500)
        before = await pg.evaluate("game.player.pos.toArray().map(v => +v.toFixed(1))")
        r = await pg.evaluate("(() => { const r = document.getElementById('joy').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
        await pg.evaluate(TOUCH, [r[0], r[1], r[0], r[1] - 60, 1500])
        after = await pg.evaluate("game.player.pos.toArray().map(v => +v.toFixed(1))")
        # ride button
        await pg.evaluate("document.getElementById('t-ride').dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }))")
        await pg.wait_for_timeout(300)
        mode = await pg.evaluate("game.player.mode")
        await pg.evaluate(TOUCH, [r[0], r[1], r[0], r[1] - 60, 1500])
        after2 = await pg.evaluate("game.player.pos.toArray().map(v => +v.toFixed(1))")
        print(json.dumps({"before": before, "afterWalk": after, "mode": mode, "afterRide": after2, "isTouch": await pg.evaluate("game.input.isTouch")}))
        await pg.screenshot(path="C:/Users/paras/AppData/Local/Temp/claude/c--Users-paras-OneDrive-Desktop-banglore-game/5ce379f3-e7c7-41ae-bfd5-ce76c6a0b2d8/scratchpad/touch.png")
        await b.close()
asyncio.run(main())
