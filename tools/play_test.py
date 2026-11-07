#!/usr/bin/env python3
"""Scripted play-through with screenshots, for checking the game without a human.
   python tools/play_test.py <base_url> <out_dir> [scenario]"""
import sys, asyncio, os
from playwright.async_api import async_playwright

SCENARIOS = {
    # each step: ('js', code) | ('key', key, ms_hold) | ('wait', ms) | ('shot', name) | ('type', text)
    'basic': [
        ('wait', 2500),
        ('js', "const m = game.quests.npcs.get('manju'); game.player.place(m.pos.x + 2, m.pos.z + 2, Math.PI * 1.25); game.camRig.yaw = Math.PI * 1.25;"),
        ('wait', 800), ('shot', 'npc'),
        ('key', 'e', 50), ('wait', 2500), ('shot', 'dialogue'),
        ('key', 'Enter', 50), ('wait', 600), ('key', 'Enter', 50), ('wait', 2200), ('shot', 'choice'),
        ('key', '1', 50), ('wait', 2500), ('key', 'Enter', 50), ('wait', 300), ('key', 'Enter', 50), ('wait', 2500),
        ('key', 'Enter', 50), ('wait', 300), ('key', 'Enter', 50), ('wait', 2500), ('key', 'Enter', 50), ('wait', 300), ('key', 'Enter', 50), ('wait', 2500),
        ('key', 'Enter', 50), ('wait', 300), ('key', 'Enter', 50), ('wait', 1000), ('shot', 'quest'),
        ('key', 'r', 50), ('wait', 400), ('key', 'w', 2500), ('shot', 'ride'),
        ('key', 'q', 50), ('wait', 500), ('shot', 'wheel'), ('key', 'Escape', 50), ('wait', 300),
        ('key', 'm', 50), ('wait', 1500), ('shot', 'map'),
    ],
    'tour': [
        ('wait', 2000),
        ('js', "game.atmo.override = 0.42"),
        ('js', "const s = game.city.spots.vidhanaSteps; game.player.place(s[0] + 40, s[1] + 25, -Math.PI/2); game.camRig.yaw = -Math.PI/2 - 0.5; game.camRig.pitch = 0.2; game.camRig.dist = 9;"),
        ('wait', 1500), ('shot', 'vidhana'),
        ('js', "const s = game.city.spots.stadiumGate; game.player.place(s[0] + 30, s[1] + 10, -Math.PI/2); game.camRig.yaw = -Math.PI/2; game.camRig.pitch = 0.25; game.camRig.dist = 10;"),
        ('wait', 1500), ('shot', 'stadium'),
        ('js', "const s = game.city.spots.stadiumCenter; game.player.place(s[0] + 20, s[1], -Math.PI/2); game.camRig.yaw = -Math.PI/2; game.camRig.pitch = 0.3; game.camRig.dist = 14;"),
        ('wait', 1500), ('shot', 'pitch'),
        ('js', "const p = game.quests.poi ? null : null; const d = game.zoneData; const i = d.names.indexOf('Church Street'); game.player.place(170, 45, Math.PI/2); game.camRig.yaw = Math.PI/2 + 0.3; game.camRig.pitch = 0.15;"),
        ('wait', 1500), ('shot', 'church'),
        ('js', "game.atmo.override = 0.9"), ('wait', 1500), ('shot', 'night'),
        ('js', "game.atmo.override = 0.62; game.atmo.forceRain = 1"), ('wait', 3500), ('shot', 'rain'),
    ],
}


async def main():
    base, out = sys.argv[1], sys.argv[2]
    sc = sys.argv[3] if len(sys.argv) > 3 else 'basic'
    os.makedirs(out, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=default", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width": 1280, "height": 720})
        logs = []
        pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}") if m.type in ('error', 'warning') else None)
        pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
        await pg.goto(base + ("&" if "?" in base else "?") + "autoplay")
        await pg.wait_for_function("window.__ready === true && window.game && window.game.state === 'play'", timeout=90000)
        for st in SCENARIOS[sc]:
            kind = st[0]
            if kind == 'wait': await pg.wait_for_timeout(st[1])
            elif kind == 'js':
                try: await pg.evaluate(st[1])
                except Exception as e: logs.append(f"[js-error] {e}")
            elif kind == 'key':
                await pg.keyboard.down(st[1] if len(st[1]) > 1 else st[1])
                await pg.wait_for_timeout(st[2])
                await pg.keyboard.up(st[1])
            elif kind == 'type': await pg.keyboard.type(st[1])
            elif kind == 'shot': await pg.screenshot(path=os.path.join(out, f"{sc}_{st[1]}.png"))
        state = await pg.evaluate("({ q: game.quests.active && game.quests.active.q.id, coins: game.profile.coins, mode: game.player.mode, pos: [game.player.pos.x|0, game.player.pos.y|0, game.player.pos.z|0], fps: game.perf, dpr: game.ren.dprScale })")
        print(state)
        seen = set()
        for l in logs:
            if 'BiquadFilter' in l or 'Failed to load resource' in l: continue
            if l in seen: continue
            seen.add(l); print(l[:400])
        await b.close()

asyncio.run(main())
