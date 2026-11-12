import { MORE } from './story_zones.js';

// Characters, missions and street chatter for each district. Missions are async scripts that use
// the context helpers in game/Quests.js. All characters are fictional; the jokes are the ones
// every Bengalurean has made (or suffered) at least once.

const AUTO = { skin: '#8d5a3b', hair: '#1d1a1c', hairStyle: 'short', shirt: '#c8a96b', shirtStyle: 'uniform', pants: '#c8a96b', shoes: '#3a2f2c', extras: ['mustache'] };
const AJJI = { skin: '#a8714c', hair: '#d9d4cc', hairStyle: 'bun', shirt: '#2f8f4e', shirtStyle: 'kurta', pants: '#2f8f4e', extras: ['saree', 'bindi', 'glasses'] };
const TECHIE = { skin: '#c08a62', hair: '#2b211d', hairStyle: 'short', shirt: '#5aa9e6', shirtStyle: 'shirt', pants: '#3b4a63', extras: ['lanyard', 'backpack', 'glasses'] };
const FOUNDER = { skin: '#d7a47c', hair: '#2b211d', hairStyle: 'spiky', shirt: '#2f3a4a', shirtStyle: 'tee', pants: '#9fb4c8', shoes: '#eeeeee', extras: ['glasses'] };
const FAN = { skin: '#a8714c', hair: '#1d1a1c', hairStyle: 'curly', shirt: '#d64b3b', shirtStyle: 'tee', pants: '#2f2f35', extras: ['jersey', 'cap', 'capRed'] };
const READER = { skin: '#c08a62', hair: '#1d1a1c', hairStyle: 'long', shirt: '#b388eb', shirtStyle: 'kurta', pants: '#e9e0cc', extras: ['glasses'] };
const GUIDE = { skin: '#8d5a3b', hair: '#3a2a22', hairStyle: 'ponytail', shirt: '#f2c14e', shirtStyle: 'kurta', pants: '#3b4a63', extras: ['bindi', 'lanyard'] };
const RACER = { skin: '#a8714c', hair: '#1d1a1c', hairStyle: 'short', shirt: '#f2c14e', shirtStyle: 'tee', pants: '#2f2f35', extras: ['helmet'] };

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const STORY = {
  central: {
    npcs: [
      {
        id: 'manju', name: 'Manju Anna', title: 'Hover-auto driver', look: AUTO, color: '#2f8f4e', pitch: 0.8,
        at: 'spot:metro:Mahatma Gandhi Road', offset: [-14, 22], fallback: [612, 110], idle: 'phone',
        chatter: [
          ['Meter? Meter is decoration, saar. Like the Ejipura flyover.', 'ಮೀಟರ್ ಮೇಲೆ ಐವತ್ತು'],
          ['Koramangala? Barolla. Indiranagar? Barolla. Where do I go? Home, saar.', 'ಬರೋಲ್ಲ'],
          ['In 2099 they gave us hover autos. Still no parking. Still Silk Board.'],
          ['You want to go somewhere? Press M, take Namma Metro. Faster than me. Do not tell anyone I said.'],
        ],
      },
      {
        id: 'ajji', name: 'Kamalamma Ajji', title: 'Darshini owner', look: AJJI, color: '#b5651d', pitch: 1.25,
        at: 'poi:Koshy', offset: [6, -6], fallback: [70, 30], pose: null, idle: 'namaste',
        chatter: [
          ['Coffee kudi, magu. Strong, with froth. Not that ₹400 cold brew nonsense.', 'ಕಾಫಿ ಕುಡಿ, ಮಗೂ'],
          ['Oota aayta? You look thin. These startup people never eat on time.', 'ಊಟ ಆಯ್ತಾ?'],
          ['Idli, vada, kesari bath. Menu has not changed since 1962. Why change perfection?'],
        ],
      },
      {
        id: 'prateek', name: 'Pitch-Deck Prateek', title: 'Founder (stealth mode)', look: FOUNDER, color: '#2f3a4a', pitch: 1.05,
        at: 'poi:Church Street Social', offset: [-8, 6], fallback: [175, 40], idle: 'typing',
        chatter: [
          ["Bro, we're pre-revenue but post-vibes."],
          ["I'm not unemployed, I'm in stealth mode."],
          ['My co-founder? He is in Koramangala. Every co-founder is in Koramangala.'],
        ],
      },
      {
        id: 'sita', name: 'Silent Sita', title: 'Cubbon Reads', look: READER, color: '#8e5bb5', pitch: 1.2,
        at: 'spot:bandstand', offset: [16, 10], fallback: [-760, -60], pose: 'sit',
        chatter: [['Shhh.'], ['…(turns a page very loudly)'], ['Shhh. This is a silent reading event. You may wave.']],
      },
      {
        id: 'eshwar', name: 'Ee Sala Eshwar', title: 'RCB superfan', look: FAN, color: '#d64b3b', pitch: 0.95,
        at: 'spot:stadiumGate', offset: [6, 0], fallback: [-40, -316], idle: 'cheer',
        chatter: [
          ['EE SALA CUP NAMDE! …What do you mean we already won? Say it louder anyway!', 'ಈ ಸಲ ಕಪ್ ನಮ್ದೇ!'],
          ['I have been chanting since 2008. My throat has its own fan club.'],
          ['Bring a friend and play Catch the Six with me. More hands, more catches.'],
        ],
      },
      {
        id: 'gowramma', name: 'Guide Gowramma', title: 'Heritage walks', look: GUIDE, color: '#c9a64b', pitch: 1.15,
        at: 'spot:vidhanaSteps', offset: [8, 34], fallback: [-980, -380],
        chatter: [
          ['Vidhana Soudha: 1956, granite, neo-Dravidian. Bigger than your rent agreement.', 'ವಿಧಾನ ಸೌಧ'],
          ['The inscription says "Government work is God\'s work". Both move in mysterious ways.'],
          ['Cubbon Park is 300 acres. In my time we called it "the lungs of the city". Now we call it "parking for walkers".'],
        ],
      },
      {
        id: 'rakesh', name: 'Rapido Rakesh', title: 'Bike taxi & race organiser', look: RACER, color: '#f2a20c', pitch: 1.0,
        at: 'spot:metro:Mahatma Gandhi Road', offset: [30, 18], fallback: [660, 110], idle: 'wave',
        chatter: [['Weekdays I am a Senior Product Manager. Weekends I drive Rapido. For the stories.']],
      },
      {
        id: 'placard', name: 'Placard Pradeep', title: 'Looking for a 2BHK', look: TECHIE, color: '#5aa9e6', pitch: 1.0,
        at: 'spot:stadiumGate', offset: [14, 22], fallback: [-30, -280], pose: 'cheer',
        chatter: [
          ['My placard says "LOOKING FOR 2BHK IN INDIRANAGAR". The camera found me before a landlord did.'],
          ['Ten months deposit. TEN. I could buy a hover-auto with that. A used one. From Manju.'],
        ],
      },
    ],

    quests: [
      {
        id: 'welcome', title: 'Swalpa Adjust Maadi', giver: 'manju', coins: 50, phrase: 'adjust',
        summary: 'Learn the most important words in Bengaluru',
        async run(q) {
          await q.say('manju', 'Saar! New in Bengaluru, ah? I can tell. You are looking at the weather like it owes you money.');
          const i = await q.choose('manju', 'Where to?', ['Koramangala, please.', 'Can you put the meter on?', 'Just exploring, anna.']);
          if (i === 0) await q.say('manju', 'Koramangala? Barolla, saar. Traffic. … Okay okay. Meter mele fifty.', 'ಬರೋಲ್ಲ, ಸಾರ್');
          else if (i === 1) await q.say('manju', 'Meter? *looks at meter like it is a museum piece* Meter mele fifty, saar.', 'ಮೀಟರ್ ಮೇಲೆ ಐವತ್ತು');
          else await q.say('manju', 'Exploring! Good, good. Today exploring, tomorrow paying ₹45,000 rent in Indiranagar.');
          await q.say('manju', 'But first, magic words. Without these you will not survive one day here.');
          await q.say('manju', '"Swalpa adjust maadi." Please adjust a little. Bus full? Swalpa adjust maadi. Auto full? Swalpa adjust maadi. Life? Swalpa adjust maadi.', 'ಸ್ವಲ್ಪ ಅಡ್ಜಸ್ಟ್ ಮಾಡಿ');
          await q.say('manju', 'Go! Say it to three strangers on the footpath. Watch the magic.');
          q.done();
          let count = 0;
          const lines = [
            ['Oh! Kannada! *adjusts happily*', 'Super!'],
            ['*moves exactly 2 centimetres* There. Adjusted.', 'Done.'],
            ['Adjust? I have been adjusting since 1998, maga.', 'Ayyo'],
            ['Nice! Are you from here? … No? You will be.', 'Nice'],
            ['*head wobble that means yes, no and maybe*', '?'],
          ];
          q.qs.pedTalk = {
            prompt: 'Say "Swalpa adjust maadi"',
            fn: (ped) => {
              ped.greeted = true;
              const [l] = lines[count % lines.length];
              q.game.sendChat('Swalpa adjust maadi', false);
              ped.av.play(count % 2 ? 'wobble' : 'namaste', 2);
              ped.idle = 2.5;
              ped.off += 0.8;
              setTimeout(() => q.game.fx.pop(q.game.player.pos.clone().setY(q.game.player.pos.y + 0.2), l.length > 18 ? 'ADJUSTED!' : l), 400);
              q.game.hud.toast(`Stranger: ${l}`, 2600);
              count++;
            },
          };
          q.cleanup.push(() => (q.qs.pedTalk = null));
          q.objective('Say "Swalpa adjust maadi" to 3 strangers on the footpath (walk up to people)');
          await q.until(() => count >= 3);
          q.qs.pedTalk = null;
          const m = q.npc('manju');
          await q.goto(m.pos.x, m.pos.z, { r: 4, text: 'Go back to Manju Anna' });
          await q.say('manju', 'See? Three people adjusted. Now you are ten percent Bengalurean.');
          await q.say('manju', 'The other ninety percent is sitting in traffic. You will get there.');
          await q.say('manju', 'Tip: press R and your hover scooter comes. Press M for Namma Metro to other areas. And talk to Ajji near Koshy\'s — she needs help.');
        },
      },
      {
        id: 'coffee', title: 'Filter Coffee Express', giver: 'ajji', requires: ['welcome'], coins: 60, phrase: 'coffee',
        summary: 'Deliver filter coffee before it goes cold',
        async run(q) {
          await q.say('ajji', 'Magu! Thank God. My delivery boy took the order to Silk Board in 2087. He is still in the queue.', 'ಮಗೂ!');
          await q.say('ajji', 'Three regulars are waiting for coffee. Filter coffee must be HOT. Cold filter coffee is a crime in this state.');
          const i = await q.choose('ajji', 'Can you run? Or ride your scooter, I don\'t care.', ['Yes, Ajji!', 'What\'s in it for me?']);
          if (i === 1) await q.say('ajji', 'For you? Free coffee for life. And my blessings. Blessings are worth more than ESOPs, magu.');
          q.done();
          const P = q.pos();
          const spots = [
            q.poi(/Blossom|Book/i, [P.x + 120, P.z + 40]),
            q.poi(/Brigade|Hard Rock|Pub|Social/i, [P.x + 260, P.z + 90]),
            q.poi(/Bank|Office|Towers|Plaza/i, [P.x - 150, P.z + 140]),
          ].filter(Boolean);
          const people = [
            { name: 'Anxious Ananya', look: TECHIE, line: 'Coffee! I have a standup in 2 minutes. Standups here last 2 hours.' },
            { name: 'Professor Prasad', look: { ...AUTO, shirt: '#f7f3e8', shirtStyle: 'kurta', extras: ['glasses', 'veshti'] }, line: 'Ah, decoction! Correct ratio. You may enter Basavanagudi now.' },
            { name: 'Gym Bro Girish', look: { ...FOUNDER, shirt: '#e75a7c' }, line: 'Bro, is this keto? … Who cares. Filter coffee is a lifestyle.' },
          ];
          let left = 100;
          const t0 = performance.now();
          for (let k = 0; k < spots.length; k++) {
            const [x, z] = q.near(spots[k][0], spots[k][1], 10);
            const who = people[k];
            const n = q.spawn({ id: 'cust' + k, name: who.name, look: who.look, x, z, temp: true, silent: true });
            const remaining = Math.max(15, left - (performance.now() - t0) / 1000);
            await q.goto(x, z, { r: 3.5, text: `Deliver coffee to ${who.name} (still hot!)`, time: remaining, failText: 'The coffee went cold. Ajji is disappointed.', icon: '☕' });
            n.emote('cheer', 1.5);
            await q.say({ name: who.name, color: '#5aa9e6', pitch: 1.1 }, who.line);
            q.done();
            q.game.addCoins(10, n.pos);
          }
          await q.say('ajji', 'All three, still hot? You are faster than 10-minute delivery. You are 9-minute delivery.');
          await q.say('ajji', 'Learn this: "Banni, coffee kudiyona" — come, let\'s have coffee. Fixes every problem in Bengaluru.', 'ಬನ್ನಿ, ಕಾಫಿ ಕುಡಿಯೋಣ');
        },
      },
      {
        id: 'reads', title: 'Cubbon Reads', giver: 'sita', requires: ['welcome'], coins: 50, phrase: 'nimsha',
        summary: 'Sit still and read. In Bengaluru. Good luck.',
        async run(q) {
          await q.say('sita', 'Shhh. Welcome to Cubbon Reads. Every Saturday, hundreds of us sit under the trees and read. Silently.');
          await q.say('sita', 'Sit on the grass (Q → Sit) and do not move for 25 seconds. Whatever happens.');
          q.done();
          const s = q.npc('sita');
          const [sx, sz] = q.near(s.pos.x + 3, s.pos.z + 2, 3);
          await q.goto(sx, sz, { r: 3, text: 'Find a spot on the grass next to Sita' });
          q.objective('Press Q and choose 🪑 Sit (or press 9 then sit from the menu)');
          let sitting = false;
          q.qs.emoteHook = (id) => { if (id === 'sit') sitting = true; };
          q.cleanup.push(() => (q.qs.emoteHook = null));
          await q.until(() => sitting, { time: 60, failText: 'You never sat down. Sita is judging you.' });
          q.objective('Stay still… (don\'t touch the controls)');
          const P = q.pos().clone();
          const events = [
            [4, 'Kadlekai! Groundnuts! Hot hot kadlekai!', 'A peanut seller wanders by'],
            [9, '*a jogger runs past playing music from a Bluetooth speaker*', 'Loud jogger!'],
            [14, 'Bro, is this a startup networking event? We\'re hiring.', 'A recruiter appears'],
            [19, 'WOOF! *a Cubbon dog sniffs your book*', 'A dog investigates'],
          ];
          const t0 = performance.now();
          let ei = 0;
          await q.until(() => {
            const t = (performance.now() - t0) / 1000;
            if (ei < events.length && t > events[ei][0]) { q.toast(events[ei][1], 3500); q.game.fx.pop(P.clone().add({ x: 2, y: 0.5, z: 1 }), events[ei][2].toUpperCase()); ei++; }
            if (P.distanceTo(q.pos()) > 0.6 || q.game.player.mode === 'ride') q.fail('SHHHH! You moved. Sita has banned you for a week.');
            return t > 25;
          }, { time: 40, showTimer: false });
          q.game.player.avatar.stop();
          await q.say('sita', '…You did it. You read a book. In public. Without checking your phone. You are ready for anything.');
          await q.say('sita', 'Take this phrase: "Ond nimsha" — one minute. In Bengaluru it can mean anything from one minute to one year.', 'ಒಂದ್ ನಿಮಿಷ');
        },
      },
      {
        id: 'cup', title: 'Ee Sala Cup Namde', giver: 'eshwar', requires: ['welcome'], coins: 80, phrase: 'cup',
        summary: 'Find the lucky RCB flags around Chinnaswamy',
        async run(q) {
          await q.say('eshwar', 'EE SALA— oh, hello. Crisis. My five lucky flags blew away. Without them the team cannot perform. Science.');
          await q.say('eshwar', 'They are all around the stadium. One is up on the stands, I think. You can climb, no? Jump into a wall and climb!');
          q.done();
          const c = q.spot('stadiumCenter') || [q.pos().x, q.pos().z];
          const pts = [];
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 + 0.4, d = i === 2 ? 98 : 40 + i * 9;
            const x = c[0] + Math.cos(a) * d, z = c[1] + Math.sin(a) * d;
            pts.push([x, z, i === 2 ? 22.5 : undefined]);
          }
          await q.collect(pts, { text: 'Find the lucky RCB flags', icon: '🚩', color: '#d64b3b', label: 'FLAG!', time: 240, failText: 'Match started without the flags. We lost. Again.' });
          await q.goto(c[0], c[1], { r: 8, text: 'Take the flags to the middle of the pitch', exact: true });
          q.objective('Do the chant! Press Q and choose 🙌 Cheer');
          let cheered = false;
          q.qs.emoteHook = (id) => { if (id === 'cheer') cheered = true; };
          q.cleanup.push(() => (q.qs.emoteHook = null));
          await q.until(() => cheered, { time: 40, failText: 'No chant, no cup.' });
          q.big('EE SALA CUP NAMDE!', 'ಈ ಸಲ ಕಪ್ ನಮ್ದೇ!', 3000);
          q.game.fx.confetti(q.pos(), 160);
          await q.wait(2.5);
          await q.say('eshwar', 'GOOSEBUMPS! I am crying. Do not look. Here, the most powerful phrase in Karnataka is now yours.');
          await q.say('eshwar', 'Come back with friends and talk to me for Catch the Six!');
        },
      },
      {
        id: 'sixes', title: 'Catch the Six', giver: 'eshwar', requires: ['cup'], repeat: true,
        summary: 'Catch cricket balls flying out of Chinnaswamy (play with friends!)',
        async run(q) {
          const i = await q.choose('eshwar', 'Catch the Six! I hit, you catch. Everyone nearby can join. Ready?', ['Let\'s go!', 'Later'], '', 1);
          if (i === 1) return;
          q.done();
          const c = q.spot('stadiumCenter');
          if (c) await q.goto(c[0], c[1], { r: 30, text: 'Get onto the field', exact: true });
          await q.minigame('sixes');
        },
      },
      {
        id: 'race', title: 'Hover Race', giver: 'rakesh', requires: ['welcome'], repeat: true,
        summary: 'Race through real streets on your hover scooter',
        async run(q) {
          const best = +(localStorage.getItem('pb.race.central') || 0);
          const i = await q.choose('rakesh', `Hover race through the streets! Checkpoints, no traffic rules (as usual). Everyone nearby can join.${best ? ` Your best: ${best.toFixed(1)}s.` : ''}`, ['Start a race!', 'Not now'], '', 1);
          if (i === 1) return;
          q.done();
          await q.minigame('race');
        },
      },
      {
        id: 'god', title: "Government Work is God's Work", giver: 'gowramma', requires: ['welcome'], coins: 70, phrase: 'hogi',
        summary: 'Get one form stamped. How hard can it be?',
        async run(q) {
          await q.say('gowramma', 'Tourist? Welcome to Vidhana Soudha! Want to see inside? Just get this visitor form stamped.');
          await q.say('gowramma', 'Three counters only. Very fast. Very modern. Since 2099 we have even switched off the fax machine. Mostly.');
          q.done();
          const vs = q.spot('vidhanaTop') || [q.pos().x + 30, q.pos().z];
          const hc = q.poi(/High Court/i, [vs[0] + 150, vs[1] + 120]);
          await q.goto(vs[0], vs[1], { r: 6, text: 'Counter 1: climb the Vidhana Soudha steps' });
          const c1 = q.spawn({ id: 'clerk1', name: 'Counter 1 Clerk', look: { ...TECHIE, extras: ['glasses'] }, x: vs[0] + 2, z: vs[1] + 3, y: 7, temp: true, silent: true });
          c1.pos.y = 7;
          await q.say({ name: 'Counter 1', color: '#7d8a83' }, 'Form? Where is the Xerox copy? Two copies. Self-attested. Go to the High Court shop for Xerox.');
          q.done();
          await q.goto(hc[0], hc[1], { r: 12, text: 'Get Xerox copies near the High Court', time: 120 });
          await q.say({ name: 'Xerox Uncle', color: '#7d8a83' }, 'Xerox? Light illa. Power cut. Come after lunch. … Joking! ₹2 per page. Ninety rupees.');
          q.done();
          await q.goto(vs[0], vs[1], { r: 6, text: 'Back to Counter 1 with the copies', time: 120 });
          await q.say({ name: 'Counter 1', color: '#7d8a83' }, 'Copies, very good. Now stamp from Counter 2. Counter 2 is… on lunch. Wait here.');
          q.done();
          q.objective('Wait for Counter 2 to come back from lunch…');
          await q.wait(6);
          q.toast('*Counter 2 returns, holding a tiffin box*');
          await q.say({ name: 'Counter 2', color: '#7d8a83' }, '*THUMP* Stamped. Your file will be processed in 2 to 3 business years. Next!');
          q.done();
          const g = q.npc('gowramma');
          await q.goto(g.pos.x, g.pos.z, { r: 4, text: 'Show Gowramma your stamped form' });
          await q.say('gowramma', 'Only one hour?! A record! The Chief Minister himself would be jealous.');
          await q.say('gowramma', 'When you leave somewhere, never say "bye". Say "Hogi banni" — go and come back.', 'ಹೋಗಿ ಬನ್ನಿ');
        },
      },
      {
        id: 'pitch', title: 'Pitch Perfect', giver: 'prateek', requires: ['coffee'], coins: 120, phrase: 'macha',
        summary: 'Help Prateek pitch his startup',
        async run(q) {
          await q.say('prateek', 'Bro. BRO. A VC is here in this very cafe. I have 90 seconds. Help me craft the pitch.');
          const steps = [
            ['First line. What are we building?', ['Uber for filter coffee', 'An AI that finds 2BHKs in Indiranagar', 'A spreadsheet'], [2, 3, 0]],
            ['Business model?', ['Subscriptions', 'Ads', 'We\'ll figure it out after the Series B'], [1, 1, 3]],
            ['Moat?', ['Our tech', 'Our team', 'Silk Board traffic (users can\'t escape)'], [1, 1, 3]],
            ['Close it. Say something visionary.', ['We are the Spotify of idli.', 'We will be profitable in Q3.', 'Ee sala funding namde!'], [2, 0, 3]],
          ];
          let score = 0;
          for (const [qn, opts, pts] of steps) { const i = await q.choose('prateek', qn, opts); score += pts[i]; }
          q.done();
          const vc = q.spawn({ id: 'vc', name: 'VC Vasundhara', look: { ...TECHIE, shirt: '#ffffff', extras: ['glasses'] }, x: q.pos().x + 3, z: q.pos().z + 2, temp: true, silent: true });
          vc.face(q.pos().x, q.pos().z);
          if (score >= 9) {
            await q.say({ name: 'VC Vasundhara', color: '#2f3a4a' }, 'Pre-revenue. Pre-product. Pre-team. … I love it. Here\'s ₹100 crore at a ₹1000 crore valuation.');
            q.big('FUNDED!', '₹1000 CR VALUATION · 0 CUSTOMERS', 3000);
            vc.emote('cheer', 2);
            await q.wait(2);
            await q.say('prateek', 'MACHA! SAKKATH! We\'re a unicorn! Next stop: a ₹400 cold brew to celebrate.', 'ಮಚ್ಚಾ, ಸಕ್ಕತ್!');
          } else {
            await q.say({ name: 'VC Vasundhara', color: '#2f3a4a' }, 'Interesting. Let\'s circle back. Ping me on LinkedIn. (She will not reply.)');
            await q.say('prateek', 'It\'s fine, bro. Pivoting is a lifestyle. We are now… a podcast.');
          }
        },
      },
    ],

    // Kannada word cards: most sit on rooftops (climb up!); some at landmarks.
    cards: [
      { phrase: 'guru' }, { phrase: 'bega' }, { phrase: 'super' }, { phrase: 'traffic' },
      { phrase: 'weather', at: 'spot:bandstand', offset: [-12, 8] },
      { phrase: 'meter' },
    ],
  },
};

