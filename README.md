# Project Forge: story-driven 3D game engine (proof of concept)

A browser-based 3D story RPG engine. **The whole game is defined by a single story file.** Characters, scenes, dialogue, choices, clues, fights and cutscenes all live in JSON, and the engine stages them. The long-term goal is a pipeline that turns a comic into a story file, which then becomes a playable game.

The included demo, **The Grinning Hour: Chapter One**, is an original noir story (about 15 to 20 minutes long). Nightjar, a masked detective, tracks Harlan Vale, a stage magician who has escaped from Blackmere Asylum, to an abandoned carnival. It is **fully voiced**: every line of dialogue, the captions and the combat grunts, with distinct voices for each character and a narrator.

It runs on desktop and mobile with no install and no build step.

**Graphics**
- PBR materials with procedurally generated textures: brick, stone, concrete, wet asphalt, cobblestone, wood, fabric, leather, skin.
- Wet reflective streets, an HDR bloom pass, and ACES tone mapping.
- A cinematic grade: vignette, film grain, lens fringing, and a scratched-film sepia for flashbacks.
- A storm sky with lightning, a city skyline, and fake volumetric lamp light.

**Characters**
- Procedurally sculpted, not low-poly.
- Faces have eyes, blinking lids, brows and lips that move with the voice.
- Five-finger hands that close into fists in combat.
- Tailored coats, capes, masks and hats.

**Audio**
- A mixer with convolution reverb.
- A score per mood: a noir piano and pad, a warped carnival calliope, a music box for the flashback, and combat drums.
- Layered ambience and synthesized foley.
- Voice-over with radio and loudspeaker processing, and music ducking under dialogue.

## Play

**Live:** https://game.paraspipre.com (also reachable via https://paraspipre.github.io/Project-forge/, which redirects there)

The site is served from the `gh-pages` branch, with the custom domain set by the `CNAME` file. The domain's DNS needs a CNAME record `game` → `paraspipre.github.io`. `.github/workflows/deploy-pages.yml` rebuilds it with `tools/build_web.py` on every push that changes the game, so the live version stays current. Locally, open `index.html` through any static web server (below).

To build a self-contained copy for other hosts (no import map; the CSS is inlined), run `python3 tools/build_web.py --out dist`. Add `--fragment` for hosts that wrap pages in their own `<html>`.

## Run it

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Any static file server works. To share it, enable **GitHub Pages** on this repo (Settings → Pages → deploy from branch, root folder). Anyone with the link can then play on a phone or laptop.

Load a different story with `?story=<name>`, which reads `story/<name>.json`.

## Controls

| | Desktop | Mobile | Gamepad |
|---|---|---|---|
| Move / look | WASD + drag mouse | left thumb + drag right side | sticks |
| Attack | J / click | ✊ | X |
| Evade / **counter** | Space / Shift | ⤴ | B |
| Detective scan | Q | 👁 | Y |
| Interact / talk | E | ✋ | A |
| Dialogue | plays by itself; Enter / click skips a line, 1–4 picks a reply | tap to skip | A, D-pad |
| Pause (sound, auto-dialogue, quality) | Esc | II | Start |

## Dialogue

Conversations play hands-free, GTA-style:
- Each line advances when its voice-over ends; an unvoiced line advances after a reading pause.
- Subtitles show the speaker's name in their colour.
- Reply choices pick a default after a short countdown, but you can still choose one.
- Scripts marked `"ambient": true` (triggers) or `"ambientClear": true` (fight waves) play as walk-and-talk while you keep control.
- To make every line wait for a tap, set the pause menu's **Dialogue** option to **Tap to continue**.

## Combat

- **Freeflow:** attacks leap to the enemy you're pushing toward, up to about 6 m away, and a press mid-swing queues the next hit.
- **Counter:** a gold **!** over an enemy means a punch is coming. Press evade to counter it; this hits every attacker who is winding up.
- **Dodge:** a red **!!** (the Big Grin) can't be countered; the same button dodges it. Evading cancels an attack's recovery.
- **Combo:** chain hits without getting hit. At x5 you enter *freeflow* and attack faster. At x8 the next attack is an instant **takedown**.
- **Finisher:** the last knockout of a fight plays in slow motion with a close camera.
- **Navigation:** a gold beacon and an edge-of-screen arrow point at the current objective. **Detective scan** reveals clues through walls.

## Layout

