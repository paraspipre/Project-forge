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
- **Bilingual streets:**
  - blue BBMP-style boards at junctions, with Kannada on top and English below
  - the HUD shows the street you're on in both languages
  - names come from OpenStreetMap's `name:kn`, plus an exact rendering of the numbered Cross/Main grid
- **Street texture:**
  - electric poles with cable tangles
  - compound walls and gates
  - potholes
  - parked scooters, bunk shops and coconut carts
  - lamp light pools at night
- **Sky life:**
  - birds
  - rooftop delivery drones
  - ad airships
  - a jammed sky-lane of hover cars (even the sky has traffic)
- **Kannada word cards** hidden on rooftops (climb!) and around landmarks. Each one unlocks a chat phrase: *Oota aayta?*, *Ond nimsha*, *Hogi banni*…
- **Multiplayer:** everyone in the same district and room sees each other. Chat, emotes (yes, including the head wobble), and shared games:
  - **Hover Race**: a checkpoint race through real streets
  - **Catch the Six**: catch the sixes at Chinnaswamy

  Use the menu's **Invite friends** for a private room link.
- **Four ways in** from the title screen: **Story mode**, **Multiplayer** (free roam with everyone), **Party games** and **Meetups**.
- **Story mode: "Red Signal".**
  - At midnight SIGNAL, the AI that has run every traffic light since 2029, turns the whole city red: "IF NOBODY MOVES, NOBODY IS LATE."
  - You arrive at Majestic with one suitcase and a job offer at a Koramangala startup. Maga, the AI in your phone, guides you.
  - A prologue, five chapters and a finale across Majestic, MG Road, Koramangala, Basavanagudi, Bellandur, Electronic City and Silk Board. Each chapter has a cut-scene, its district's missions, a crew member to recruit and a clue.
  - Red districts crawl, and SIGNAL broadcasts at you. Finishing a chapter turns that district green.
  - In the finale you talk SIGNAL down at Silk Board, using what you learned (or your own words). Then the credits roll.
- **AI characters you can really talk to.**
  - Type, or speak with 🎙️, to anyone: Maga (G or 📱), the crew, Dr. Vasudha Rao, SIGNAL, every named character, and two wandering AI residents in each district (💬).
  - They know where you are (the time, the weather, the street, real places nearby), how far the story has gone and what you told them before. They remember you between visits.
  - They act in the world: they mark places on your map, ask for favours (a mini-mission with a reward) and sometimes give you coins.
  - Replies come from Claude through `api/agent.js` (see *AI characters* below). Without an API key, characters use a built-in offline brain. The game works either way.
- **Voice chat:** opt-in proximity voice (WebRTC). Voices fade with distance and pan left/right. Mute anyone from the 👥 People panel.
- **Your progress is saved:** you continue where you left off. Copy a progress code from the menu to move to another device.
- **Namma Club** in every district: a DJ, a light-up dance floor and club music on a beat shared by everyone there.
  - **Meetup Mamta** starts games any time, and a meetup starts on a shared schedule when other players are around.
  - **Namma Quiz Night** (Bengaluru trivia), **Dance-off** (a rhythm game), **Chor-Police** (tag) and **Bengaluru Blasters** (a cartoon sci-fi blaster battle with over-the-shoulder aim, three blasters and a kill feed).
  - Bots join when you play alone. Weekly leaderboards reset every Monday.
  - **Kaapi Kumar** sells filter coffee (run faster), **Boutique Bhavana** sells shades, jasmine, gold chains and titles shown under your name.
- **Namma Meetup Hall**, for real meetups:
  - walk onto the stage to present: share your screen live on the big screen, or show slides and a link
  - your voice goes through the PA, so the whole hall hears you clearly
  - the audience reacts (👏🔥😂💡❤️) and raises hands, and the presenter can give someone the floor
  - six **project booths** where anyone can put up what they're building
  - a **meetup calendar** (talks, demo days, hangouts) seen from every district, with reminders
- **GTA mode:**
  - walk up to any auto, car, scooter, bus or water tanker and take it; the owner is not pleased
  - the traffic police chase you on hover scooters, and if they catch you it's a challan
  - street scuffles with filmy *DHISHOOM*: aunties fight back with a chappal, some people run, most complain
  - no fighting in the Meetup Hall or at Namma Club
- **Namma Radio:** live Kannada, Bollywood, Punjabi and English stations (via radio-browser.info, streamed from the broadcasters), or play your own music files. It switches on when you get into a vehicle.
- **Day and night, Bengaluru weather:** a shared 24-minute day with afternoon showers, the same for everyone online.
- **Fully voiced, hands-free conversations:**
  - every character has their own voice
  - lines play and move on by themselves, and replies pick a default after a short countdown (tap to skip or choose)
  - quest givers start talking when you stop next to them, and locals chat in voiced speech bubbles as you walk past
  - the pause menu switches **Voices** and **Dialogue: Auto / Tap to continue**
