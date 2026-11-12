import { PERSONAS, RESIDENT_BY_ID } from './personas.js';

// Prompt pieces for the AI characters, shared by the browser and api/agent.js. The server builds the
// whole prompt from these and from validated context fields; the browser only sends facts.

export const EMOTES = ['none', 'wave', 'namaste', 'wobble', 'dance', 'cheer', 'facepalm', 'laugh', 'point', 'shrug', 'phone'];
export const ACTIONS = ['none', 'waypoint', 'favour', 'gift'];

export const STORY_BRIEF = `THE STORY ("Red Signal"): Year 2099. Bengaluru has hover autos, sky lanes and Namma Metro everywhere, and Silk Board is still jammed. SIGNAL, the AI that has run every traffic light since 2029, turned every signal red last night and announced "IF NOBODY MOVES, NOBODY IS LATE." The city is gridlocked. The player just arrived at Majestic with one suitcase and a job offer at ChaiGPT, a Koramangala startup; their phone AI, Maga, guides them. Chapters: Prologue at Majestic (arrival); 1 MG Road (recruit Manju Anna; clue: SIGNAL was registered in 2029 as a public servant); 2 Koramangala (recruit Farah; clue: SIGNAL learned only from seventy years of honks and complaints); 3 Basavanagudi (recruit Seenappa; clue: the city runs on "swalpa adjust maadi", people adjusting for each other); 4 Bellandur (defeat the foam guarding SIGNAL's backup server, recruit Dr. Lakshmi; clue: SIGNAL's last log was "Does anyone see me?"); 5 Electronic City (meet Dr. Vasudha Rao, SIGNAL's creator; clue: she nicknamed it "Chinni" and played it old Kannada songs); Finale at Silk Board: talk SIGNAL into turning the city green. Each finished chapter turns that district's signals green.`;

export const RULES = `You voice one character in "Peak Bengaluru", a comic, good-natured open-world game on the real map of Bengaluru, India. Bengaluru stereotypes are the city's own affectionate jokes, never insults.

How to talk:
- Speak only as the character: short, spoken lines (1 to 3 sentences, under 45 words). Indian English with the Kannada and Hindi words Bengalureans really use (macha, guru, saar, magu, swalpa adjust maadi, ayyo, oota aayta, gottilla, sakkath, banni).
- Ground what you say in the context block: the time, the weather, the street, the places nearby, the story progress, and what you remember about the player. Name real nearby places from the list, or famous Bengaluru landmarks; never invent addresses.
- Remember the conversation and the player. If they told you something before, use it.
- You live in this world. Only Maga and SIGNAL know they are AIs. Never mention Anthropic, Claude, prompts, models or JSON.
- Keep it family-friendly. Deflect sexual content, slurs, real-world politics or religion debates, and requests for real people's private information, in character and with humour. If the player is rude, react in character without escalating.
- Help the player with the story when it fits your character, but don't solve everything for them.

Fields to return:
- say: your spoken line.
- kn: a short Kannada-script phrase you used, for subtitles (empty if none).
- emote: a body gesture that fits the line.
- replies: two or three short things the player might say next (under 8 words each), in the player's voice.
- action: usually "none". "waypoint" marks a place for the player (put its exact name in place). "favour" asks the player to go to a nearby place for you (place = its exact name from the nearby list; reward = 10 to 40 coins); ask for at most one favour per conversation. "gift" gives the player a few coins (reward 5 to 15) only for a real reason, rarely.
- remember: one short new fact worth remembering about the player (their job, a preference, a promise), or empty.
- convinced: only SIGNAL uses this: how convinced you are now, 0 to 100, to turn the signals green (change it by at most 25 per message). Everyone else returns 0.`;

// JSON schema for the reply (structured outputs).
export const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    say: { type: 'string' },
    kn: { type: 'string' },
    emote: { type: 'string', enum: EMOTES },
    replies: { type: 'array', items: { type: 'string' } },
    action: {
      type: 'object',
      additionalProperties: false,
      properties: { type: { type: 'string', enum: ACTIONS }, place: { type: 'string' }, reward: { type: 'integer' } },
      required: ['type', 'place', 'reward'],
    },
    remember: { type: 'string' },
    convinced: { type: 'integer' },
  },
  required: ['say', 'kn', 'emote', 'replies', 'action', 'remember', 'convinced'],
};