```
index.html              page shell + HUD/menus
vendor/                 three.js r160 + post-processing/helpers (vendored, MIT)
src/main.js             loads + validates a story, boots the engine
src/engine/
  Game.js       scene lifecycle, player controller, camera, NPCs, clues, triggers, combat AI, saves
  Script.js     runs story "steps": dialogue (voiced), choices, flags, camera shots, engine actions
  World.js      builds environments from prop lists (gothic buildings, cells, lamps, cars, tents, ferris wheel…), rain, colliders
  Character.js  procedurally sculpted humanoid from a "look" + procedural animation, blinking, look-at, lip-sync
  ModelCharacter.js  GLB-backed character with the same interface (clip mapping, blend-shape lip-sync, look-at)
  Models.js     glTF/GLB loading (Draco + Meshopt), per-scene preloading, cache
  Textures.js   procedural PBR texture sets (albedo / normal / roughness)
  Materials.js  material library, light cones, canvas text textures
  Sky.js        sky dome, clouds, moon, lightning, skyline, environment map
  Post.js       bloom + tone mapping + cinematic grade
  Audio.js      mixer, music, ambience, SFX, voice-over playback
  Fx.js         comic hit words (POW!), smoke, sparks, health bars, telegraph icons
  Input.js      keyboard/mouse + touch joystick
  validate.js   catches broken references in a story file
story/the-grinning-hour.json   the demo story
voice/                          rendered voice-over (mp3) + manifest.json
tools/generate_voices.py        renders voice/ from a story with Kokoro TTS
dev/characters.html             character viewer (?focus=<id>&anim=walk|punch|talk)
dev/models.html                 GLB inspector: drop a model, see clip mapping, preview actions, copy JSON
models/                         your .glb/.gltf characters and props
```

## Using real 3D models (GLB / glTF)

Any character or prop can use a `.glb` or `.gltf` file instead of the procedural model. Sources include an artist, Blender, Mixamo, Ready Player Me, or AI generators such as Meshy, Tripo or Rodin. Put the files in `models/` and reference them from the story:

```jsonc
"nightjar": {
  "name": "Nightjar",
  "look": {
    "model": "models/nightjar.glb",
    "height": 1.05,             // × 1.8 m (or "modelHeight": 1.9 in metres)
    "modelRotation": 180,       // if the model faces away from the camera
    "animations": { "punch": "Jab_Right" },              // optional: override auto-matched clips
    "animationFiles": ["models/anims/mixamo-pack.glb"],  // optional: clips stored in other files
    // …keep the procedural look fields too: they're the fallback if the file fails to load
  }
}
```

**Animations.** Clips are matched to game actions by name: `idle`, `walk`, `run`, `punch`/`attack`, `kick`, `hit`/`hurt`, `dodge`/`roll`, `death`/`knock`, `talk`, `laugh`, `wave`/`gesture`.
- Walking and running blend with movement speed.
- One-shot clips are time-stretched to match the game's attack timing.
- Any action without a clip, and a model with no rig at all (common for AI generators), falls back to procedural whole-body motion: bobbing, leaning, recoiling and falling.

**Animation packs.** `animationFiles` can be a list of files, or a map of roles to single-clip files, e.g. `{ "walk": "models/anims/walk.glb" }`. With Mixamo, download each animation "without skin" and convert it to GLB; it then works on every Mixamo-rigged character.

**Faces.** If the model has blend shapes, they drive the face:
- Lip-sync follows the voice-over through shapes named like `jawOpen`, `mouthOpen` or `viseme_aa` (Ready Player Me, ARKit and VRoid avatars have these).
- Blinking uses shapes named like `eyeBlink…`.
- Heads turn toward whoever is speaking via the head bone (Mixamo, VRM and Blender naming).

**Compression.** Draco- and Meshopt-compressed files are supported. Large models load much faster after `npx @gltf-transform/cli optimize in.glb out.glb`.

**Props.** Add GLB scenery to a scene:

```json
{ "type": "model", "src": "models/fountain.glb", "x": 4, "z": -6, "rot": 90, "height": 3, "collider": [2, 2] }
```

**Generating the cast with Meshy.** `tools/generate_meshy.py` runs the whole pipeline for every character in `tools/meshy_characters.json`. That file holds an editable prompt per character, written from the story's character designs. For each character the script:

1. generates geometry with text-to-3D;
2. refines it with PBR textures;
3. auto-rigs it, which adds walk and run clips;
4. optionally adds more library animations, configured per role in the config file;
5. downloads everything to `models/<id>/` and adds `model`, `modelHeight` and `animationFiles` to the story.

```bash
export MESHY_API_KEY=...        # never commit it
python3 tools/generate_meshy.py --dry-run          # check prompts first
python3 tools/generate_meshy.py                    # all characters (or --only nightjar vale)
```

**Resuming.** Task IDs are saved in `models/meshy_state.json`, so re-running resumes without paying for finished steps again.

**Fallbacks.**
- If rigging fails, the textured, unrigged model is still used; the engine moves it procedurally.
- A rig with walk and run but no idle clip stands in a held mid-stride pose.

**Extra animations.** For idle, punch and hit clips, add Meshy animation-library action IDs under `"animations": { "idle": <id>, "punch": <id> }`, either in `defaults` or per character.

