# Peak Bengaluru

A comic-book, sci-fi Bengaluru you can play in the browser, on a phone or a laptop. The year is 2099: the autos hover, the metro is purple and maglev, and Silk Board is still jammed.

**Play:** https://game.paraspipre.com

The city is built from the **real map**. Every street, building footprint, park, lake and metro line comes from OpenStreetMap. So when you walk down Brigade Road, the junctions, the side streets and the shop names are where you'd expect them. The style is inked outlines, flat pastel colours, hatching in the shadows and paper grain, inspired by Moebius-style games.

## What's in it

- **Districts:**
  - MG Road & Cubbon Park
  - Indiranagar
  - Koramangala
  - Silk Board & HSR
  - Basavanagudi & Lalbagh
  - Bellandur & ORR
  - Majestic
  - Malleshwaram
  - Electronic City
  - Whitefield

  Travel between them by Namma Metro: press **M** for the city map.
- **Landmarks** on their real footprints:
  - Vidhana Soudha, with its portico, domes and "Government Work is God's Work" inscription
  - Chinnaswamy Stadium in RCB colours, with floodlights and solar roofs
  - UB City's crown
  - St. Mark's Cathedral
  - the red Attara Kacheri and State Central Library
  - Cubbon Park's bandstand and statues
  - elevated Namma Metro stations with their real names
- **Street life:**
  - hover autos (meter mele 50, saar), scooter swarms, BMTC buses and water tankers on the real road network, driving on the left
  - cows lounging in the road
  - sleeping street dogs
  - techies on calls, aunties in sarees, delivery riders
  - black Sintex tanks on every roof
  - shop boards with the real names of restaurants and shops (Koshy's, Empire, Church Street Social…)
- **Missions:**
  - *Swalpa Adjust Maadi* with Manju Anna the auto driver
  - *Filter Coffee Express* for Kamalamma Ajji
  - *Cubbon Reads*: sit still, if you can
  - *Ee Sala Cup Namde* at Chinnaswamy
  - *Government Work is God's Work* at the Vidhana Soudha
  - *Pitch Perfect* with a stealth-mode founder
- **Kannada word cards** hidden on rooftops (climb!) and around landmarks. Each one unlocks a chat phrase: *Oota aayta?*, *Ond nimsha*, *Hogi banni*…
- **Multiplayer:** everyone in the same district and room sees each other. Chat, emotes (yes, including the head wobble), and shared games:
  - **Hover Race**: a checkpoint race through real streets
  - **Catch the Six**: catch the sixes at Chinnaswamy

  Use the menu's **Invite friends** for a private room link.
- **Day and night, Bengaluru weather:** a shared 24-minute day with afternoon showers, the same for everyone online.
- **Music and sound:** synthesised lo-fi Carnatic tunes in raga Mohanam, the morning koel, and the horn concerto.

The stereotypes are the city's own jokes, told with affection. It's a game.

## Controls

| | Laptop | Phone | Gamepad |
|---|---|---|---|
| Move / look | WASD + drag mouse | left thumb + drag right side | sticks |
| Run / boost | Shift | push the stick fully | L3 / triggers |
| Jump (into a wall to **climb**) | Space | ⤒ | A |
| Talk / interact | E | ✋ | X |
| Hover scooter | R | 🛵 | Y |
| Emotes & phrases | Q (1–9 quick emotes) | 😄 | B |
| Chat | T or Enter | 💬 | |
| City map / travel | M | 🗺️ | Back |
| Horn | H | | RB |

## How it works

No build step and no server. It's static files served by Vercel from this repository; pushing to the default branch deploys.

```
index.html, src/ui/style.css   page, HUD and menus
src/main.js                    boot + menus (title, look, settings, metro map)
src/core/                      Renderer + comic post-process (Post.js), toon shader (Toon.js), Input, Audio
src/world/City.js              builds a district from map data: buildings, roads, flyovers, metro, trees…
src/world/landmarks/           hand-modelled landmarks and Namma Metro stations
src/world/Traffic.js           vehicles on the real road graph; metro trains
src/world/Crowd.js             pedestrians, cows, dogs
src/world/Signs.js             shop boards with real names (canvas atlases)
src/world/Sky.js               sky, clouds, hills; shared day/night clock and weather
src/actors/                    stylised people (one skinned mesh each) and vehicles
src/game/                      Game loop, Player + camera, Quests, Minigames, NPCs, effects
src/data/story.js              characters, missions and street chatter
src/net/                       multiplayer over public MQTT brokers (WebSocket)
data/zones/*.json              compact map data per district; data/city.json is the whole-city overview
tools/                         map pipeline + test tools
dump/grinning-hour/            the previous game (noir story engine), still playable at /dump/grinning-hour/
```

**Rendering.**
- A custom toon shader gives the hard light/shadow split with tinted shadows and world-space hatching. It also draws the windows, shopfronts and balconies procedurally, packs the surface normal into alpha, and handles night lights.
- A post pass inks silhouettes from depth (a Laplacian of 1/z) and creases from those packed normals, then adds grain and a print tint.

**Map pipeline.**
- `tools/fetch_osm.py` downloads each district from the Overpass API. `tools/zones.json` holds the district boxes.
- `tools/build_zones.py` turns the raw downloads into compact files. It projects to metres, assembles multipolygons, simplifies, estimates building heights (Bengaluru's typical G+2/G+3) and keeps names.
- `tools/preview_zone.py` renders a 2D check map.

```bash
python tools/fetch_osm.py koramangala      # raw download (not committed)
python tools/build_zones.py koramangala    # -> data/zones/koramangala.json
python tools/build_zones.py --city         # -> data/city.json
```

**Multiplayer.**
- Vercel can't hold WebSockets, so players meet on public MQTT brokers (HiveMQ and EMQX, both at once, de-duplicated). The topics are per district and room.
- Presence is retained and cleared by a last-will message.
- State is a 32-byte packet about 10 times a second. Chat goes through a small profanity filter.
- The player with the lowest id coordinates the shared games.

**Local run.** Serve the folder with any static server, then open http://localhost:8000:

```bash
python -m http.server 8000
```

**Testing.**
- `tools/play_test.py` drives the game headlessly with Playwright and takes screenshots.
- `dev/city.html?zone=central&cam=x,y,z&look=x,y,z&t=0.4` is a free-camera city viewer.

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the ODbL. three.js (MIT). Fonts: Baloo 2, Baloo Tamma 2 and Bangers (OFL).
