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

## Run it

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Any static file server works. To share it, enable **GitHub Pages** on this repo (Settings → Pages → deploy from branch, root folder). Anyone with the link can then play on a phone or laptop.

Load a different story with `?story=<name>`, which reads `story/<name>.json`.

## Controls

| | Desktop | Mobile |
|---|---|---|
| Move | WASD / arrows | left-thumb joystick |
| Look | drag mouse | drag right side of the screen |
| Attack (3-hit combo) | J / click | ✊ |
| Dodge | Space / Shift | ⤴ |
| Interact / talk | E | ✋ (appears when near something) |
| Dialogue | Enter / Space / click, 1–4 for choices | tap |
| Pause (sound, auto-dialogue, quality) | Esc | II |

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
```

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