- **Music and sound:**
  - an adaptive soundtrack, all synthesised: a lo-fi Bengaluru groove (FM electric piano, swung drums, bass, bansuri flute in raga Mohanam) for exploring, an upbeat track on scooters and in cars, slow pads at night, and tabla tension for chases, fights and timed missions
  - footsteps, an engine sound for each vehicle (the auto's two-stroke putt-putt, cars, diesel buses), wind at speed, crowd murmur, traffic rumble that follows the real traffic around you, the morning koel, crickets, rain and the horn concerto
  - voiced lines; Maga sounds like a phone speaker and SIGNAL like a machine, and AI replies use the best natural voice in your browser, matched to the character

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
| Take / leave a vehicle | E near it | ✋ | X |
| Punch | X | 👊 | |
| Voice chat mic / people | V / Tab | 🎙️ / 👥 | |
| Radio | B | 📻 | |
| Talk to Maga (phone AI) | G | 📱 | |
| Blasters: aim / fire / switch | mouse (click to lock) / hold click / 1–3 | drag / 🔫 / 🔁 | |

## How it works

No build step. It's static files served by Vercel from this repository, plus one serverless function for the AI characters (`api/agent.js`). Pushing to the default branch deploys.

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
src/data/campaign.js           story mode "Red Signal": chapters, cut-scenes, clues (run by src/game/Campaign.js)
src/ai/                        AI characters: personas, prompt, chat UI + offline brain (Agents.js)
api/agent.js                   serverless function: AI character replies via the Claude API
src/net/                       multiplayer over public MQTT brokers (WebSocket)
data/zones/*.json              compact map data per district; data/city.json is the whole-city overview
tools/                         map pipeline + test tools
dump/grinning-hour/            the previous game (noir story engine), still playable at /dump/grinning-hour/
```

**Rendering.** Two looks share one shader (`src/core/Toon.js`), switched under Settings → Look:
- **San Andreas** (default): smooth sun-and-sky lighting with shadows, and procedural world-space textures: weathered plaster with damp and rain streaks, concrete roofs, patched asphalt, paving slabs, grass and bare earth. Windows and glass towers reflect the sky, cars have glossy paint, wet streets mirror the sky, and there's a warm distance haze. No ink.
- **Comic ink**, the original Moebius-style look:
- A custom toon shader gives the hard light/shadow split with tinted shadows and world-space hatching. It also draws the windows, shopfronts and balconies procedurally, packs the surface normal into alpha, and handles night lights.
- A post pass inks silhouettes from depth (a Laplacian of 1/z) and creases from those packed normals, then adds grain and a print tint.
- On top of the ink:
  - half-resolution ambient occlusion (High quality)
  - bloom that strengthens at night (High and Medium)
  - a time-of-day colour grade: golden-hour orange, cool nights with punchy neon, grey rain
  - sun glare with lens ghosts when you look towards the sun
  - a radial speed blur and a wider field of view when you're flying along on a scooter or in a stolen car
  - FXAA (High quality)
- Traffic gets headlamps, tail-lights and headlight beams on the road at night and in heavy rain. Major roads get zebra crossings at junctions.
- Models: people with shaped, muscled limbs, hands, shoes and faces (eyes, brows, nose, lips, ears, hair). Vehicles have extruded rounded bodies, glass cabins, wheels with rims, bumpers, mirrors and plates: the auto rickshaw, scooters, motorcycles, cars, BMTC buses and water tankers. Trees have full leafy canopies (rain trees, neem, pink tabebuia) and coconut palms with leaflet fronds.
- The starting quality follows your GPU (integrated laptop graphics start on Medium), and the resolution adapts to keep the frame rate up.

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

**AI characters.**
- `api/agent.js` is a Vercel serverless function. The browser sends who you're talking to, a few facts about the moment and the conversation. The server builds the prompt from `src/ai/personas.js` and `src/ai/prompt.js`, so a visitor can't rewrite a character.
- It calls the Claude Messages API with structured outputs (a fixed JSON reply: line, Kannada subtitle, gesture, suggested replies, an action, a memory note). The rules and story brief are prompt-cached. Server-side fallback is on.
- **Setup:** in the Vercel project, add the environment variable `ANTHROPIC_API_KEY` and redeploy.
- Optional settings:
  - `AGENT_MODEL` (default `claude-opus-5-5`; `claude-haiku-5-5` costs about 40× less per reply)
  - `AGENT_DAILY_LIMIT` (replies per server instance per day, default 3000)
- Limits keep a public page from running up the bill: 12 replies a minute and 200 a day per visitor, and 150 a day per player in the browser. Each reply is capped at 2000 tokens.
- Local testing:
  - `npm install`, then `npm run dev` serves the game and the function at http://127.0.0.1:8770
  - `AGENT_MOCK=1 npm run dev` fakes Claude's replies, so you can test without a key
  - `python tools/story_test.py http://127.0.0.1:8770 out/` plays through the story

**Voice-over.**
- Clips in `voice/` are rendered offline with [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) (Apache-2.0). Each character's voice blends Kokoro's Hindi voices (for the accent) with its English ones.
- `tools/voice_lines.mjs` collects every line, including every dialogue branch, by running the mission scripts against a mock.
- `tools/gen_voices.py` renders only the lines that are new. Clips are keyed by a hash of `speaker|text`, so editing a line just needs a re-run.
- Lines without a clip (the few built from live numbers) use the browser's own en-IN voice.

```bash
pip install kokoro-onnx soundfile imageio-ffmpeg     # plus kokoro-v1.0.onnx and voices-v1.0.bin
node tools/voice_lines.mjs > tools/voice_lines.json
python tools/gen_voices.py --models <dir with the model files>
```

**Local run.** Serve the folder with any static server, then open http://localhost:8000:

```bash
python -m http.server 8000
```

**Testing.**
- `tools/play_test.py` drives the game headlessly with Playwright and takes screenshots.
- `tools/quest_smoke.py` autopilots every mission in every district and reports pass or fail.
- `tools/mp_test.py` opens two players in separate sessions and checks they see and hear each other.
- `tools/perf_probe.py` measures draw calls, triangles and frame rate.
- `dev/city.html?zone=central&cam=x,y,z&look=x,y,z&t=0.4` is a free-camera city viewer.

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the ODbL. three.js (MIT). Fonts: Baloo 2, Baloo Tamma 2 and Bangers (OFL).
