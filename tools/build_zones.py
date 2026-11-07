#!/usr/bin/env python3
"""Turn raw Overpass downloads (tools/osm_raw/) into the compact zone files the game loads.

  python tools/build_zones.py [zone ...]     # writes data/zones/<zone>.json
  python tools/build_zones.py --city         # writes data/city.json (overview map)

Coordinates are metres in a local frame centred on the zone: +x east, +z south, stored as
integer decimetres. Map data © OpenStreetMap contributors (ODbL).
"""
import json, math, os, sys, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "tools", "osm_raw")
OUT = os.path.join(ROOT, "data", "zones")

# ---------------------------------------------------------------- geometry helpers

class Proj:
    def __init__(self, lat0, lon0):
        self.lat0, self.lon0 = lat0, lon0
        self.kx = 111320.0 * math.cos(math.radians(lat0))
        self.kz = 110574.0

    def __call__(self, lat, lon):
        return ((lon - self.lon0) * self.kx, (self.lat0 - lat) * self.kz)


def dp_simplify(pts, tol):
    """Douglas-Peucker on a list of (x, z)."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, az = pts[a]; bx, bz = pts[b]
        dx, dz = bx - ax, bz - az
        L = math.hypot(dx, dz) or 1e-9
        best, bi = -1, -1
        for i in range(a + 1, b):
            px, pz = pts[i]
            d = abs((px - ax) * dz - (pz - az) * dx) / L
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            stack.append((a, bi)); stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]


def simplify_ring(ring, tol):
    """Douglas-Peucker for a closed ring (no repeated end point): split at the vertex farthest from the first."""
    if len(ring) < 4:
        return ring
    x0, z0 = ring[0]
    k = max(range(len(ring)), key=lambda i: (ring[i][0] - x0) ** 2 + (ring[i][1] - z0) ** 2)
    a = dp_simplify(ring[:k + 1], tol)
    b = dp_simplify(ring[k:] + [ring[0]], tol)
    return a[:-1] + b[:-1]


def area(ring):
    s = 0.0
    for i in range(len(ring)):
        x1, z1 = ring[i]; x2, z2 = ring[(i + 1) % len(ring)]
        s += x1 * z2 - x2 * z1
    return s / 2


def centroid(ring):
    xs = [p[0] for p in ring]; zs = [p[1] for p in ring]
    return sum(xs) / len(xs), sum(zs) / len(zs)


def clip_poly(ring, x0, z0, x1, z1):
    """Sutherland-Hodgman clip of a closed ring to an axis-aligned rectangle."""
    def clip(pts, inside, inter):
        out = []
        for i in range(len(pts)):
            cur, prev = pts[i], pts[i - 1]
            ci, pi = inside(cur), inside(prev)
            if ci:
                if not pi: out.append(inter(prev, cur))
                out.append(cur)
            elif pi:
                out.append(inter(prev, cur))
        return out
    def ix(xc):
        return lambda a, b: (xc, a[1] + (b[1] - a[1]) * (xc - a[0]) / ((b[0] - a[0]) or 1e-9))
    def iz(zc):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (zc - a[1]) / ((b[1] - a[1]) or 1e-9), zc)
    pts = ring
    for inside, inter in ((lambda p: p[0] >= x0, ix(x0)), (lambda p: p[0] <= x1, ix(x1)),
                          (lambda p: p[1] >= z0, iz(z0)), (lambda p: p[1] <= z1, iz(z1))):
        if not pts: break
        pts = clip(pts, inside, inter)
    return pts


def clip_line(pts, x0, z0, x1, z1):
    """Split a polyline into the pieces inside the rectangle (Liang-Barsky per segment)."""
    pieces, cur = [], []
    for i in range(len(pts) - 1):
        (ax, az), (bx, bz) = pts[i], pts[i + 1]
        t0, t1 = 0.0, 1.0
        dx, dz = bx - ax, bz - az
        ok = True
        for p, q in ((-dx, ax - x0), (dx, x1 - ax), (-dz, az - z0), (dz, z1 - az)):
            if p == 0:
                if q < 0: ok = False; break
            else:
                t = q / p
                if p < 0: t0 = max(t0, t)
                else: t1 = min(t1, t)
        if not ok or t0 > t1:
            if len(cur) > 1: pieces.append(cur)
            cur = []
            continue
        a = (ax + dx * t0, az + dz * t0); b = (ax + dx * t1, az + dz * t1)
        if not cur: cur = [a]
        elif math.hypot(cur[-1][0] - a[0], cur[-1][1] - a[1]) > 0.01:
            if len(cur) > 1: pieces.append(cur)
            cur = [a]
        cur.append(b)
        if t1 < 1.0:
            if len(cur) > 1: pieces.append(cur)
            cur = []
    if len(cur) > 1: pieces.append(cur)
    return pieces


def assemble_rings(ways):
    """Join member way geometries (lists of points) into closed rings."""
    ways = [list(w) for w in ways if len(w) >= 2]
    rings = []
    while ways:
        ring = ways.pop(0)
        changed = True
        while ring[0] != ring[-1] and changed:
            changed = False
            for i, w in enumerate(ways):
                if w[0] == ring[-1]: ring += w[1:]
                elif w[-1] == ring[-1]: ring += w[::-1][1:]
                elif w[-1] == ring[0]: ring = w + ring[1:]
                elif w[0] == ring[0]: ring = w[::-1] + ring[1:]
                else: continue
                ways.pop(i); changed = True
                break
        if ring[0] == ring[-1] and len(ring) >= 4:
            rings.append(ring[:-1])
    return rings


def q(v):
    return int(round(v * 10))


def flat(pts):
    out = []
    for x, z in pts:
        out += [q(x), q(z)]
    return out


def stable_rand(key, salt=""):
    h = hashlib.md5((str(key) + salt).encode()).digest()
    return int.from_bytes(h[:4], "little") / 2**32


def num(s):
    try:
        return float(str(s).split(";")[0].replace("m", "").replace(",", ".").strip())
    except Exception:
        return None

# ---------------------------------------------------------------- classification

ROAD_W = {
    "motorway": 16, "trunk": 15, "primary": 13, "secondary": 11, "tertiary": 9,
    "motorway_link": 7, "trunk_link": 7, "primary_link": 7, "secondary_link": 6.5, "tertiary_link": 6,
    "residential": 6.5, "unclassified": 6.5, "living_street": 5, "service": 4, "road": 6,
    "pedestrian": 5, "footway": 2.2, "path": 2, "cycleway": 2.2, "steps": 2.5, "track": 3,
}
ROAD_CODE = {k: i for i, k in enumerate(["motorway", "trunk", "primary", "secondary", "tertiary", "link",
                                          "residential", "service", "pedestrian", "footway", "path", "construction"])}

BUILDING_KIND = {  # kind code: 0 residential, 1 shops, 2 office, 3 glass, 4 civic, 5 worship, 6 industrial, 7 roof/canopy, 8 construction, 9 station
    "house": 0, "residential": 0, "apartments": 0, "detached": 0, "terrace": 0, "dormitory": 0, "hut": 0,
    "commercial": 1, "retail": 1, "supermarket": 1, "kiosk": 1, "hotel": 1,
    "office": 2, "government": 4, "public": 4, "civic": 4, "school": 4, "college": 4, "university": 4,
    "hospital": 4, "kindergarten": 4, "stadium": 4, "sports_centre": 4, "museum": 4,
    "temple": 5, "church": 5, "mosque": 5, "cathedral": 5, "chapel": 5, "religious": 5, "shrine": 5,
    "industrial": 6, "warehouse": 6, "factory": 6, "garage": 6, "garages": 6, "service": 6, "shed": 6,
    "roof": 7, "carport": 7, "construction": 8, "train_station": 9, "transportation": 9,
}

POI_CAT = [  # (category code, test)
    ("food", lambda t: t.get("amenity") in ("restaurant", "fast_food", "food_court", "ice_cream")),
    ("cafe", lambda t: t.get("amenity") == "cafe" or t.get("shop") in ("coffee", "tea", "bakery")),
    ("pub", lambda t: t.get("amenity") in ("pub", "bar", "biergarten", "nightclub") or t.get("craft") == "brewery"),
    ("shop", lambda t: "shop" in t),
    ("bank", lambda t: t.get("amenity") in ("bank", "atm")),
    ("worship", lambda t: t.get("amenity") == "place_of_worship"),
    ("hotel", lambda t: t.get("tourism") in ("hotel", "guest_house", "hostel")),
    ("sight", lambda t: t.get("tourism") in ("attraction", "museum", "artwork", "viewpoint", "gallery") or "historic" in t),
    ("edu", lambda t: t.get("amenity") in ("school", "college", "university", "library")),
    ("health", lambda t: t.get("amenity") in ("hospital", "clinic", "pharmacy", "doctors")),
    ("office", lambda t: "office" in t or t.get("amenity") == "coworking_space"),
    ("transit", lambda t: t.get("amenity") in ("bus_station", "taxi", "fuel", "parking")),
]
POI_CODES = [c for c, _ in POI_CAT]

GREEN = {  # ground cover code: 0 grass/park, 1 forest/wood, 2 pitch/sports, 3 garden/flowers, 4 playground, 5 cemetery
    ("leisure", "park"): 0, ("leisure", "garden"): 3, ("leisure", "pitch"): 2, ("leisure", "stadium"): 2,
    ("leisure", "playground"): 4, ("leisure", "golf_course"): 0, ("leisure", "recreation_ground"): 0,
    ("leisure", "nature_reserve"): 1, ("landuse", "grass"): 0, ("landuse", "forest"): 1, ("natural", "wood"): 1,
    ("natural", "scrub"): 1, ("natural", "grassland"): 0, ("landuse", "meadow"): 0, ("landuse", "recreation_ground"): 0,
    ("landuse", "village_green"): 0, ("landuse", "cemetery"): 5, ("landuse", "orchard"): 1, ("landuse", "farmland"): 0,
    ("leisure", "sports_centre"): 2, ("landuse", "flowerbed"): 3,
}
AREA = {  # tinted ground: 0 residential, 1 commercial/retail, 2 industrial, 3 military, 4 institutional, 5 construction, 6 railway
    "residential": 0, "commercial": 1, "retail": 1, "industrial": 2, "military": 3, "education": 4,
    "institutional": 4, "religious": 4, "construction": 5, "brownfield": 5, "railway": 6, "garages": 2,
}

# ---------------------------------------------------------------- zone build


def element_rings(e, proj):
    """Outer and inner rings for a closed way or a multipolygon relation (projected)."""
    if e["type"] == "way":
        g = e.get("geometry") or []
        pts = [proj(p["lat"], p["lon"]) for p in g if p]
        if len(pts) >= 4 and pts[0] == pts[-1]:
            return [pts[:-1]], []
        return [], []
    outers, inners = [], []
    for m in e.get("members", []):
        if m.get("type") != "way" or not m.get("geometry"):
            continue
        pts = [proj(p["lat"], p["lon"]) for p in m["geometry"] if p]
        (inners if m.get("role") == "inner" else outers).append(pts)
    return assemble_rings(outers), assemble_rings(inners)


def building_height(t, a, key):
    h = num(t.get("height") or t.get("building:height") or "")
    lv = num(t.get("building:levels") or "")
    kind = t.get("building", "yes")
    r = stable_rand(key)
    if h and 2 < h < 300:
        return h
    if lv and 0 < lv < 90:
        return lv * 3.2 + (1.0 if lv > 1 else 0.6)
    if kind in ("roof", "carport"): return 4.5
    if kind in ("house", "detached", "terrace", "hut"): return [6.8, 9.8, 9.8, 13.0][int(r * 4)]
    if kind == "apartments": return 13 + int(r * 5) * 3.2
    if kind in ("temple", "shrine"): return 6 + r * 4
    if kind in ("church", "cathedral", "mosque"): return 12 + r * 6
    if kind in ("office",): return 16 + int(r * 6) * 3.4
    if kind in ("commercial", "retail", "hotel"): return 10 + int(r * 4) * 3.2
    if kind in ("industrial", "warehouse", "garage", "garages", "shed"): return 6 + r * 4
    if kind == "construction": return 8 + r * 16
    if kind in ("school", "college", "university", "hospital", "government", "public"): return 10 + int(r * 3) * 3.4
    # building=yes: Bangalore's typical G+2/G+3 with the odd taller block, scaled by footprint
    if a < 60: return [6.6, 9.8, 9.8, 13.0][int(r * 4)]
    if a < 250: return [9.8, 13.0, 13.0, 16.2][int(r * 4)]
    if a < 1200: return [13.0, 16.2, 19.4, 22.6][int(r * 4)]
    if a < 5000: return [13.0, 19.4, 25.8, 32.2][int(r * 4)]
    return [10, 16, 22][int(r * 3)]


def build_zone(zid, meta):
    raw = json.load(open(os.path.join(RAW, f"{zid}.json"), encoding="utf-8"))["elements"]
    s, w, n, e = meta["bbox"]
    lat0, lon0 = (s + n) / 2, (w + e) / 2
    proj = Proj(lat0, lon0)
    x0, z0 = proj(n, w); x1, z1 = proj(s, e)  # north-west / south-east corners
    M = 2.0
    inside = lambda x, z: x0 - M <= x <= x1 + M and z0 - M <= z <= z1 + M

    names, name_ix = [], {}
    def nid(name):
        if not name: return -1
        if name not in name_ix:
            name_ix[name] = len(names); names.append(name)
        return name_ix[name]

    buildings, roads, water, waterways, greens, areas, rail, stations, pois, trees = [], [], [], [], [], [], [], [], [], []
    seen_parts = set()

    for el in raw:
        t = el.get("tags", {})
        key = f"{el['type']}{el['id']}"

        # ---- buildings (and building:part pieces, e.g. towers on a podium)
        if ("building" in t or "building:part" in t) and el["type"] in ("way", "relation"):
            if t.get("building") in ("no", "ruins") or t.get("location") == "underground":
                continue
            outers, inners = element_rings(el, proj)
            for ring in outers:
                cx, cz = centroid(ring)
                if not inside(cx, cz):
                    continue
                ring = simplify_ring(ring, 0.35)
                if len(ring) < 3: continue
                a = abs(area(ring))
                if a < 6: continue
                if area(ring) < 0: ring = ring[::-1]  # store counter-clockwise in (x, z)
                h = building_height(t, a, key)
                minh = num(t.get("min_height") or "") or ((num(t.get("building:min_level") or "") or 0) * 3.2)
                kindtag = t.get("building") if t.get("building") not in (None, "yes") else t.get("building:part", "yes")
                kind = BUILDING_KIND.get(kindtag, 1 if any(k in t for k in ("shop", "amenity")) else 0)
                if kind in (1, 2) and (h > 30 or (a > 2500 and h > 20)): kind = 3
                if kindtag in ("yes", "part") and kind == 0:
                    # plain 'yes' buildings on commercial roads get shopfronts; decided at runtime by road proximity
                    kind = 0
                rec = [kind, q(h), q(minh or 0), flat(ring)]
                nm = t.get("name")
                if nm or inners:
                    rec.append(nid(nm))
                if inners:
                    hs = []
                    for hr in inners:
                        hr = simplify_ring(hr, 0.35)
                        if len(hr) >= 3 and abs(area(hr)) > 4:
                            hs.append(flat(hr if area(hr) < 0 else hr[::-1]))
                    if hs: rec.append(hs)
                buildings.append(rec)
            continue

        # ---- roads
        if el["type"] == "way" and "highway" in t:
            hw = t["highway"]
            if hw in ("proposed", "abandoned", "platform", "bus_stop", "corridor", "elevator", "raceway", "bridleway"):
                continue
            if t.get("footway") in ("sidewalk", "crossing") or t.get("area") == "yes":
                continue
            if t.get("tunnel") in ("yes", "building_passage", "culvert"):
                continue
            base = hw.replace("_link", "") if hw.endswith("_link") else hw
            if hw == "construction":
                base = t.get("construction", "residential").replace("_link", "")
            w_ = ROAD_W.get(hw, ROAD_W.get(base, 5))
            lanes = num(t.get("lanes") or "")
            if lanes and hw not in ("footway", "path", "steps", "cycleway"):
                w_ = max(w_, min(lanes * 3.3 + 1.0, 28) if t.get("oneway") == "yes" else min(lanes * 3.3 + 1.5, 30))
            if hw.endswith("_link"): code = ROAD_CODE["link"]
            elif hw == "construction": code = ROAD_CODE["construction"]
            elif base in ("motorway", "trunk", "primary", "secondary", "tertiary"): code = ROAD_CODE[base]
            elif base in ("residential", "unclassified", "living_street", "road", "track"): code = ROAD_CODE["residential"]
            elif base == "service": code = ROAD_CODE["service"]
            elif base == "pedestrian": code = ROAD_CODE["pedestrian"]
            elif base in ("footway", "steps", "cycleway"): code = ROAD_CODE["footway"]
            else: code = ROAD_CODE["path"]
            layer = int(num(t.get("layer") or "") or 0)
            bridge = t.get("bridge") not in (None, "no")
            flags = (1 if t.get("oneway") in ("yes", "-1") else 0) | (2 if bridge else 0) | ((max(0, min(layer, 3))) << 2)
            pts = [proj(p["lat"], p["lon"]) for p in el.get("geometry", []) if p]
            if t.get("oneway") == "-1": pts = pts[::-1]
            for piece in clip_line(pts, x0 - M, z0 - M, x1 + M, z1 + M):
                piece = dp_simplify(piece, 0.4)
                if len(piece) >= 2:
                    roads.append([code, q(w_), flags, nid(t.get("name") or t.get("ref")), flat(piece), el["id"] % 100000])
            continue

        # ---- rail: metro viaducts, tracks, construction
        if el["type"] == "way" and "railway" in t:
            rw = t["railway"]
            if rw in ("platform", "proposed", "abandoned", "miniature", "disused"):
                continue
            tunnel = t.get("tunnel") in ("yes",) or (num(t.get("layer") or "") or 0) < 0
            elevated = t.get("bridge") not in (None, "no") or (num(t.get("layer") or "") or 0) > 0
            if rw == "construction": kind = 3
            elif tunnel: kind = 2
            elif elevated: kind = 1
            else: kind = 0
            if rw in ("subway", "light_rail") and not tunnel and not elevated and kind == 0:
                kind = 1  # Namma Metro outside tunnels is elevated
            pts = [proj(p["lat"], p["lon"]) for p in el.get("geometry", []) if p]
            for piece in clip_line(pts, x0 - M, z0 - M, x1 + M, z1 + M):
                piece = dp_simplify(piece, 0.5)
                if len(piece) >= 2:
                    rail.append([kind, nid(t.get("name") or ""), flat(piece), 1 if rw in ("subway", "light_rail", "construction") else 0])
            continue

        # ---- stations
        if el["type"] == "node" and (t.get("railway") in ("station", "halt") or t.get("public_transport") == "station"):
            x, z = proj(el["lat"], el["lon"])
            if inside(x, z) and t.get("name"):
                metro = t.get("station") == "subway" or "metro" in t.get("network", "").lower() or t.get("subway") == "yes" or "Namma" in t.get("network", "")
                stations.append([q(x), q(z), nid(t["name"].split(",")[0]), 1 if metro else 0])
            continue

        # ---- waterways (drains / canals) as lines
        if el["type"] == "way" and "waterway" in t and t["waterway"] in ("canal", "drain", "stream", "river", "ditch"):
            if t.get("tunnel"): continue
            pts = [proj(p["lat"], p["lon"]) for p in el.get("geometry", []) if p]
            wv = num(t.get("width") or "") or {"canal": 8, "river": 12, "drain": 4, "stream": 3, "ditch": 2}[t["waterway"]]
            for piece in clip_line(pts, x0 - M, z0 - M, x1 + M, z1 + M):
                piece = dp_simplify(piece, 0.6)
                if len(piece) >= 2:
                    waterways.append([q(wv), flat(piece)])
            continue

        # ---- polygons: water, greens, landuse areas
        if el["type"] in ("way", "relation"):
            is_water = t.get("natural") == "water" or t.get("water") in ("lake", "pond", "reservoir", "basin") or t.get("landuse") in ("reservoir", "basin") or t.get("leisure") == "swimming_pool"
            gcode = None
            for (k, v), c in GREEN.items():
                if t.get(k) == v:
                    gcode = c; break
            acode = AREA.get(t.get("landuse") or "", None)
            if acode is None and t.get("amenity") in ("school", "college", "university", "hospital"):
                acode = 4
            if not is_water and gcode is None and acode is None:
                # named structures like pitches carry names (Chinnaswamy) — handled above via leisure
                if el["type"] == "node": pass
                continue
            outers, inners = element_rings(el, proj)
            for ring in outers:
                ring = clip_poly(ring, x0 - M, z0 - M, x1 + M, z1 + M)
                if len(ring) < 3: continue
                ring = simplify_ring(ring, 0.8)
                if len(ring) < 3 or abs(area(ring)) < 12: continue
                if area(ring) < 0: ring = ring[::-1]
                hs = []
                for hr in inners:
                    hr = clip_poly(hr, x0 - M, z0 - M, x1 + M, z1 + M)
                    if len(hr) >= 3 and abs(area(hr)) > 6:
                        hr = simplify_ring(hr, 0.8)
                        if len(hr) >= 3: hs.append(flat(hr if area(hr) < 0 else hr[::-1]))
                rec_name = nid(t.get("name"))
                if is_water:
                    water.append([flat(ring), hs, rec_name, 1 if t.get("leisure") == "swimming_pool" else 0])
                elif gcode is not None:
                    greens.append([gcode, flat(ring), hs, rec_name, abs(int(area(ring)))])
                else:
                    areas.append([acode, flat(ring), hs])
            continue

        # ---- point features: trees, named places
        if el["type"] == "node":
            x, z = proj(el["lat"], el["lon"])
            if not inside(x, z):
                continue
            if t.get("natural") == "tree":
                trees += [q(x), q(z)]
                continue
            nm = t.get("name:en") or t.get("name")
            if not nm:
                continue
            for code, test in POI_CAT:
                if test(t):
                    pois.append([q(x), q(z), POI_CODES.index(code), nid(nm)])
                    break

    # draw order: biggest areas first so small parks/pitches sit on top
    greens.sort(key=lambda g: -g[4])
    for g in greens: g.pop()  # drop the sort key
    out = {
        "id": zid, "name": meta["name"], "origin": [round(lat0, 6), round(lon0, 6)],
        "bounds": [q(x0), q(z0), q(x1), q(z1)],
        "names": names, "poiCats": POI_CODES,
        "buildings": buildings, "roads": roads, "rail": rail, "stations": stations,
        "water": water, "waterways": waterways, "greens": greens, "areas": areas,
        "pois": pois, "trees": trees,
    }
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{zid}.json")
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{zid}: {len(buildings)} buildings, {len(roads)} roads, {len(rail)} rail, {len(stations)} stations, "
          f"{len(water)} water, {len(greens)} greens, {len(areas)} areas, {len(pois)} pois, {len(trees)//2} trees "
          f"-> {os.path.getsize(path)/1e6:.2f} MB")


def build_city():
    raw = json.load(open(os.path.join(RAW, "_city.json"), encoding="utf-8"))["elements"]
    lat0, lon0 = 12.9716, 77.5946
    proj = Proj(lat0, lon0)
    roads, water, rail, parks, stations = [], [], [], [], []
    rank = {"motorway": 0, "trunk": 0, "primary": 1, "secondary": 2, "motorway_link": 1, "trunk_link": 1}
    for el in raw:
        t = el.get("tags", {})
        if el["type"] == "way" and "highway" in t:
            pts = dp_simplify([proj(p["lat"], p["lon"]) for p in el.get("geometry", []) if p], 6)
            if len(pts) >= 2:
                roads.append([rank.get(t["highway"], 2), [int(round(v / 5)) for xy in pts for v in xy], t.get("name", "")])
        elif el["type"] == "way" and "railway" in t:
            if t.get("railway") in ("subway", "light_rail", "construction"):
                kind = 1
            elif t.get("railway") == "rail":
                kind = 0
            else:
                continue
            pts = dp_simplify([proj(p["lat"], p["lon"]) for p in el.get("geometry", []) if p], 6)
            col = (t.get("colour") or "").lower()
            nm = t.get("name", "")
            line = "purple" if "purple" in nm.lower() or "reach 1" in nm.lower() or "reach 2" in nm.lower() or "UG" in nm else "green" if "green" in nm.lower() or "reach 3" in nm.lower() or "reach 4" in nm.lower() else "yellow" if "yellow" in nm.lower() else "pink" if "pink" in nm.lower() else "blue" if "blue" in nm.lower() else ""
            if len(pts) >= 2:
                rail.append([kind, [int(round(v / 5)) for xy in pts for v in xy], line or col])
        elif el["type"] == "node" and t.get("railway") == "station" and t.get("name"):
            x, z = proj(el["lat"], el["lon"])
            stations.append([int(round(x / 5)), int(round(z / 5)), t["name"].split(",")[0], 1 if t.get("station") == "subway" else 0])
        elif el["type"] in ("way", "relation"):
            is_water = t.get("natural") == "water"
            if not is_water and t.get("leisure") != "park":
                continue
            outers, _ = element_rings(el, proj)
            for ring in outers:
                a = abs(area(ring))
                if a < (8000 if is_water else 40000):
                    continue
                ring = simplify_ring(ring, 8)
                if len(ring) < 3: continue
                rec = [[int(round(v / 5)) for xy in ring for v in xy], t.get("name", "")]
                (water if is_water else parks).append(rec)
    out = {"origin": [lat0, lon0], "scale": 5, "roads": roads, "water": water, "rail": rail, "parks": parks, "stations": stations}
    path = os.path.join(ROOT, "data", "city.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"city: {len(roads)} roads, {len(water)} lakes, {len(rail)} rail, {len(parks)} parks -> {os.path.getsize(path)/1e6:.2f} MB")


def main():
    args = sys.argv[1:]
    if "--city" in args:
        build_city(); return
    zones = json.load(open(os.path.join(ROOT, "tools", "zones.json")))
    for zid in (args or list(zones)):
        if os.path.exists(os.path.join(RAW, f"{zid}.json")):
            build_zone(zid, zones[zid])
        else:
            print(f"{zid}: no raw data (run tools/fetch_osm.py {zid})")


if __name__ == "__main__":
    main()
