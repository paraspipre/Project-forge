#!/usr/bin/env python3
"""List named features matching keywords in a zone's raw data with local coordinates (for placing landmarks)."""
import json, sys, re
sys.path.insert(0, 'tools')
import build_zones as bz
zid, pat = sys.argv[1], re.compile(sys.argv[2], re.I)
meta = json.load(open('tools/zones.json'))[zid]
s, w, n, e = meta['bbox']
proj = bz.Proj((s + n) / 2, (w + e) / 2)
for el in json.load(open(f'tools/osm_raw/{zid}.json', encoding='utf-8'))['elements']:
    t = el.get('tags', {})
    nm = t.get('name:en') or t.get('name') or ''
    if not pat.search(nm): continue
    kind = ','.join(f'{k}={t[k]}' for k in ('building', 'leisure', 'amenity', 'tourism', 'historic', 'highway', 'railway', 'natural', 'shop', 'bridge', 'layer') if k in t)
    if el['type'] == 'node':
        x, z = proj(el['lat'], el['lon']); print(f'node  {nm[:45]:45s} ({x:7.1f},{z:7.1f})  {kind}')
    else:
        o, _ = bz.element_rings(el, proj) if (el['type'] == 'relation' or (el.get('geometry') and el['geometry'][0] == el['geometry'][-1])) else ([], [])
        if o:
            r = o[0]; xs = [p[0] for p in r]; zs = [p[1] for p in r]
            print(f'{el["type"][:4]}  {nm[:45]:45s} c=({sum(xs)/len(xs):7.1f},{sum(zs)/len(zs):7.1f}) x[{min(xs):.0f},{max(xs):.0f}] z[{min(zs):.0f},{max(zs):.0f}] A={abs(bz.area(r)):.0f}  {kind}')
        elif el.get('geometry'):
            g = el['geometry']; a = proj(g[0]['lat'], g[0]['lon']); b = proj(g[-1]['lat'], g[-1]['lon'])
            print(f'line  {nm[:45]:45s} ({a[0]:.0f},{a[1]:.0f})->({b[0]:.0f},{b[1]:.0f})  {kind}')
