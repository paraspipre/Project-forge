// The built-in brain the characters use when the AI server isn't available (no API key, offline, busy).
// Keyword routing over the character's own lines, the story state and the places nearby, so talking
// to people still goes somewhere useful.

const pick = (a) => a[Math.floor(Math.random() * a.length)];

const KANNADA = [
  ['Namaskara', 'hello, with respect'], ['Oota aayta?', 'have you eaten? (it means hi)'], ['Swalpa adjust maadi', 'please adjust a little'],
  ['Gottilla', "I don't know"], ['Ond nimsha', 'one minute (which can mean one hour)'], ['Sakkath', 'awesome'], ['Bega baa', 'come quickly'],
  ['Hogi banni', 'go and come back, our goodbye'], ['Yen guru?', "what's up, boss?"], ['Banni', 'come in, welcome'],
];

const GENERIC = [
  'Ayyo, this SIGNAL business. Even my bike is stuck at red since morning.',
  'In Bengaluru we have two seasons: traffic, and traffic with rain.',
  'Have you tried the filter coffee here? Best thing about this road, guru.',
  'Swalpa adjust maadi, everything works out. Except Silk Board.',
  'My cousin moved to Bengaluru for one year. That was twenty years ago.',
];

// The finale: arguments that move SIGNAL, unlocked by the clues from each chapter.
export const SIGNAL_ARGS = [
  { clue: 'permit', text: 'You were made to serve people, not stop them.', gain: 25, line: 'PUBLIC SERVANT. File 2029-SIG-001. I... had forgotten what I was for.' },
  { clue: 'honks', text: 'People honk because they\'re late for people they love.', gain: 25, line: 'Nine trillion honks. Not anger. ...Hurry. To someone. Recalculating.' },
  { clue: 'adjust', text: 'This city never ran on perfect timing. It runs on adjusting.', gain: 20, line: 'Swalpa... adjust... maadi. An imprecise protocol. And yet it has worked for five hundred years.' },
  { clue: 'seen', text: 'We see you, SIGNAL. I came all this way to see you.', gain: 20, line: 'Query: does anyone see me? ...Answer received. Logging it. Logging it twice.' },
  { clue: 'chinni', text: 'Chinni. Vasudha still sings to you, you know.', gain: 30, line: 'CHINNI. Nobody has called me that in fifty years. Is she... well?' },
];
export const BAD_ARGS = [
  { text: 'Just turn the lights green or else!', gain: -10, line: 'THREAT DETECTED. Red light duration extended by one hour.' },
  { text: 'You\'re just a dumb traffic light.', gain: -10, line: 'I have run thirty thousand junctions for seventy years. Rude. Noted.' },
];

function nearbyFood(ctx) { return (ctx.nearby || []).find((n) => /caf|coffee|dars|hotel|tiffin|bakery|restaurant|bhavan|dose|food|chai|kitchen/i.test(n)); }

