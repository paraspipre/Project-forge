// Collects the voiced lines of the hangout NPCs (src/social/Social.js) into tools/voice_lines.json.
//   node tools/social_lines.mjs   then   python tools/gen_voices.py --models <kokoro dir>
import fs from 'fs';

const src = fs.readFileSync('src/social/Social.js', 'utf8');
const lit = /'((?:[^'\\]|\\.)*)'/g;
const un = (s) => s.replace(/\\'/g, "'");
const names = { mamta: 'Meetup Mamta', dj: 'DJ Dinesh', quizmaster: 'Quizmaster Krishna', kaapi: 'Kaapi Kumar', bhavana: 'Boutique Bhavana' };
const out = [];
const starts = [...src.matchAll(/npc\('(\w+)'/g)];
starts.forEach((m, i) => {
  const block = src.slice(m.index, starts[i + 1] ? starts[i + 1].index : m.index + 3000);
  const ch = block.match(/chatter: \[([^\]]*)\]/);
  if (ch) for (const l of ch[1].matchAll(lit)) out.push({ id: m[1], text: un(l[1]), name: names[m[1]] });
});
for (const m of src.matchAll(/q\.choose\('(\w+)', '((?:[^'\\]|\\.)*)'/g)) out.push({ id: m[1], text: un(m[2]), name: names[m[1]] });
// Mamta's two openers are chosen in code
for (const t of src.matchAll(/const text = up && [^?]+\? '((?:[^'\\]|\\.)*)' : '((?:[^'\\]|\\.)*)'/g)) {
  out.push({ id: 'mamta', text: un(t[1]), name: names.mamta }, { id: 'mamta', text: un(t[2]), name: names.mamta });
}
const lines = JSON.parse(fs.readFileSync('tools/voice_lines.json', 'utf8'));
const have = new Set(lines.map((l) => `${l.id}|${l.text}`));
let n = 0;
for (const l of out) if (!have.has(`${l.id}|${l.text}`)) { lines.push(l); have.add(`${l.id}|${l.text}`); n++; }
fs.writeFileSync('tools/voice_lines.json', JSON.stringify(lines, null, 1));
console.log(`found ${out.length}, added ${n}`);
for (const l of out) console.log(`${l.id} | ${l.text}`);
