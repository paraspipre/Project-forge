#!/usr/bin/env python3
"""Check voiced, hands-free dialogue: clips are fetched, played, and lines advance on their own."""
import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=default", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width": 960, "height": 540})
        fetched = []
        pg.on("request", lambda r: fetched.append(r.url.split('/')[-1]) if '/voice/' in r.url else None)
        await pg.goto("http://127.0.0.1:8765/index.html?autoplay")
        await pg.wait_for_function("window.game && window.game.state === 'play'", timeout=240000)
        await pg.mouse.click(480, 300)   # a user gesture unlocks WebAudio
        await pg.wait_for_timeout(500)
        await pg.evaluate("const m = game.quests.npcs.get('manju'); game.player.place(m.pos.x + 1.6, m.pos.z + 1.2, Math.PI); window.__seen = []; setInterval(() => { const t = document.getElementById('dlg-text').textContent; if (t && window.__seen[window.__seen.length - 1] !== t) window.__seen.push(t); window.__voiced = (window.__voiced || 0) + (game.audio.current ? 1 : 0); }, 300)")
        await pg.wait_for_timeout(40000)
        res = await pg.evaluate("({ ctx: !!game.audio.ctx && game.audio.ctx.state, manifest: game.audio.voiceSet.size, voicedTicks: window.__voiced, lines: window.__seen.map(s => s.slice(0, 50)), quest: game.quests.active && game.quests.active.q.id, objective: document.getElementById('obj-text').textContent })")
        print(json.dumps(res, indent=1))
        print('voice files fetched:', len(fetched), fetched[:6])
        await b.close()
asyncio.run(main())
