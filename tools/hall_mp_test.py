#!/usr/bin/env python3
"""Two players in the Meetup Hall: A presents with a (fake) screen share, B watches.
   Checks: B sees A on stage, receives the screen video, sees A's booth; B reacts and raises a hand.
   python tools/hall_mp_test.py <url> <out_dir>"""
import sys, asyncio, json, random, os
from playwright.async_api import async_playwright

FAKE_SCREEN = """
navigator.mediaDevices.getDisplayMedia = async () => {
  const c = document.createElement('canvas'); c.width = 640; c.height = 360;
  const x = c.getContext('2d'); let t = 0;
  setInterval(() => { t++; x.fillStyle = '#123'; x.fillRect(0, 0, 640, 360); x.fillStyle = '#f2c14e'; x.font = '48px sans-serif';
    x.fillText('MY SCREEN ' + t, 40 + (t % 100), 180); x.fillStyle = '#e75a7c'; x.fillRect((t * 7) % 600, 260, 40, 40); }, 100);
  return c.captureStream(10);
};
"""

async def main():
    url, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    room = 'hall' + str(random.randint(1000, 9999))
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=[
            "--use-angle=default", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required",
            "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        pages = []
        for i in range(2):
            ctx = await b.new_context(viewport={"width": 1100, "height": 620}, permissions=["microphone"])
            pg = await ctx.new_page()
            pg.on("pageerror", lambda e, i=i: print(f"[p{i} pageerror] {e}"))
            pg.on("console", lambda m, i=i: print(f"[p{i} {m.type}] {m.text[:200]}") if m.type == 'error' else None)
            await pg.goto(f"{url}?room={room}&zone=central&autoplay")
            await pg.wait_for_function("window.game && window.game.state === 'play'", timeout=240000)
            await pg.mouse.click(500, 300)
            pages.append(pg)
        a, v = pages
        await a.add_script_tag(content=FAKE_SCREEN)
        # A on stage, B on a bench facing the screen
        await a.evaluate("(() => { const h = game.social.hall; const [x, z] = h.kit.w(0, -9.5); game.player.place(x, z, h.yaw, 1.2); })()")
        await v.evaluate("(() => { const h = game.social.hall; const [x, z] = h.kit.w(1.5, 2); game.player.place(x, z, h.yaw + Math.PI); game.camRig.yaw = h.yaw + Math.PI; game.camRig.pitch = 0.05; game.camRig.dist = 6; })()")
        await a.wait_for_function("game.remotes.size > 0", timeout=30000)
        await v.wait_for_function("game.remotes.size > 0", timeout=30000)
        # A puts up a booth and starts a talk with a screen share
        await a.evaluate("game.net.booth(2, { owner: game.profile.id, name: game.profile.name, title: 'Hover Auto OS', line: 'An OS for flying autos', link: 'https://example.com', t: Date.now() })")
        await a.evaluate("(async () => { const h = game.social.hall; const ok = await h.share.start(); h.startPresenting({ title: 'Live demo: Hover Auto OS', link: 'https://example.com', slides: [], screen: ok }); })()")
        ok = False
        for t in range(30):
            await v.wait_for_timeout(1000)
            st = await v.evaluate("(() => { const h = game.social.hall; const vid = h.share.video; return { stage: h.stage && h.stage.title, screen: h.stage && h.stage.screen, inc: !!h.share.inc, ok: !!(h.share.inc && h.share.inc.ok), video: !!vid, w: vid ? vid.videoWidth : 0, ready: vid ? vid.readyState : -1, tex: !!h.videoTex, booth: h.booths[2].data && h.booths[2].data.title }; })()")
            if st['w'] > 0 and st['tex']:
                ok = True
                break
        print(f'viewer after ~{t + 1}s:', json.dumps(st))
        await v.wait_for_timeout(1500)
        await v.screenshot(path=os.path.join(out, 'hall_viewer.png'))
        # B reacts and raises a hand; A should get the hand
        await v.evaluate("game.social.hall.react(0); game.social.hall.raiseHand();")
        await a.wait_for_timeout(2500)
        sa = await a.evaluate("({ hands: [...game.social.hall.hands.values()], viewers: game.social.hall.share.out.size, flags: game.voice.flags })")
        print('presenter:', json.dumps(sa))
        await a.screenshot(path=os.path.join(out, 'hall_presenter.png'))
        # A gives B the floor
        bid = await v.evaluate("game.profile.id")
        await a.evaluate(f"game.social.hall.giveFloor('{bid}')")
        await v.wait_for_timeout(2500)
        print('viewer floor:', await v.evaluate("({ floor: !!game.social.hall.floorOn, flags: game.voice.flags })"))
        await v.evaluate("game.social.hall.openFull()")
        await v.wait_for_timeout(1200)
        await v.screenshot(path=os.path.join(out, 'hall_fullview.png'))
        await a.evaluate("game.social.hall.stopPresenting(); game.net.booth(2, null)")
        await v.wait_for_timeout(2000)
        print('after stop:', await v.evaluate("({ stage: game.social.hall.stage, video: !!game.social.hall.share.video })"))
        print('RESULT', 'PASS' if ok and sa['hands'] else 'FAIL')
        await b.close()

asyncio.run(main())
