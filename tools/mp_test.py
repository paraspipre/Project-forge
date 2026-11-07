#!/usr/bin/env python3
"""Two players in two isolated browser contexts: checks they see each other, chat, and emotes.
   python tools/mp_test.py <url> <out_dir>"""
import sys, asyncio, os, random
from playwright.async_api import async_playwright

async def main():
    url, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    room = 't' + str(random.randint(10000, 99999))
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=default", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        pages = []
        for i in range(2):
            ctx = await b.new_context(viewport={"width": 960, "height": 540})
            pg = await ctx.new_page()
            pg.on("pageerror", lambda e, i=i: print(f"[p{i} pageerror] {e}"))
            await pg.goto(f"{url}?room={room}&autoplay")
            await pg.wait_for_function("window.game && window.game.state === 'play'", timeout=90000)
            pages.append(pg)
        a, c = pages
        # put both players next to each other
        await a.evaluate("game.player.place(612, 92, 0); game.camRig.yaw = Math.PI")
        await c.evaluate("game.player.place(612, 99, Math.PI); game.camRig.yaw = 0")
        for t in range(20):
            await a.wait_for_timeout(1000)
            na = await a.evaluate("game.remotes.size")
            nc = await c.evaluate("game.remotes.size")
            if na and nc: break
        print('remotes seen: A sees', na, ' B sees', nc, f'(after ~{t+1}s)')
        await a.evaluate("game.sendChat('Namaskara! Oota aayta?')")
        await a.evaluate("game.doEmote('dance')")
        await a.keyboard.down('a'); await a.wait_for_timeout(700); await a.keyboard.up('a')
        await c.wait_for_timeout(1500)
        await c.screenshot(path=os.path.join(out, 'mp_b_view.png'))
        log = await c.evaluate("[...document.querySelectorAll('#chatlog .msg')].map(e => e.textContent)")
        print('B chat log:', log)
        st = await c.evaluate("[...game.remotes.values()].map(r => ({ name: r.peer.name, pos: [r.pos.x|0, r.pos.z|0], emote: r.lastEmote }))")
        print('B remote state:', st)
        await b.close()

asyncio.run(main())
