#!/usr/bin/env python3
"""Scripted play-through with screenshots, for checking the game without a human.
   python tools/play_test.py <base_url> <out_dir> [scenario]"""
import sys, asyncio, os
from playwright.async_api import async_playwright

ZONES = ['silkboard', 'koramangala', 'indiranagar', 'basavanagudi', 'bellandur', 'majestic', 'malleshwaram', 'ecity', 'whitefield']
SCENARIOS = {
    'guide': [
        ('wait', 2500), ('shot', 'facing'),
        ('js', "game.camRig.yaw += Math.PI; game.player.yaw = game.camRig.yaw;"), ('wait', 1200), ('shot', 'away'),
        ('js', "game.player.place(game.player.pos.x - 300, game.player.pos.z + 200)"), ('wait', 1500), ('shot', 'far'),
        ('js', "console.error('GUIDE ' + JSON.stringify({ wp: !document.getElementById('waypoint').classList.contains('hidden'), dist: document.getElementById('wp-dist').textContent, obj: document.getElementById('obj-text').textContent, objDist: document.getElementById('obj-dist').textContent }))"),
    ],
    'handsfree': [
        ('wait', 2000),
        ('js', "const m = game.quests.npcs.get('manju'); game.player.place(m.pos.x + 1.6, m.pos.z + 1.2, Math.PI); window.__t0 = performance.now(); window.__log = []; setInterval(() => window.__log.push([Math.round((performance.now() - window.__t0) / 1000), document.getElementById('dlg-name').textContent, document.getElementById('dlg-text').textContent.slice(0, 40), !document.getElementById('dialogue').classList.contains('hidden'), document.getElementById('obj-text').textContent.slice(0, 50)]), 2000);"),
        ('wait', 3000), ('shot', 'auto1'), ('wait', 12000), ('shot', 'choice'), ('wait', 30000), ('shot', 'later'),
        ('js', "console.error('LOG ' + JSON.stringify(window.__log.filter((x, i, a) => i === 0 || x[2] !== a[i - 1][2] || x[4] !== a[i - 1][4])))"),
    ],
    'night': [('js', "game.atmo.override = 0.93; const s = game._safeSpawn([700, 330, null]); game.player.place(s[0], s[1], s[2]); game.camRig.yaw = s[2]; game.camRig.pitch = 0.3; game.camRig.dist = 11"), ('wait', 3500), ('shot', 'brigade'),
              ('js', "game.atmo.override = 0.79"), ('wait', 2500), ('shot', 'dusk')],
    'street': [
        ('js', "game.atmo.override = 0.38"),
        ('js', "const rd = game.city.roads.filter(r => r.code === 6 && r.pts.length > 3 && Math.hypot(r.pts[0][0] - 400, r.pts[0][1] - 600) < 400)[0]; const p = rd.pts[1], q = rd.pts[2]; window.__rd = rd.name; game.player.place(p[0], p[1], Math.atan2(q[0]-p[0], q[1]-p[1])); game.camRig.yaw = Math.atan2(q[0]-p[0], q[1]-p[1]); game.camRig.pitch = 0.12; game.camRig.dist = 7;"),
        ('wait', 2500), ('shot', 'lane'),
        ('js', "game.camRig.pitch = -0.3; game.camRig.dist = 4;"), ('wait', 1500), ('shot', 'sky'),
        ('js', "game.player.place(game.player.pos.x, game.player.pos.z); game.camRig.pitch = 0.9; game.camRig.dist = 60;"), ('wait', 1500), ('shot', 'above'),
        ('js', "console.error('ROAD ' + window.__rd + ' props ' + game.props.count + ' street=' + document.getElementById('loc-street').textContent + ' kn=' + game.city.roads.filter(r => r.kn).length)"),
        ('js', "const b = game.signs.placed.filter(p => p.cat === 'street')[3]; game.player.place(b.x + Math.sin(b.yaw) * 4, b.z + Math.cos(b.yaw) * 4, b.yaw + Math.PI); game.camRig.yaw = b.yaw + Math.PI; game.camRig.pitch = 0.05; game.camRig.dist = 3.5;"), ('wait', 1800), ('shot', 'board'),
    ],
    'jump1': [('js', "game.travel('bellandur')"), ('wait', 4000), ('shot', 'b')],
    'jump2': [('js', "game.atmo.override = 0.45"), ('js', "game.travel('bellandur')"), ('wait', 4000), ('shot', 'b')],
    'foam': [
        ('js', "game.atmo.override = 0.45"), ('js', "game.travel('bellandur')"), ('wait', 5000),
        ('js', "const n = game.quests.npcs.get('dr_lake'); game.player.place(n.pos.x + 1, n.pos.z + 1); void game.quests.start(game.quests.story.quests.find(q => q.id === 'be_foam'))"), ('wait', 1500),
        ('key', 'Enter', 40), ('wait', 400), ('key', 'Enter', 40), ('wait', 2400), ('key', 'Enter', 40), ('wait', 400), ('key', 'Enter', 40), ('wait', 2200),
        ('key', '1', 40), ('wait', 5000), ('shot', 'rise'),
    ] + [s for i in range(28) for s in [('click', 640, 300), ('wait', 260)]] + [('shot', 'fight'), ('js', "console.error('BOSS ' + JSON.stringify({ boss: game.quests.mini._boss && game.quests.mini._boss.position.toArray().map(Math.round), player: game.player.pos.toArray().map(Math.round), spots: game.city.spots, camYaw: game.camRig.yaw }))"), ('wait', 3500), ('shot', 'end'),
        ('js', "console.error('FOAM ' + JSON.stringify({ done: game.profile.done, active: game.quests.active && game.quests.active.q.id }))")],
    'dosa': [
        ('js', "game.atmo.override = 0.45"), ('js', "game.travel('basavanagudi')"), ('wait', 5000),
        ('js', "const s = game.quests.npcs.get('seenappa'); game.player.place(s.pos.x + 2, s.pos.z + 2); void game.quests.start(game.quests.story.quests.find(q => q.id === 'ba_dose'))"), ('wait', 1500),
        ('key', 'Enter', 40), ('wait', 400), ('key', 'Enter', 40), ('wait', 2400), ('key', 'Enter', 40), ('wait', 400), ('key', 'Enter', 40), ('wait', 1500),
        ('js', "game.camRig.dist = 4; game.camRig.yaw = game.player.yaw + 2.5; game.camRig.pitch = 0.2"), ('key', 'w', 1500), ('shot', 'carry'),
        ('key', 'Shift', 10), ('key', 'd', 1200), ('shot', 'wobble'),
    ],
    'zones': [('js', "game.atmo.override = 0.4")] + [s for z in ZONES for s in [
        ('js', f"game.travel('{z}')"), ('wait', 6000),
        ('js', "game.camRig.dist = 12; game.camRig.pitch = 0.35"), ('wait', 800), ('shot', z),
        ('js', "window.__zinfo = (window.__zinfo || []).concat([[game.zoneId, game.quests.npcs.size, game.city.buildings.length, game.signs.count, Object.keys(game.city.spots).length, game.landmarks.length]])"),
    ]] + [('js', "console.error('ZINFO ' + JSON.stringify(window.__zinfo))")],
    'club': [
        ('js', "game.atmo.override = 0.86"), ('wait', 2500),
        ('js', "const v = game.social.venue; const [x, z] = v.spots.board; game.player.place(x + 3, z + 6, 0); game.camRig.yaw = Math.atan2(v.pos.x - x - 3, v.pos.z - z - 6); game.camRig.pitch = 0.25; game.camRig.dist = 12;"),
        ('wait', 2500), ('shot', 'club_night'),
        ('js', "console.error('VENUE ' + JSON.stringify({ pos: game.social.venue.pos.toArray().map(Math.round), npcs: [...game.quests.npcs.keys()].filter(k => ['mamta','dj','quizmaster','kaapi','bhavana'].includes(k)), signs: game.city.customSigns.filter(s => /NAMMA|MEETUP/.test(s.text)).length }))"),
        ('js', "game.atmo.override = 0.45"), ('wait', 1500), ('shot', 'club_day'),
        ('js', "game.social.host('quiz')"), ('wait', 9000), ('shot', 'quiz_q1'), ('key', '2', 50), ('wait', 1500), ('shot', 'quiz_ans'),
        ('js', "console.error('QUIZ ' + JSON.stringify({ cur: game.social.cur && game.social.cur.constructor.name, players: game.social.cur && [...game.social.cur.players.values()].map(p => p.name) }))"),
        ('js', "game.social.leave(); game.social.host('dance')"), ('wait', 9000), ('key', 'ArrowLeft', 30), ('key', 'ArrowUp', 30), ('wait', 1200), ('shot', 'dance'),
        ('js', "game.social.leave(); game.social.host('chor')"), ('wait', 9500), ('shot', 'chor'),
        ('js', "console.error('CHOR ' + JSON.stringify({ police: game.social.cur && game.social.cur.police, bot: !!(game.social.cur && game.social.cur.bot) }))"),
        ('js', "game.social.leave(); game.social.openShop()"), ('wait', 800), ('shot', 'shop'),
        ('js', "game.social.closeShop(); game.social.openBoards('quiz')"), ('wait', 3000), ('shot', 'boards'),
    ],
    'hall': [
        ('js', "game.atmo.override = 0.42"), ('wait', 2500),
        ('js', "const h = game.social.hall; const [x, z] = h.spots.entrance; game.player.place(x, z, h.yaw + Math.PI); game.camRig.yaw = h.yaw + Math.PI; game.camRig.pitch = 0.3; game.camRig.dist = 14;"),
        ('wait', 2500), ('shot', 'entrance'),
        ('js', "console.error('HALL ' + JSON.stringify({ pos: game.social.hall.pos.toArray().map(Math.round), venue: game.social.venue.pos.toArray().map(Math.round), booths: game.social.hall.booths.length, meetups: game.social.hall.meetups.length }))"),
        ('js', "const h = game.social.hall; const [x, z] = h.kit.w(0, 4); game.player.place(x, z, h.yaw + Math.PI); game.camRig.yaw = h.yaw + Math.PI; game.camRig.pitch = 0.12; game.camRig.dist = 9;"),
        ('wait', 1500), ('shot', 'inside'),
        ('js', "const h = game.social.hall; h.startPresenting({ title: 'Building Peak Bengaluru in a weekend', link: 'https://github.com/paraspipre/Project-forge', slides: [location.origin + '/og.jpg'], screen: false });"),
        ('wait', 2500), ('shot', 'presenting'),
        ('js', "const h = game.social.hall; const b = h.booths[1]; game.player.place(b.stand[0], b.stand[1], 0);"), ('wait', 800), ('shot', 'booth_prompt'),
        ('key', 'e', 50), ('wait', 700), ('shot', 'booth_form'),
        ('js', "document.getElementById('bo-title').value = 'Dosa Drone'; document.getElementById('bo-line').value = 'Delivers benne dose to your balcony in 10 minutes'; document.getElementById('bo-link').value = 'https://example.com/dosa'; document.querySelector('#boothview [data-a=save]').click();"),
        ('wait', 1200),
        ('js', "const h = game.social.hall; const b = h.booths[1]; const [x, z] = h.kit.w(b.sx * 9, b.z); game.player.place(x, z, 0); game.camRig.yaw = Math.atan2(b.stand[0] - x, b.stand[1] - z) ; game.camRig.pitch = 0.1; game.camRig.dist = 4;"), ('wait', 1500), ('shot', 'booth_up'),
        ('js', "game.social.hall.openCalendar()"), ('wait', 3000), ('shot', 'calendar'),
        ('js', "game.social.hall.closeAny(); game.social.hall.stopPresenting();"), ('wait', 500),
    ],
    'gta': [
        ('js', "game.atmo.override = 0.45"), ('wait', 3000),
        ('js', "const v = game.traffic.vehicles.filter(v => v.type.key === 'auto').sort((a, b) => Math.hypot(a.x - game.player.pos.x, a.z - game.player.pos.z) - Math.hypot(b.x - game.player.pos.x, b.z - game.player.pos.z))[0]; game.player.place(v.x + Math.cos(v.yaw) * (v.type.r + 0.9), v.z - Math.sin(v.yaw) * (v.type.r + 0.9)); window.__v = v; null"),
        ('wait', 400), ('shot', 'near_auto'),
        ('js', "const n = game.driving.nearestVehicle(); console.error('NEAR ' + JSON.stringify({ n: !!n, prompt: game.hud.promptText })); if (n) game.driving.enter(n);"),
        ('wait', 1500), ('shot', 'in_auto'),
        ('key', 'w', 2500), ('shot', 'driving'),
        ('js', "console.error('DRIVE ' + JSON.stringify({ mode: game.player.mode, veh: game.player.veh && game.player.veh.key, speed: +game.player.speed.toFixed(1), heat: game.driving.heat, cops: game.driving.cops.length }))"),
        ('js', "game.driving.addHeat(2, 'test'); "), ('wait', 2500), ('shot', 'police'),
        ('key', 'e', 50), ('wait', 800),
        ('js', "console.error('EXIT ' + JSON.stringify({ mode: game.player.mode, parked: game.driving.parked.length }))"),
        ('js', "game.driving.heat = 0; [...game.driving.cops].forEach(c => game.driving._removeCop(c)); const ped = game.crowd.peds.filter(p => p.x != null && !p.free).sort((a, b) => Math.hypot(a.x - game.player.pos.x, a.z - game.player.pos.z) - Math.hypot(b.x - game.player.pos.x, b.z - game.player.pos.z))[0]; game.player.place(ped.x, ped.z - 1.1, 0); window.__ped = ped; null"),
        ('wait', 200), ('key', 'x', 50), ('wait', 400), ('shot', 'punch'),
        ('js', "console.error('PUNCH ' + JSON.stringify({ anyFree: game.crowd.peds.filter(p => p.free).map(p => p.free.state), hp: game.combat.hp }))"),
        ('wait', 3000), ('shot', 'reaction'),
        ('js', "console.error('AFTER ' + JSON.stringify({ anyFree: game.crowd.peds.filter(p => p.free).map(p => p.free.state), hp: Math.round(game.combat.hp) }))"),
    ],
    'blasters': [
        ('js', "game.atmo.override = 0.5"), ('wait', 2500),
        ('js', "game.social.host('blasters')"), ('wait', 8000), ('shot', 'start'),
        ('js', "const B = game.blasters, p = game.player.pos; B.bots.forEach((b, i) => { const a = game.camRig.yaw + (i - 1) * 0.25; b.pos.set(p.x + Math.sin(a) * (12 + i * 4), 0, p.z + Math.cos(a) * (12 + i * 4)); }); null"),
        ('js', "window.__aim = setInterval(() => { const B = game.blasters; if (!B) return; const b = B.bots.filter(b => b.dead <= 0).sort((x, y) => x.pos.distanceTo(game.player.pos) - y.pos.distanceTo(game.player.pos))[0]; if (!b) return; const c = game.ren.camera.position; const d = Math.hypot(b.pos.x - game.player.pos.x, b.pos.z - game.player.pos.z); game.camRig.yaw = Math.atan2(b.pos.x - c.x, b.pos.z - c.z); game.camRig.pitch = Math.atan(0.7 / Math.max(3, d)); B.firing = true; }, 50); null"),
        ('wait', 6000), ('shot', 'fight'),
        ('js', "console.error('BLAST ' + JSON.stringify({ players: [...game.blasters.players.values()].map(p => [p.name, p.score, p.deaths]), hp: game.blasters.hp, ammo: game.blasters.ammo }))"),
        ('js', "game.blasters.key(3)"), ('wait', 3000), ('shot', 'sniper'),
        ('js', "clearInterval(window.__aim); game.blasters.firing = false; game.blasters.end()"), ('wait', 1500), ('shot', 'end'),
        ('js', "console.error('AFTER ' + JSON.stringify({ blasters: !!game.blasters, shoulder: game.camRig.shoulder, cur: !!game.social.cur }))"),
    ],
    'radio': [
        ('wait', 2000),
        ('js', "game.radio.openUI(); game.radio.play('kannada', 0)"), ('wait', 9000), ('shot', 'radio'),
        ('js', "console.error('RADIO ' + JSON.stringify({ on: game.radio.on, paused: game.radio.el.paused, t: +game.radio.el.currentTime.toFixed(1), st: game.radio.current(), n: (game.radio.lists.kannada || []).length }))"),
        ('js', "game.radio.play('hindi', 0)"), ('wait', 8000),
        ('js', "console.error('RADIO2 ' + JSON.stringify({ paused: game.radio.el.paused, t: +game.radio.el.currentTime.toFixed(1), st: game.radio.current() && game.radio.current().name, n: (game.radio.lists.hindi || []).length }))"),
        ('js', "game.radio.play('punjabi', 0)"), ('wait', 8000),
        ('js', "console.error('RADIO3 ' + JSON.stringify({ paused: game.radio.el.paused, t: +game.radio.el.currentTime.toFixed(1), st: game.radio.current() && game.radio.current().name, list: (game.radio.lists.punjabi || []).map(s => s.name) }))"),
        ('js', "game.radio.play('english', 0)"), ('wait', 8000),
        ('js', "console.error('RADIO4 ' + JSON.stringify({ paused: game.radio.el.paused, t: +game.radio.el.currentTime.toFixed(1), st: game.radio.current() && game.radio.current().name, n: (game.radio.lists.english || []).length }))"),
        ('js', "game.radio.stop(); game.radio.closeUI(); game.state = 'menu'; document.body.classList.remove('playing'); document.getElementById('menu').classList.remove('hidden'); game.hud.show(false)"), ('wait', 1000), ('shot', 'menu'),
    ],
    'gfx': [
        ('js', "game.atmo.override = 0.5"), ('wait', 2000),
        ('js', "const s = game._safeSpawn([700, 330, null]); game.player.place(s[0], s[1], s[2]); game.camRig.yaw = s[2] + 0.3; game.camRig.pitch = 0.2; game.camRig.dist = 11;"),
        ('wait', 2500), ('shot', 'noon'),
        ('js', "game.atmo.override = 0.27"), ('wait', 2500), ('shot', 'sunrise'),
        ('js', "game.camRig.yaw += Math.PI"), ('wait', 1500), ('shot', 'sunrise_back'),
        ('js', "game.atmo.override = 0.9"), ('wait', 2500), ('shot', 'night_traffic'),
        ('js', "console.error('GFX ' + JSON.stringify({ zebras: game.city.zebraCount, heads: game.traffic.lights.head.count, ao: game.ren.post.material.uniforms.uAO.value, sat: game.ren.post.material.uniforms.uSat.value }))"),
        ('js', "game.atmo.override = 0.45; game.player.toggleRide(); game.player.speed = 30; game.camRig.yaw = game.player.yaw;"), ('key', 'w', 1500), ('shot', 'speed'),
    ],
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
        await pg.wait_for_function("window.__ready === true && window.game && window.game.state === 'play'", timeout=240000)
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
            elif kind == 'click': await pg.mouse.click(st[1], st[2])
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
