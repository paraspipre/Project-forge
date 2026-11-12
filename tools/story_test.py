#!/usr/bin/env python3
"""Story mode + AI characters, end to end. Run against the dev server (AGENT_MOCK=1 npm run dev, or a real key):
   python tools/story_test.py http://127.0.0.1:8770 <out_dir>
Checks: prologue cut-scene, chapter objective, Maga chat, an AI resident (favour), chapter outro -> green,
the finale conversation with SIGNAL -> ending."""
import sys, asyncio, json, os
from playwright.async_api import async_playwright

SKIP_DIALOGUE = "(() => { if (game.dlg.open) { if (game.dlg.typing) game.dlg.advance(); else if (game.dlg.choosing) game.dlg.key(1); else game.dlg.advance(); } })()"

async def drain(pg, secs):
    for _ in range(int(secs * 4)):
        await pg.evaluate(SKIP_DIALOGUE)
        await pg.wait_for_timeout(250)

async def main():
    base, out = sys.argv[1].rstrip('/'), sys.argv[2]
    os.makedirs(out, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=default", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width": 1280, "height": 720})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(base + "/index.html?story")
        await pg.wait_for_function("window.game && game.state === 'play' && game.zoneId === 'majestic' && !game.traveling", timeout=240000)
        await pg.wait_for_function("game.quests.active && game.quests.active.q.beat", timeout=30000)
        await pg.wait_for_timeout(2600)
        await pg.screenshot(path=os.path.join(out, 'story_1_prologue.png'))
        await drain(pg, 12)
        st = await pg.evaluate("({ ai: game.agents.online, mode: game.mode, done: game.profile.campaign.done, obj: document.getElementById('obj-text').textContent, kick: document.getElementById('obj-kicker').textContent, chip: document.getElementById('sigchip').textContent, freeze: +game.traffic.freeze.toFixed(2), residents: [...game.quests.npcs.values()].filter(n => n.def.ai).map(n => n.name) })")
        print('PROLOGUE', json.dumps(st, ensure_ascii=False))
        await pg.screenshot(path=os.path.join(out, 'story_2_objective.png'))
        # Maga, your phone AI
        await pg.keyboard.press('g')
        await pg.wait_for_timeout(600)
        await pg.fill('.ac-in', 'Where should I go next?')
        await pg.press('.ac-in', 'Enter')
        await pg.wait_for_function("document.querySelectorAll('.ac-msg.them').length >= 2 && !document.querySelector('.ac-msg.typing')", timeout=40000)
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=os.path.join(out, 'story_3_maga.png'))
        print('MAGA', await pg.evaluate("[...document.querySelectorAll('.ac-msg')].map(m => (m.classList.contains('me') ? 'ME: ' : 'MAGA: ') + m.textContent).slice(-3)"))
        await pg.keyboard.press('Escape')
        # an AI resident: talk, ask for a favour
        await pg.evaluate("(() => { const n = [...game.quests.npcs.values()].find(n => n.def.ai && n.home); game.player.place(n.pos.x + 1.4, n.pos.z + 1.2); window.__res = n.id; game.quests.talk(n); })()")
        await pg.wait_for_timeout(800)
        await pg.fill('.ac-in', 'Hi! My name is Paras. Need any help? I can do you a favour')
        await pg.press('.ac-in', 'Enter')
        await pg.wait_for_function("document.querySelectorAll('.ac-msg.them').length >= 2 && !document.querySelector('.ac-msg.typing')", timeout=40000)
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=os.path.join(out, 'story_4_resident.png'))
        await pg.wait_for_timeout(2400)
        fav = await pg.evaluate("({ quest: game.quests.active && game.quests.active.q.title, mem: game.profile.ai[window.__res], chat: game.agents.open })")
        print('RESIDENT', json.dumps(fav, ensure_ascii=False)[:600])
        await pg.evaluate("game.agents.close(); game.quests.cancelActive()")
        await pg.wait_for_timeout(800)
        # finish the prologue's missions -> outro -> Majestic goes green
        await pg.evaluate("game.profile.done.push('ma_bus', 'ma_train'); game.saveProfile()")
        await pg.wait_for_function("game.quests.active && game.quests.active.q.id === 'beat:pro:out'", timeout=30000)
        await drain(pg, 16)
        await pg.wait_for_function("!game.quests.active", timeout=40000)
        st2 = await pg.evaluate("({ green: game.profile.campaign.green, obj: document.getElementById('obj-text').textContent, chip: document.getElementById('sigchip').textContent, coins: game.profile.coins })")
        print('OUTRO', json.dumps(st2, ensure_ascii=False))
        # jump to the finale
        await pg.evaluate("""(() => { const c = game.profile.campaign; for (const id of ['pro','c1','c2','c3','c4','c5']) { c.done[id + ':in'] = true; c.done[id + ':out'] = true; }
            c.clues = ['permit', 'honks', 'adjust', 'seen', 'chinni']; c.crew = ['manju', 'farah', 'seenappa', 'dr_lake']; c.green = ['majestic','central','koramangala','basavanagudi','bellandur','ecity'];
            game.saveProfile(); void game.travel('silkboard'); })()""")
        await pg.wait_for_function("game.zoneId === 'silkboard' && game.state === 'play' && !game.traveling", timeout=120000)
        await pg.wait_for_function("game.quests.active && game.quests.active.q.id === 'beat:fin:in'", timeout=30000)
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=os.path.join(out, 'story_5_finale_intro.png'))
        await drain(pg, 14)
        await pg.evaluate("game.profile.done.push('sb_cross'); game.saveProfile()")
        await pg.evaluate("(() => { const t = game.campaign.towerNpc; game.player.place(t.pos.x + 6, t.pos.z + 6); })()")
        await pg.wait_for_function("game.agents.open && game.agents.chat.opts.confront", timeout=60000)
        await drain(pg, 0.5)
        for arg in ['Chinni, Vasudha still sings to you, you know.', 'You were made to serve people, not stop them.', 'People honk because they are late for people they love.', 'We see you, SIGNAL. Thank you for seventy years.', 'This city runs on adjusting for each other.']:
            if not await pg.evaluate("game.agents.open"): break
            if await pg.evaluate("game.agents.online"):
                await pg.fill('.ac-in', arg)
                await pg.press('.ac-in', 'Enter')
            else:
                await pg.evaluate("(() => { const chips = [...document.querySelectorAll('.ac-chip')].filter(c => !/or else/.test(c.textContent)); const used = window.__used || (window.__used = new Set()); const c = chips.find(c => !used.has(c.textContent)); if (c) { used.add(c.textContent); c.click(); } })()")
            await pg.wait_for_function("!document.querySelector('.ac-msg.typing')", timeout=40000)
            await pg.wait_for_timeout(700)
            print('SIGNAL convinced', await pg.evaluate("game.profile.campaign.convinced"))
        await pg.screenshot(path=os.path.join(out, 'story_6_signal.png'))
        await pg.wait_for_function("document.getElementById('credits') || game.profile.campaign.finished", timeout=60000)
        await drain(pg, 16)
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=os.path.join(out, 'story_7_end.png'))
        st3 = await pg.evaluate("({ finished: game.profile.campaign.finished, credits: !!document.getElementById('credits'), freeze: game.traffic.freeze, titles: game.profile.titles })")
        print('END', json.dumps(st3))
        log = await pg.evaluate("fetch('/__agentlog').then(r => r.ok ? r.json() : []).then(l => l.map(r => [r.model, r.system[1].text.slice(0, 30), r.messages.length])).catch(() => [])")
        print('AI CALLS', len(log), log[:4])
        for e in dict.fromkeys(errs):
            if 'BiquadFilter' in e or 'WebSocket' in e or 'Failed to load resource' in e: continue
            print('ERR', e[:300])
        await b.close()

asyncio.run(main())
