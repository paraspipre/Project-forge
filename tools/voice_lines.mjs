// Collect every spoken line in the game (for tools/gen_voices.py): NPC chatter plus every line of
// every mission, found by running the mission scripts against a mock context that records what is
// said and walks through each reply option.
//   node tools/voice_lines.mjs > tools/voice_lines.json

globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem() {} };
const { STORY } = await import('../src/data/story.js');

const lines = new Map();
const add = (id, text, name) => {
  if (typeof text !== 'string' || !text.trim()) return;
  const k = `${id}|${text}`;
  if (!lines.has(k)) lines.set(k, { id, text, name: name || id });
};

const npcName = {};
for (const st of Object.values(STORY)) for (const n of st.npcs || []) npcName[n.voice || n.id] = n.name;

// chatter
for (const st of Object.values(STORY)) {
  for (const n of st.npcs || []) {
    for (const l of n.chatter || []) {
      if (typeof l === 'function') continue;
      add(n.voice || n.id, Array.isArray(l) ? l[0] : l, n.name);
    }
  }
}

// a mock world good enough for every script to run to the end
const vec = (x = 0, y = 0, z = 0) => ({ x, y, z, clone() { return vec(this.x, this.y, this.z); }, distanceTo() { return 0; }, setY() { return this; }, add() { return this; } });
const npcMock = () => ({ pos: vec(), face() {}, emote() {}, walkTo: () => Promise.resolve(), name: 'npc' });
function mockGame() {
  return {
    player: { pos: vec(), avatar: { play() {}, stop() {} }, mode: 'walk', toggleRide() {} },
    addCoins() {}, fx: { confetti() {}, pop() {}, poof() {} }, labels: { add: () => ({ remove() {} }) },
    city: {
      roads: [{ bridge: true, heights: [0, 6], name: 'Silkboard Double Decker Flyover', pts: [[0, 0], [100, 0]] }],
      busRoutes: [{ x: 0, z: 0, no: '500-D' }, { x: 5, z: 5, no: '335-E' }], buildings: [], spots: {},
    },
    hud: { toast() {}, big() {}, objective() {} }, audio: {}, sendChat() {},
  };
}

async function runQuest(q, strategy) {
  let calls = 0;
  const pickIdx = (n) => {
    calls++;
    if (strategy === 'random') return Math.floor(Math.random() * n);
    return Math.min(n - 1, strategy);
  };
  const g = mockGame();
  const ctx = {
    game: g, qs: { target: null, pedTalk: null, emoteHook: null, mini: {} }, cleanup: [],
    say: async (who, text) => { add(typeof who === 'object' ? who.voiceId || who.name : who, text, typeof who === 'object' ? who.name : npcName[who]); },
    choose: async (who, text, opts) => { add(typeof who === 'object' ? who.voiceId || who.name : who, text, typeof who === 'object' ? who.name : npcName[who]); return pickIdx(opts.length); },
    done() {}, objective() {}, toast() {}, big() {}, wait: async () => {}, pos: () => vec(),
    spot: () => [0, 0], poi: (re, fb) => fb || [0, 0, 'Place'], near: (x, z) => [x || 0, z || 0],
    goto: async () => {}, collect: async () => {}, until: async () => true, spawn: () => npcMock(), npc: () => npcMock(),
    fail(m) { throw new Error('fail:' + m); }, reward() {}, minigame: async () => 7, cam() {}, freeze() {},
  };
  try { await q.run(ctx); } catch (e) { if (!String(e.message).startsWith('fail:')) console.error(q.id, e.message); }
  return calls;
}

for (const st of Object.values(STORY)) {
  for (const q of st.quests || []) {
    for (const s of [0, 1, 2, 3]) await runQuest(q, s);
    for (let i = 0; i < 25; i++) await runQuest(q, 'random');
  }
}

process.stdout.write(JSON.stringify([...lines.values()], null, 1));
console.error(`${lines.size} lines`);