**Cloud sessions.** Allow `api.meshy.ai` and `assets.meshy.ai` in the environment's network settings, and provide `MESHY_API_KEY` as an environment secret.

**Model inspector.** Open `dev/models.html` and drop in a GLB. It shows:
- which clip each game action will use;
- whether a head bone and face blend shapes were found;
- the triangle count;
- buttons to preview every action;
- the JSON snippet to paste into your story.

## Voice-over

The clips in `voice/` are rendered offline with [Kokoro](https://github.com/thewh1teagle/kokoro-onnx), an Apache-2.0 neural TTS model that runs on the CPU. Each character's story entry chooses a voice:

```json
"voice": { "kokoro": "am_fenrir*0.6+am_onyx*0.4", "speed": 0.9, "style": "radio" }
```

- `kokoro` blends Kokoro voices to give each character a distinct timbre.
- `style` is optional: `radio` or `pa` (loudspeaker) processing.
- `efforts` lists short combat grunts and laughs.

Clips are keyed by a hash of `speaker|text`. Editing a line therefore only needs a re-render of that line; the JSON needs no IDs. To re-render after story edits:

```bash
pip install kokoro-onnx soundfile          # plus ffmpeg on PATH
# download kokoro-v1.0.onnx and voices-v1.0.bin (see the script header)
python3 tools/generate_voices.py story/the-grinning-hour.json --models <dir>
```

Lines without a clip still work: they fall back to text with typing sounds.

## Story format (the engine's input)

```jsonc
{
  "title": "…", "start": "sceneId", "player": "characterId",
  "characters": {
    "id": { "name": "…", "look": { "top": "#hex", "coat": "#hex", "coatLength": 0.6, "hat": "top|fedora|cap|hood", "hairStyle": "short|slick|bun|long|bald", "cowl": "#hex", "cape": "#hex", "mask": "#hex", "leather": true, "figure": "slim", "height": 1, "build": 1 },
            "voice": { "kokoro": "voice*0.5+voice*0.5", "speed": 1 },
            "combat": { "hp": 3, "damage": 1, "windup": 0.6 } }   // combat = can be used as an enemy
  },
  "scenes": {
    "id": {
      "environment": { "sky": "#hex", "skyHorizon": "#hex", "fogDensity": 0.02, "groundTex": "asphalt|cobble|wood|concrete", "rain": true, "lightning": true, "flashback": false, "exposure": 1 },
      "props": [ { "type": "building|wall|fence|lamp|gate|cell|car|tent|ferris|carousel|stage|booth|poster|chalk|sign|tree|crate|barrel|bench|mirror|table|stringLights|beam|rubble", "x": 0, "z": 0, "rot": 0 } ],
      "npcs": [ { "id": "…", "x": 0, "z": 0, "talk": [ /* steps */ ] } ],
      "interactables": [ { "id": "…", "x": 0, "z": 0, "label": "Examine", "if": "flag", "script": [ /* steps */ ] } ],
      "triggers": [ { "x": 0, "z": 0, "r": 4, "if": ["flagA", "!flagB"], "script": [ /* steps */ ] } ],
      "waves": { "id": { "enemies": [ { "character": "grinner", "x": 0, "z": 0 } ], "onClear": [ /* steps */ ] } },
      "objectives": [ { "text": "…", "if": "…", "until": "…" } ],
      "exits": [ { "x": 0, "z": 0, "to": "otherScene", "if": "flag" } ],
      "intro": [ /* steps, played once as a cutscene */ ]
    }
  }
}
```

**Steps** are the scripting language:

- `{ "s": "speaker", "t": "line" }`: a line of dialogue.
- `{ "caption": "…" }`: a comic caption box, narrated. Add `"voice": false` to keep it silent.
- `{ "cam": { "pos": [], "look": [] } }`: a camera shot.
- `{ "choices": [ { "t": "…", "then": [ … ], "set": "flag" } ] }`: a player choice.
- `{ "set": "flag" }`: sets a flag.
- `{ "if": "flag", "then": [], "else": [] }`: branches on a flag.
- `{ "do": "clue|wave|goto|npcAdd|npcMove|npcRemove|smoke|shake|card|toast|fade|end", … }`: an engine action.

## Quality and performance

There are two presets:
- **High** (desktop default): shadows, bloom, MSAA and 512px textures.
- **Low** (phone default): no shadows or bloom, 256px textures and fewer lights.

You can switch between them in the pause menu; the change applies after a reload.

## Ideas for the comic → game step

The story file maps closely onto what a comic contains:

| Comic | Story file |
|---|---|
| Panels with speech balloons | `s` / `t` lines |
| Captions | `caption` |
| Panel framing | `cam` |
| Recurring characters' designs | `characters.*.look` |
| Locations | `scenes` + `props` |
| Action pages | `waves` |

A vision model could extract these page by page into this JSON. The engine already validates the result (`validate.js`) and plays it.