Object.assign(STORY, MORE);

// Every district also gets a few generic locals; zones without a chapter get word cards too.
const GENERIC_LOCALS = [
  { name: 'Uncle with Opinions', look: { ...AUTO, shirt: '#f7f3e8', shirtStyle: 'shirt', extras: ['glasses', 'veshti'] }, lines: [
    ['In my time all this was lakes and fields. Now it is lakes in the roads.'],
    ['You know what this city needs? One more flyover. Then everything will be fine. Trust me.'],
    ['Weather is still the best in India. Do not argue with me.'],
  ] },
  { name: 'Techie on a Call', look: TECHIE, idle: 'phone', lines: [
    ['Can you hear me? … You\'re on mute. … No, YOU are on mute.'],
    ['Sorry, I\'m in traffic. I am always in traffic. My manager thinks traffic is my location.'],
    ['Let\'s take this offline. I am offline. I am literally on the footpath.'],
  ] },
  { name: 'Chaiwala Chandru', look: { ...AUTO, shirt: '#ffffff', shirtStyle: 'tee', extras: ['mustache'] }, lines: [
    ['Chai? Coffee? Bun-maska? Life advice? All ₹15.'],
    ['Oota aayta? Had your meal? … No? Then have a vada at least.', 'ಊಟ ಆಯ್ತಾ?'],
  ] },
  { name: 'Delivery Dinesh', look: { ...RACER, shirt: '#f07b20', extras: ['helmet', 'deliveryBox'] }, idle: 'phone', lines: [
    ['10-minute delivery! Already 40 minutes. The other 30 minutes were the traffic\'s fault.'],
    ['Customer said "leave at door". Which door? There are 400 doors in this building.'],
  ] },
];

for (const zone of ['central', 'indiranagar', 'koramangala', 'silkboard', 'basavanagudi', 'bellandur', 'majestic', 'malleshwaram', 'ecity', 'whitefield']) {
  const st = STORY[zone] || (STORY[zone] = { npcs: [], quests: [], cards: [{ phrase: 'guru' }, { phrase: 'super' }, { phrase: 'bega' }] });
  GENERIC_LOCALS.forEach((l, i) => st.npcs.push({
    id: 'local' + i, name: l.name, look: l.look, idle: l.idle, color: ['#8e5bb5', '#5aa9e6', '#b5651d', '#f07b20'][i],
    at: 'near-spawn', ring: i, chatter: l.lines,
  }));
}

export { pick };
