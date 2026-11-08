#!/usr/bin/env python3
"""Two players with fake microphones: A talks, B should hear A (WebRTC link up, speaking detected).
   python tools/voice_chat_test.py <url>"""
import sys, asyncio, json, random
from playwright.async_api import async_playwright

async def main():
    url = sys.argv[1]
    room = 'vc' + str(random.randint(1000, 9999))
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=[
            "--use-angle=default", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required",
            "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        pages = []
        for i in range(2):
            ctx = await b.new_context(viewport={"width": 800, "height": 450}, permissions=["microphone"])
            pg = await ctx.new_page()
            pg.on("pageerror", lambda e, i=i: print(f"[p{i} pageerror] {e}"))
            await pg.goto(f"{url}?room={room}&autoplay")
            await pg.wait_for_function("window.game && window.game.state === 'play'", timeout=240000)
            await pg.mouse.click(400, 200)
            pages.append(pg)
        a, c = pages
        await a.evaluate("game.player.place(612, 92, 0)")
        await c.evaluate("game.player.place(616, 96, 0)")
        await a.wait_for_function("game.remotes.size > 0", timeout=30000)
        await c.wait_for_function("game.remotes.size > 0", timeout=30000)
        await a.evaluate("game.ui.toggleMic()")
        for t in range(25):
            await a.wait_for_timeout(1000)
            st = await c.evaluate("(() => { const r = [...game.remotes.values()][0]; const l = [...game.voice.links.values()][0]; return { links: game.voice.links.size, state: l && l.pc.connectionState, speaking: !!(r && r.speaking), flags: r && r.flags, gain: l && l.gain ? +l.gain.gain.value.toFixed(2) : null }; })()")
            if st['speaking']:
                break
        sa = await a.evaluate("({ mic: game.voice.micOn, level: +game.voice.level.toFixed(3), links: [...game.voice.links.values()].map(l => l.pc.connectionState) })")
        print('A (talking):', json.dumps(sa))
        print(f'B (listening) after ~{t + 1}s:', json.dumps(st))
        # B mutes A -> gain should drop to 0
        await c.evaluate("game.voice.toggleMute([...game.remotes.values()][0].peer.id)")
        await c.wait_for_timeout(1500)
        print('B after muting A:', await c.evaluate("[...game.voice.links.values()].map(l => l.gain ? +l.gain.gain.value.toFixed(2) : null)"))
        await b.close()

asyncio.run(main())
