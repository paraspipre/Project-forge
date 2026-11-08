#!/usr/bin/env python3
"""Autopilot every mission in every district and report which complete, fail or throw.
   python tools/quest_smoke.py <url> [zone ...]"""
import sys, asyncio, json
from playwright.async_api import async_playwright

ZONES = ['central', 'silkboard', 'koramangala', 'indiranagar', 'basavanagudi', 'bellandur', 'majestic', 'malleshwaram', 'ecity', 'whitefield']

# Runs inside the page: drives one quest to completion like an over-eager player.
AUTOPILOT = """async (qid) => {
  const g = window.game, Q = g.quests;
  const q = Q.story.quests.find((x) => x.id === qid);
  if (!q) return { qid, result: 'missing' };
  const errors = [];
  const onErr = (e) => errors.push(String(e.reason || e.message || e));
  window.addEventListener('unhandledrejection', onErr);
  const origErr = console.error;
  console.error = (...a) => { errors.push(a.map(String).join(' ').slice(0, 300)); origErr(...a); };
  const giver = Q.npcs.get(q.giver);
  if (giver) g.player.place(giver.pos.x + 1.5, giver.pos.z + 1.5);
  const done0 = g.profile.done.length;
  let finished = null;
  const p = Q.start(q).then(() => { finished = true; });
  const t0 = performance.now();
  let lastBig = '';
  const big = document.getElementById('bigtext');
  while (performance.now() - t0 < 120000) {
    await new Promise((r) => setTimeout(r, 120));
    if (!Q.active) break;
    if (big && !big.classList.contains('hidden')) lastBig = big.textContent;
    if (g.dlg.open) {
      if (g.dlg.typing) g.dlg.advance();
      else if (g.dlg.choosing) g.dlg.key(q.repeat ? 1 : g.dlg.choosing.n);
      else g.dlg.advance();
      continue;
    }
    // minigames: shoot the foam, carry the dosa, catch sixes
    const mg = Q.mini.session;
    if (mg && mg.name === 'foam') { g.input.edges.add('click'); g.camRig.yaw = Math.atan2(Q.mini._boss.position.x - g.player.pos.x, Q.mini._boss.position.z - g.player.pos.z); continue; }
    if (Q.pedTalk) { const ped = g.crowd.peds.find((x) => !x.greeted && x.x != null); if (ped) { g.player.place(ped.x + 1, ped.z + 1); Q.pedTalk.fn(ped); } continue; }
    if (Q.emoteHook) { g.doEmote('sit'); g.doEmote('cheer'); }
    const pick = Q.pickups.find((x) => !x.taken);
    if (pick) { g.player.pos.set(pick.x, pick.y - 1, pick.z); g.player.vel.set(0, 0, 0); continue; }
    if (Q.target) { g.player.place(Q.target.x, Q.target.z, 0, 1e3); g.player.pos.y = Math.max(g.player.pos.y, g.city.groundAt(Q.target.x, Q.target.z, 1e3)); if (g.player.mode !== 'ride' && /Ride|ride|scooter/.test(document.getElementById('obj-text').textContent)) g.player.toggleRide(); continue; }
  }
  window.removeEventListener('unhandledrejection', onErr);
  console.error = origErr;
  const ok = g.profile.done.length > done0 || (q.repeat && finished && !/FAILED|DNF/.test(lastBig));
  if (Q.active) { Q.cancelActive(); await new Promise((r) => setTimeout(r, 300)); }
  return { qid, result: ok ? 'pass' : (lastBig || 'timeout/fail'), errors: errors.slice(0, 3), secs: Math.round((performance.now() - t0) / 1000) };
}"""


async def main():
    url = sys.argv[1]
    zones = sys.argv[2:] or ZONES
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=default", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 960, "height": 540})
        await pg.goto(url + "?autoplay")
        await pg.wait_for_function("window.game && window.game.state === 'play'", timeout=90000)
        total = {'pass': 0, 'fail': 0}
        for z in zones:
            await pg.evaluate(f"game.travel('{z}')")
            await pg.wait_for_timeout(1500)
            qids = await pg.evaluate("game.quests.story.quests.map((q) => q.id)")
            # satisfy prerequisites by marking everything before as done when needed
            for qid in qids:
                await pg.evaluate("(qid) => { const q = game.quests.story.quests.find((x) => x.id === qid); for (const r of q.requires || []) if (!game.profile.done.includes(r)) game.profile.done.push(r); }", qid)
                res = await pg.evaluate(AUTOPILOT, qid)
                total['pass' if res['result'] == 'pass' else 'fail'] += 1
                print(f"{z:13s} {res['qid']:14s} {res['result'][:60]:60s} {res['secs']}s {('ERR: ' + ' | '.join(res['errors'])) if res['errors'] else ''}", flush=True)
        print(total)
        await b.close()

asyncio.run(main())