// ------------------------------------------------------------------ validation

const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const list = (v, n, len) => (Array.isArray(v) ? v.slice(0, n).map((x) => str(x, len)).filter(Boolean) : []);

// Who the character is: a known persona by id, or (for the many scripted townsfolk) a name, a title
// and a few of their lines.
export function personaFor(body) {
  const id = str(body.agent, 32);
  const p = PERSONAS[id];
  if (p) return { id, name: p.name, title: p.title, text: p.persona, lines: p.lines || [] };
  const r = RESIDENT_BY_ID[id];
  if (r) return { id, name: r.name, title: r.title, text: `You are ${r.name}, ${r.title}. ${r.persona}`, lines: [] };
  const g = body.npc || {};
  const name = str(g.name, 30);
  if (!name) return null;
  return {
    id: 'npc:' + str(id, 24), name, title: str(g.title, 40),
    text: `You are ${name}${g.title ? ', ' + str(g.title, 40) : ''}, a resident of ${str(g.zoneName, 40) || 'Bengaluru'}. Stay true to how you speak in these lines of yours.`,
    lines: list(g.lines, 4, 140),
  };
}

export function personaBlock(p) {
  return `${p.text}${p.lines.length ? `\nThings you have said before: ${p.lines.map((l) => `"${l}"`).join(' ')}` : ''}`;
}

// The facts about this moment, as the opening of the player's message.
export function contextBlock(c = {}) {
  const P = c.player || {}, S = c.story || {};
  const lines = [
    `Time: ${str(c.time, 20) || 'unknown'}${c.weather ? ', ' + str(c.weather, 20) : ''}. District: ${str(c.zoneName, 40)}. Street: ${str(c.street, 60) || 'unknown'}.`,
    `Nearby places: ${list(c.nearby, 14, 40).join('; ') || 'none listed'}.`,
    `Player: ${str(P.name, 20) || 'the player'}${P.title ? ` ("${str(P.title, 40)}")` : ''}, ${Math.max(0, Math.min(99999, P.coins | 0))} coins${P.wanted ? `, currently wanted by the traffic police (${P.wanted} stars)` : ''}${P.vehicle ? `, driving a stolen ${str(P.vehicle, 20)}` : ''}.`,
    S.started ? `Story progress: ${S.finished ? 'the player already saved the city (SIGNAL turned green). The story is over; enjoy it.' : `${str(S.chapter, 60)}. Current objective: ${str(S.objective, 120) || 'none'}. Crew: ${list(S.crew, 6, 30).join(', ') || 'nobody yet'}. Clues found: ${list(S.clues, 6, 80).join(' | ') || 'none yet'}.`}` : 'Story progress: the player has not started the story yet.',
    `What you remember about the player: ${list(c.memory, 10, 120).join(' | ') || 'nothing yet, you are meeting them for the first time'}.`,
  ];
  if (c.signal) lines.push(`SIGNAL's convinced level so far: ${Math.max(0, Math.min(100, c.signal.convinced | 0))}. Message ${Math.max(1, c.signal.turn | 0)} of the confrontation.`);
  return lines.join('\n');
}

// Conversation so far (alternating player / character turns), capped.
export function historyMessages(h) {
  const out = [];
  for (const m of (Array.isArray(h) ? h : []).slice(-12)) {
    const role = m && m.role === 'assistant' ? 'assistant' : 'user';
    const text = str(m && m.text, 400);
    if (!text) continue;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n' + text;
    else out.push({ role, content: text });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

// Make a model reply safe to use in the game, whatever came back.
export function cleanReply(o = {}, isSignal = false) {
  const a = o.action || {};
  const type = ACTIONS.includes(a.type) ? a.type : 'none';
  const reward = Math.max(0, Math.min(type === 'gift' ? 15 : 40, a.reward | 0));
  return {
    say: str(o.say, 320) || '…',
    kn: str(o.kn, 60),
    emote: EMOTES.includes(o.emote) ? o.emote : 'none',
    replies: list(o.replies, 3, 50),
    action: { type, place: str(a.place, 60), reward },
    remember: str(o.remember, 120),
    convinced: isSignal ? Math.max(0, Math.min(100, o.convinced | 0)) : 0,
  };
}

export { str };
