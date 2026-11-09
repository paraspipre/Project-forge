#!/usr/bin/env python3
"""Two players: A steals a vehicle (B should see it), A punches B, then both play Blasters and A tags B.
   python tools/gta_mp_test.py <url>"""
import sys, asyncio, json, random
from playwright.async_api import async_playwright

AIM = """(id) => { const B = game.blasters; if (!B) return 'no game'; const r = game.remotes.get(id); if (!r) return 'no remote';
  const c = game.ren.camera.position; const d = Math.hypot(r.pos.x - game.player.pos.x, r.pos.z - game.player.pos.z);
  game.camRig.yaw = Math.atan2(r.pos.x - c.x, r.pos.z - c.z); game.camRig.pitch = Math.atan(0.7 / Math.max(3, d)); B.firing = true; return 'ok'; }"""

async def main():
    url = sys.argv[1]
    room = 'gta' + str(random.randint(1000, 9999))
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=default", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
        pages = []
        for i in range(2):
            ctx = await b.new_context(viewport={"width": 960, "height": 540})
            pg = await ctx.new_page()
            pg.on("pageerror", lambda e, i=i: print(f"[p{i} pageerror] {e}"))
            await pg.goto(f"{url}?room={room}&zone=central&autoplay")
            await pg.wait_for_function("window.game && window.game.state === 'play'", timeout=240000)
            pages.append(pg)
        a, v = pages
        await a.evaluate("game.player.place(612, 92, 0)")
        await v.evaluate("game.player.place(616, 100, Math.PI)")
        await a.wait_for_function("game.remotes.size > 0", timeout=30000)
        await v.wait_for_function("game.remotes.size > 0", timeout=30000)
        aid = await a.evaluate("game.profile.id")
        vid = await v.evaluate("game.profile.id")
        # 1. A takes the nearest vehicle
        await a.evaluate("(() => { const vs = game.traffic.vehicles.slice().sort((x, y) => Math.hypot(x.x - 612, x.z - 92) - Math.hypot(y.x - 612, y.z - 92)); const t = vs[0]; game.player.place(t.x + Math.cos(t.yaw) * (t.type.r + 0.9), t.z - Math.sin(t.yaw) * (t.type.r + 0.9)); game.driving.enter({ traffic: t }); })()")
        await v.wait_for_timeout(2500)
        seen = await v.evaluate(f"(() => {{ const r = game.remotes.get('{aid}'); return {{ mode: r && r.mode, veh: r && r.veh, mesh: !!(r && r.vehMesh && r.vehMesh.visible) }}; }})()")
        print('B sees A driving:', json.dumps(seen))
        await a.evaluate("game.driving.exit(); game.driving.heat = 0; [...game.driving.cops].forEach(c => game.driving._removeCop(c))")
        # 2. A punches B
        await a.evaluate(f"(() => {{ const r = game.remotes.get('{vid}'); game.player.place(r.pos.x, r.pos.z - 1.1, 0); }})()")
        await v.evaluate(f"(() => {{ const p = game.player.pos; game.player.place(p.x, p.z, Math.PI); }})()")
        await a.wait_for_timeout(600)
        await a.evaluate(f"(() => {{ const r = game.remotes.get('{vid}'); game.player.place(r.pos.x, r.pos.z - 1.1, 0); game.combat.punch(); }})()")
        await v.wait_for_timeout(2000)
        print('B hp after punch:', await v.evaluate("Math.round(game.combat.hp)"))
        # 3. Blasters: A hosts, B joins from the invite
        await a.evaluate("game.social.host('blasters')")
        await v.wait_for_function("game.social.upcoming() && game.social.upcoming().kind === 'blasters'", timeout=20000)
        await v.evaluate("game.social.join(game.social.upcoming())")
        await a.wait_for_function("game.blasters && game.blasters.started", timeout=40000)
        await v.wait_for_function("game.blasters && game.blasters.started", timeout=40000)
        await a.wait_for_timeout(1500)
        # put B in front of A and fire
        await a.evaluate(f"(() => {{ const p = game.player.pos; game.camRig.yaw = 0; }})()")
        apos = await a.evaluate("[game.player.pos.x, game.player.pos.z]")
        await v.evaluate(f"game.player.place({apos[0]}, {apos[1]} + 9, Math.PI)")
        await a.wait_for_timeout(1200)
        for _ in range(40):
            await a.evaluate(AIM, vid)
            await a.wait_for_timeout(100)
        await a.evaluate("game.blasters.firing = false")
        await a.wait_for_timeout(1500)
        sa = await a.evaluate("[...game.blasters.players.entries()].map(([id, p]) => [p.name, p.score, p.deaths || 0])")
        sv = await v.evaluate("({ hp: Math.round(game.blasters.hp), board: [...game.blasters.players.entries()].map(([id, p]) => [p.name, p.score, p.deaths || 0]) })")
        print('A board:', json.dumps(sa, ensure_ascii=False))
        print('B:', json.dumps(sv, ensure_ascii=False))
        ok = seen['mesh'] and seen['veh'] and any(r[1] > 0 for r in sa)
        print('RESULT', 'PASS' if ok else 'FAIL')
        await b.close()

asyncio.run(main())
