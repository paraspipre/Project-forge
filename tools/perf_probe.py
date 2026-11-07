#!/usr/bin/env python3
"""Measure draw calls / triangles / frame time at a few spots: python tools/perf_probe.py <url> [quality]"""
import sys, asyncio, json
from playwright.async_api import async_playwright
JS = """async () => {
  const g = window.game, r = g.ren.r;
  const out = [];
  const spots = [[612, 92, 0.6], [400, 600, 2.0], [-900, 100, 1.0], [0, -300, 3.0]];
  for (const [x, z, yaw] of spots) {
    g.player.place(x, z, yaw); g.camRig.yaw = yaw; g.camRig.pitch = 0.2;
    await new Promise(res => setTimeout(res, 1500));
    r.info.autoReset = false; r.info.reset();
    const t0 = performance.now(); let n = 0;
    await new Promise(res => { const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    const calls = Math.round(r.info.render.calls / n), tris = Math.round(r.info.render.triangles / n / 1000);
    r.info.autoReset = true;
    out.push({ at: [x, z], fps: Math.round(n / ((performance.now() - t0) / 1000)), calls, ktris: tris, geoms: r.info.memory.geometries, tex: r.info.memory.textures });
  }
  return out;
}"""
async def main():
    url = sys.argv[1]
    q = sys.argv[2] if len(sys.argv) > 2 else None
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=default", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1280, "height": 720})
        if q: await pg.add_init_script(f"localStorage.setItem('pb.quality', '{q}')")
        await pg.goto(url + "?autoplay")
        await pg.wait_for_function("window.game && window.game.state === 'play'", timeout=90000)
        print(json.dumps(await pg.evaluate(JS)))
        print(await pg.evaluate("navigator.userAgent + ' | ' + (() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; })()"))
        await b.close()
asyncio.run(main())
