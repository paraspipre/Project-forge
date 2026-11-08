#!/usr/bin/env python3
"""Record the game's real audio output while riding through traffic, then measure it.
   python tools/audio_probe.py <base_url> <out.wav> [zone] [seconds]
Reports loudness, clipping, horn-band events and browser filter warnings."""
import sys, asyncio, base64, subprocess, json, os
import numpy as np
from playwright.async_api import async_playwright


async def record(url, zone, secs, out):
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=default", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width": 800, "height": 450})
        warns = []
        pg.on("console", lambda m: warns.append(m.text) if 'Biquad' in m.text or 'unstable' in m.text else None)
        await pg.goto(url + "?autoplay")
        await pg.wait_for_function("window.game && window.game.state === 'play'", timeout=240000)
        await pg.mouse.click(400, 200)
        await pg.evaluate(f"game.travel('{zone}')")
        await pg.wait_for_timeout(3000)
        await pg.evaluate("""() => {
          const a = game.audio; a.unlock();
          const dest = a.ctx.createMediaStreamDestination();
          a.master.connect(dest);
          window.__chunks = [];
          const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
          rec.ondataavailable = (e) => window.__chunks.push(e.data);
          rec.start(1000);
          window.__rec = rec;
          game.atmo.override = 0.4;
          game.player.toggleRide();
        }""")
        # ride through the traffic, steering a little
        for i in range(int(secs)):
            await pg.keyboard.down('w')
            if i % 4 == 2: await pg.keyboard.down('a')
            await pg.wait_for_timeout(1000)
            await pg.keyboard.up('a')
        await pg.keyboard.up('w')
        data = await pg.evaluate("""() => new Promise((res) => {
          window.__rec.onstop = async () => { const b = new Blob(window.__chunks, { type: 'audio/webm' }); const buf = await b.arrayBuffer(); let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); res(btoa(s)); };
          window.__rec.stop();
        })""")
        await b.close()
    webm = out + ".webm"
    open(webm, "wb").write(base64.b64decode(data))
    import imageio_ffmpeg
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-i", webm, "-ac", "1", "-ar", "22050", out], check=True)
    os.remove(webm)
    return warns


def analyse(path):
    import soundfile as sf
    x, sr = sf.read(path)
    x = np.nan_to_num(x)
    win = int(sr * 0.05)
    n = len(x) // win
    frames = x[: n * win].reshape(n, win)
    rms = np.sqrt((frames ** 2).mean(axis=1))
    # horn band energy (300-1000 Hz) per window, vs broadband
    spec = np.abs(np.fft.rfft(frames * np.hanning(win), axis=1))
    f = np.fft.rfftfreq(win, 1 / sr)
    band = spec[:, (f > 300) & (f < 1000)].sum(axis=1) / (spec.sum(axis=1) + 1e-9)
    loud = rms > max(0.02, np.median(rms) * 3)
    horny = (band > 0.55) & loud
    events = int(np.sum(np.diff(horny.astype(int)) == 1))
    flat = np.exp(np.log(spec + 1e-9).mean(axis=1)) / (spec.mean(axis=1) + 1e-9)
    noisy = int(np.sum((flat > 0.5) & (rms > 0.05)))
    return {
        "seconds": round(len(x) / sr, 1), "peak": round(float(np.abs(x).max()), 3), "clipped_%": round(float((np.abs(x) > 0.98).mean() * 100), 3),
        "rms_median": round(float(np.median(rms)), 4), "rms_p95": round(float(np.percentile(rms, 95)), 4),
        "horn_events": events, "horn_events_per_10s": round(events / (len(x) / sr) * 10, 1), "noisy_windows": noisy,
    }


if __name__ == "__main__":
    url, out = sys.argv[1], sys.argv[2]
    zone = sys.argv[3] if len(sys.argv) > 3 else "silkboard"
    secs = float(sys.argv[4]) if len(sys.argv) > 4 else 25
    warns = asyncio.run(record(url, zone, secs, out))
    r = analyse(out)
    r["filter_warnings"] = len(warns)
    print(json.dumps(r))
