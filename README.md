# Project Forge: story-driven 3D game engine (proof of concept)

A browser-based, low-poly 3D story RPG engine. **The whole game is defined by a single story file.** Characters, scenes, dialogue, choices, clues, fights and cutscenes all live in JSON, and the engine stages them. The long-term goal is a pipeline that turns a comic into a story file, which then becomes a playable game.

The included demo, **The Grinning Hour: Chapter One**, is an original noir story (about 15 to 20 minutes long). Nightjar, a masked detective, tracks Harlan Vale, a stage magician who has escaped from Blackmere Asylum, to an abandoned carnival.

It runs on desktop and mobile with no install and no build step.

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
| Pause | Esc | II |

## Layout

```
index.html              page shell + HUD/menus
vendor/three.module.js  three.js r160 (vendored, MIT)
src/main.js             loads + validates a story, boots the engine
src/engine/
  Game.js       scene lifecycle, player controller, camera, NPCs, clues, triggers, combat AI, saves
  Script.js     runs story "steps": dialogue, choices, flags, camera shots, engine actions
  World.js      builds environments from prop lists (buildings, cells, tents, ferris wheel…), rain, lightning, colliders
  Character.js  procedural low-poly humanoid built from a "look" + procedural animation
  Materials.js  toon shading + ink outlines, canvas text textures
  Fx.js         comic hit words (POW!), smoke, sparks, health bars, telegraph icons
  Audio.js      fully procedural WebAudio (rain, thunder, music box, hits)
  Input.js      keyboard/mouse + touch joystick
  validate.js   catches broken references in a story file
story/the-grinning-hour.json   the demo story
```

## Story format (the engine's input)

```jsonc
{
  "title": "…", "start": "sceneId", "player": "characterId",
  "characters": {
    "id": { "name": "…", "look": { "top": "#hex", "coat": "#hex", "hat": "top|fedora|cap|hood", "cowl": "#hex", "cape": "#hex", "grin": "#hex", "height": 1, "build": 1 },
            "combat": { "hp": 3, "damage": 1, "windup": 0.6 } }   // combat = can be used as an enemy
  },
  "scenes": {
    "id": {
      "environment": { "sky": "#hex", "rain": true, "lightning": true, "flashback": false },
      "props": [ { "type": "building|wall|fence|lamp|gate|cell|car|tent|ferris|carousel|stage|booth|poster|chalk|sign|tree|crate|…", "x": 0, "z": 0, "rot": 0 } ],
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
- `{ "caption": "…" }`: a comic caption box.
- `{ "cam": { "pos": [], "look": [] } }`: a camera shot.
- `{ "choices": [ { "t": "…", "then": [ … ], "set": "flag" } ] }`: a player choice.
- `{ "set": "flag" }`: sets a flag.
- `{ "if": "flag", "then": [], "else": [] }`: branches on a flag.
- `{ "do": "clue|wave|goto|npcAdd|npcMove|npcRemove|smoke|shake|card|toast|fade|end", … }`: an engine action.

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
