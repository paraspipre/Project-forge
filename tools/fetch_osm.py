#!/usr/bin/env python3
"""Download raw OpenStreetMap data for each game zone from the Overpass API.

  python tools/fetch_osm.py [zone ...]      # default: every zone in tools/zones.json
  python tools/fetch_osm.py --city          # the whole-city overview (major roads, lakes, metro)

Raw responses go to tools/osm_raw/ (not committed); tools/build_zones.py turns them
into the compact files the game loads. Map data © OpenStreetMap contributors (ODbL).
"""
import json, os, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "tools", "osm_raw")
EP = "https://overpass-api.de/api/interpreter"
UA = "PeakBengaluruGame/0.1 (https://game.paraspipre.com)"

ZONE_Q = """[out:json][timeout:600][maxsize:536870912];
(
  way["building"]({b}); relation["building"]({b});
  way["building:part"]({b});
  way["highway"]({b});
  way["natural"~"water|wood|scrub|grassland"]({b}); relation["natural"~"water|wood"]({b});
  way["water"]({b}); way["waterway"]({b});
  way["leisure"]({b}); relation["leisure"]({b});
  way["landuse"]({b}); relation["landuse"]({b});
  way["amenity"]({b}); way["man_made"]({b});
  way["railway"]({b});
  node["railway"~"station|halt"]({b}); node["public_transport"="station"]({b});
  node["amenity"]({b}); node["shop"]({b}); node["tourism"]({b}); node["historic"]({b});
  node["leisure"]({b}); node["natural"="tree"]({b}); node["office"]({b}); node["craft"]({b});
);
out body geom qt;"""

CITY_Q = """[out:json][timeout:900][maxsize:1073741824];
(
  way["highway"~"^(motorway|trunk|primary|secondary|motorway_link|trunk_link)$"]({b});
  way["natural"="water"]({b}); relation["natural"="water"]({b});
  way["railway"~"subway|light_rail|rail|construction"]({b});
  node["railway"="station"]({b});
  way["leisure"="park"]({b}); relation["leisure"="park"]({b});
);
out body geom qt;"""


def fetch(query, out):
    # curl rather than urllib: it uses the OS certificate store, which some Python installs lack.
    qfile = out + ".query"
    open(qfile, "w", encoding="utf-8").write(query)
    for attempt in range(5):
        try:
            t = time.time()
            body = subprocess.run(
                ["curl", "-sS", "--fail", "-m", "900", "-A", UA, "--data-urlencode", f"data@{qfile}", EP],
                capture_output=True, check=True).stdout
            json.loads(body)  # validate
            open(out, "wb").write(body)
            os.remove(qfile)
            print(f"  ok {len(body)/1e6:.1f} MB in {time.time()-t:.0f}s -> {os.path.basename(out)}", flush=True)
            return
        except Exception as e:  # rate limits / timeouts: back off and retry
            print(f"  attempt {attempt+1} failed: {e}", flush=True)
            time.sleep(30 * (attempt + 1))
    raise SystemExit(f"giving up on {out}")


def main():
    os.makedirs(RAW, exist_ok=True)
    zones = json.load(open(os.path.join(ROOT, "tools", "zones.json")))
    args = sys.argv[1:]
    if "--city" in args:
        print("city overview", flush=True)
        fetch(CITY_Q.replace("{b}", "12.80,77.42,13.12,77.80"), os.path.join(RAW, "_city.json"))
        return
    for zid in (args or list(zones)):
        s, w, n, e = zones[zid]["bbox"]
        out = os.path.join(RAW, f"{zid}.json")
        if os.path.exists(out) and "--force" not in args:
            print(f"{zid}: cached", flush=True)
            continue
        print(f"{zid}: fetching", flush=True)
        fetch(ZONE_Q.replace("{b}", f"{s},{w},{n},{e}"), out)
        time.sleep(5)


if __name__ == "__main__":
    main()
