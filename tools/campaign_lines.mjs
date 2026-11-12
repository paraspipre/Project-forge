// Collects every scripted story-mode line (src/data/campaign.js chapters, SIGNAL's broadcasts and the
// finale in src/game/Campaign.js) into tools/voice_lines.json for gen_voices.py.
//   node tools/campaign_lines.mjs   then   python tools/gen_voices.py --models <kokoro dir>
import fs from 'fs';
import { CHAPTERS, BROADCASTS } from '../src/data/campaign.js';

const out = [];
const add = (id, text) => { if (typeof id === 'string' && text) out.push({ id, text }); };
const P = { x: 0, y: 0, z: 0, clone() { return this; } };

for (const pickChoice of [0, 1]) {
  for (const ch of CHAPTERS) {
    for (const fn of [ch.intro, ch.outro]) {
      if (!fn) continue;
      const q = {
        say: async (who, text) => add(who, text), choose: async (who, text) => { add(who, text); return pickChoice; },
        pos: () => P, cam() {}, wait: async () => {}, goto: async () => {}, done() {}, objective() {}, toast() {}, until: async () => true, npc: () => null,
      };
      const c = { cinema() {}, redFlash() {}, clue() {}, crew() {}, green: async () => {}, spawnVasu: () => ({ pos: P }), tower: () => ({ x: 0, z: 0 }) };
      await fn(q, c);
    }
  }
}
for (const b of BROADCASTS) add('signal', b);
// the finale and ending live in game code: pick up their literal lines
const src = fs.readFileSync('src/game/Campaign.js', 'utf8');
for (const m of src.matchAll(/q\.say\('(\w+)', '((?:[^'\\]|\\.)*)'\)/g)) add(m[1], m[2].replace(/\\'/g, "'"));
for (const m of src.matchAll(/(manju|farah|seenappa|dr_lake): '((?:[^'\\]|\\.)*)'/g)) add(m[1], m[2].replace(/\\'/g, "'"));
for (const m of src.matchAll(/persona\('signal'\), (?:ch\?\.boss \? )?'((?:[^'\\]|\\.)*)'(?: : '((?:[^'\\]|\\.)*)')?/g)) { add('signal', m[1]); add('signal', m[2]); }

const lines = JSON.parse(fs.readFileSync('tools/voice_lines.json', 'utf8'));
const have = new Set(lines.map((l) => `${l.id}|${l.text}`));
let n = 0;
for (const l of out) if (!have.has(`${l.id}|${l.text}`)) { lines.push(l); have.add(`${l.id}|${l.text}`); n++; }
fs.writeFileSync('tools/voice_lines.json', JSON.stringify(lines, null, 1));
console.log(`story lines: ${out.length}, new: ${n}`);
const by = {};
for (const l of out) by[l.id] = (by[l.id] || 0) + 1;
console.log(by);
