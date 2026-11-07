#!/usr/bin/env python3
"""Render a zone file to a PNG map for eyeballing: python tools/preview_zone.py central out.png"""
import json, sys, numpy as np, cv2

zid, out = sys.argv[1], sys.argv[2]
d = json.load(open(f"data/zones/{zid}.json", encoding="utf-8"))
x0, z0, x1, z1 = [v / 10 for v in d["bounds"]]
S = 1400 / max(x1 - x0, z1 - z0)
W, H = int((x1 - x0) * S) + 1, int((z1 - z0) * S) + 1
img = np.full((H, W, 3), (215, 228, 236), np.uint8)
P = lambda f: np.array([[(f[i] / 10 - x0) * S, (f[i + 1] / 10 - z0) * S] for i in range(0, len(f), 2)], np.int32)
for a in d["areas"]:
    cv2.fillPoly(img, [P(a[1])], [(200, 215, 230), (190, 205, 235), (190, 195, 205), (185, 210, 190), (210, 200, 225), (180, 185, 190), (200, 200, 200)][a[0]])
for g in d["greens"]:
    cv2.fillPoly(img, [P(g[1])], [(140, 200, 150), (100, 160, 110), (130, 210, 170), (150, 200, 200), (160, 210, 180), (150, 180, 160)][g[0]])
for w in d["water"]:
    cv2.fillPoly(img, [P(w[0])], (220, 180, 120))
for r in d["roads"]:
    col = (250, 250, 250) if r[0] < 9 else (230, 240, 245)
    cv2.polylines(img, [P(r[4])], False, col, max(1, int(r[1] / 10 * S)), cv2.LINE_AA)
for b in d["buildings"]:
    h = b[1] / 10
    c = int(max(60, 190 - h * 3))
    cv2.fillPoly(img, [P(b[3])], (c, c, c + 10) if b[0] != 3 else (200, 150, 110))
for r in d["rail"]:
    cv2.polylines(img, [P(r[2])], False, [(120, 120, 120), (160, 60, 150), (120, 100, 140), (60, 140, 220)][r[0]], 3, cv2.LINE_AA)
for s in d["stations"]:
    p = (int((s[0] / 10 - x0) * S), int((s[1] / 10 - z0) * S))
    cv2.circle(img, p, 7, (160, 60, 150), -1)
    cv2.putText(img, d["names"][s[2]], (p[0] + 9, p[1]), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (60, 20, 60), 1, cv2.LINE_AA)
done = set()
for r in sorted(d["roads"], key=lambda r: r[0]):
    if r[3] >= 0 and r[0] <= 4 and r[3] not in done and len(r[4]) >= 4:
        done.add(r[3]); pts = P(r[4]); m = pts[len(pts) // 2]
        cv2.putText(img, d["names"][r[3]], (int(m[0]), int(m[1])), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (40, 40, 160), 1, cv2.LINE_AA)
cv2.imwrite(out, img)
print(W, H)