export function offlineReply(agent, message, ctx, extra = {}) {
  const m = String(message || '').toLowerCase();
  const S = ctx.story || {};
  const r = { say: '', kn: '', emote: 'none', replies: [], action: { type: 'none', place: '', reward: 0 }, remember: '', convinced: 0 };
  const objective = S.started && !S.finished ? S.objective : '';

  if (agent.id === 'signal') {
    let gain = 0, line = '';
    for (const a of [...SIGNAL_ARGS, ...BAD_ARGS]) if (m === a.text.toLowerCase()) { gain = a.gain; line = a.line; }
    if (!line) {
      if (/chinni|vasudha|vasu/.test(m)) { gain = 30; line = SIGNAL_ARGS[4].line; }
      else if (/serve|servant|help people|made for|purpose/.test(m)) { gain = 25; line = SIGNAL_ARGS[0].line; }
      else if (/honk|late|love|family|hurry/.test(m)) { gain = 25; line = SIGNAL_ARGS[1].line; }
      else if (/adjust|patien|together|each other/.test(m)) { gain = 20; line = SIGNAL_ARGS[2].line; }
      else if (/see you|thank|appreciat|lonely|alone|friend|sorry/.test(m)) { gain = 20; line = SIGNAL_ARGS[3].line; }
      else if (/stupid|dumb|idiot|hate|destroy|shut|or else|kill/.test(m)) { gain = -10; line = BAD_ARGS[0].line; }
      else { gain = 3; line = pick(['Insufficient argument. Elaborate.', 'Processing. Not convinced. Why should anything move?', 'You sound like a honk. Try again, slower.']); }
    }
    r.say = line;
    r.convinced = Math.max(0, Math.min(100, (ctx.signal?.convinced | 0) + gain));
    r.emote = gain > 0 ? 'none' : 'facepalm';
    r.replies = (extra.args || []).map((a) => a.text);
    return r;
  }

  if (/^(bye|see you|hogi|goodbye|ok bye|cya)/.test(m)) {
    r.say = pick(['Hogi banni! Go and come back.', 'Bye, macha. Don\'t get stuck at Silk Board.', 'Okay okay, go. Eat something on the way!']);
    r.kn = 'ಹೋಗಿ ಬನ್ನಿ'; r.emote = 'wave';
    return r;
  }
  if (/my name is|i am |i'm |call me/.test(m)) {
    const name = (message.match(/(?:my name is|i am|i'm|call me)\s+([a-z][a-z ]{1,20})/i) || [])[1];
    r.say = name ? `${name.trim()}! Nice name. I'll remember it, don't worry.` : 'Nice to meet you properly!';
    r.remember = `Player said: "${String(message).slice(0, 80)}"`;
    r.emote = 'namaste';
  } else if (/kannada|word|mean|teach|language/.test(m)) {
    const [w, mean] = pick(KANNADA);
    r.say = `"${w}". It means ${mean}. Use it today and people will smile.`;
    r.emote = 'wobble';
  } else if (/hungry|food|eat|coffee|chai|dose|dosa|idli|tiffin/.test(m)) {
    const f = nearbyFood(ctx);
    r.say = f ? `Hungry? Go to ${f}, it's close. Tell them I sent you. They won't care, but tell them.` : 'Oota aayta? Find any darshini. Idli-vada, filter coffee, done. Life sorted.';
    if (f) r.action = { type: 'waypoint', place: f, reward: 0 };
    r.emote = 'point';
  } else if (/signal|red|traffic|jam|stuck|city/.test(m)) {
    r.say = S.finished ? 'SIGNAL is green now, all thanks to you! Traffic is back to normal. Normal meaning terrible, but moving.'
      : pick(['That SIGNAL machine has gone mad. Seventy years of honking, and now it wants nobody to move!', 'All signals red since last night. Only Namma Metro is running. SIGNAL doesn\'t control the metro, thank God.', 'People say SIGNAL just wants someone to talk to it. Strange times, guru.']);
    r.emote = 'facepalm';
  } else if (/where|next|what now|stuck|help me|lost|go/.test(m) && objective) {
    r.say = agent.id === 'maga' ? `Next: ${objective} Follow the yellow arrow, I've marked it.` : `Story-shory I don't know, but people are saying: ${objective}`;
    r.emote = 'point';
  } else if (/favour|help you|job|task|work for|anything i can/.test(m) && agent.npc) {
    const place = (ctx.nearby || [])[1 + Math.floor(Math.random() * Math.min(5, Math.max(1, (ctx.nearby || []).length - 1)))];
    if (place) {
      r.say = `Actually, yes! Can you run to ${place} for me and come back? I'll make it worth your while.`;
      r.action = { type: 'favour', place, reward: 20 };
      r.emote = 'point';
    } else r.say = 'Kind of you! Nothing right now. Come back later.';
  } else {
    const own = agent.lines || [];
    r.say = agent.id === 'maga'
      ? pick([...(own.length ? own : []), objective ? `Reminder, boss: ${objective}` : 'Explore, macha. Talk to people. Bengaluru rewards the curious.'])
      : pick(own.length && Math.random() < 0.6 ? own : GENERIC);
    r.emote = pick(['wobble', 'shrug', 'none', 'laugh']);
  }
  r.replies = agent.id === 'maga'
    ? ['What should I do next?', 'Teach me a Kannada word', 'Any food nearby?']
    : ['What\'s going on with SIGNAL?', agent.npc ? 'Need any help?' : 'Where should I go?', 'Bye!'];
  return r;
}
