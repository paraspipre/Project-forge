// Chapters for every district beyond MG Road. Same mission scripting as data/story.js.

const AUTO = { skin: '#8d5a3b', hair: '#1d1a1c', hairStyle: 'short', shirt: '#c8a96b', shirtStyle: 'uniform', pants: '#c8a96b', shoes: '#3a2f2c', extras: ['mustache'] };
const TECHIE = { skin: '#c08a62', hair: '#2b211d', hairStyle: 'short', shirt: '#5aa9e6', shirtStyle: 'shirt', pants: '#3b4a63', extras: ['lanyard', 'backpack', 'glasses'] };
const TECHIE2 = { skin: '#a8714c', hair: '#1d1a1c', hairStyle: 'ponytail', shirt: '#e75a7c', shirtStyle: 'kurta', pants: '#3b4a63', extras: ['lanyard', 'glasses'] };
const FOUNDER = { skin: '#d7a47c', hair: '#2b211d', hairStyle: 'spiky', shirt: '#2f3a4a', shirtStyle: 'tee', pants: '#9fb4c8', shoes: '#eeeeee', extras: ['glasses'] };
const COP = { skin: '#8d5a3b', hair: '#1d1a1c', hairStyle: 'short', shirt: '#c8a96b', shirtStyle: 'uniform', pants: '#3b3b40', extras: ['mustache', 'cap'] };
const RIDER = { skin: '#a8714c', hair: '#1d1a1c', hairStyle: 'short', shirt: '#f07b20', shirtStyle: 'tee', pants: '#2f2f35', extras: ['helmet', 'deliveryBox'] };
const UNCLE = { skin: '#8d5a3b', hair: '#d9d4cc', hairStyle: 'bald', shirt: '#f7f3e8', shirtStyle: 'shirt', pants: '#f7f3e8', extras: ['glasses', 'veshti', 'mustache'] };
const AUNTY = { skin: '#c08a62', hair: '#1d1a1c', hairStyle: 'bun', shirt: '#b388eb', shirtStyle: 'kurta', extras: ['saree', 'bindi'] };
const WAITER = { skin: '#8d5a3b', hair: '#1d1a1c', hairStyle: 'short', shirt: '#ffffff', shirtStyle: 'shirt', pants: '#f7f3e8', extras: ['veshti', 'mustache'] };
const STUDENT = { skin: '#c08a62', hair: '#2b211d', hairStyle: 'curly', shirt: '#7dc47c', shirtStyle: 'tee', pants: '#3b4a63', extras: ['backpack'] };
const SCIENTIST = { skin: '#a8714c', hair: '#3a2a22', hairStyle: 'long', shirt: '#ffffff', shirtStyle: 'kurta', pants: '#2f6fd1', extras: ['glasses', 'lanyard'] };

const sp = (q, name, fb) => q.spot(name) || fb;

export const MORE = {
  // ======================================================================= SILK BOARD
  silkboard: {
    npcs: [
      { id: 'thimmappa', name: 'Constable Thimmappa', title: 'Silk Board traffic police', look: COP, color: '#8a6d3b', pitch: 0.8, at: 'spot:junction', offset: [30, 40], fallback: [-390, 30], idle: 'point',
        chatter: [['I have been directing traffic here since 2071. The traffic has not noticed.'], ['Signal is green. Signal is red. Nobody moves. Same same.'], ['Crossing on foot is fastest. Do not tell the cars, they will feel bad.']] },
      { id: 'tejas', name: 'Tejas in the Auto', title: 'Stuck since 9 AM', look: TECHIE, color: '#5aa9e6', pitch: 1.05, at: 'spot:stuckAuto', offset: [3, 2], fallback: [-397, 25], pose: 'typing',
        chatter: [['Standup started 40 minutes ago. I am still standing up. In an auto.'], ['My manager asked for an ETA. I said "Silk Board". He understood.']] },
      { id: 'manjula', name: 'Engineer Manjula', title: 'Double-decker flyover', look: SCIENTIST, color: '#e2b51a', pitch: 1.1, at: 'station:Central Silk Board', offset: [20, 22], fallback: [-570, 70], idle: 'point',
        chatter: [['Road on the bottom, metro on top. Double-decker! Next we will add a third deck. For the traffic to wait in.']] },
      { id: 'snack', name: 'Snack Seller Sunil', title: 'Traffic-jam caterer', look: { ...AUTO, shirt: '#ffffff', shirtStyle: 'tee' }, color: '#d64b3b', pitch: 0.95, at: 'spot:junction', offset: [-30, 25], fallback: [-450, 20],
        chatter: [['Kadlekai! Cucumber! Phone chargers! Everything you need for the 2-hour journey of 3 kilometres.'], ['Business is good. Silk Board is the best restaurant location in India.']] },
    ],
    quests: [
      { id: 'sb_cross', title: 'Crossing Silk Board', giver: 'thimmappa', coins: 80, phrase: 'traffic', summary: 'Cross the most famous junction in India',
        async run(q) {
          await q.say('thimmappa', 'You want to cross Silk Board? Brave. Very brave. People have entered this junction as freshers and left as team leads.');
          await q.say('thimmappa', 'Reach the other side in 70 seconds. On foot. Weave between the vehicles — they are not going anywhere anyway.');
          q.done();
          const J = sp(q, 'junction', [-423, -9]);
          const [x, z] = q.near(J[0] + 140, J[1] - 110, 12);
          await q.goto(x, z, { r: 8, text: 'Cross the junction to the far corner', time: 70, failText: 'Absorbed by the traffic. See you next quarter.', icon: '🏁' });
          q.big('YOU CROSSED SILK BOARD', 'Faster than every car here. On foot.', 3000);
          await q.wait(2);
          const t = q.npc('thimmappa');
          await q.goto(t.pos.x, t.pos.z, { r: 5, text: 'Report back to Constable Thimmappa', time: 120 });
          await q.say('thimmappa', 'You made it?! *takes off cap* In 2083 a man tried. They say he is still on the median, selling kadlekai.');
          await q.say('thimmappa', 'Take this phrase. You will use it every day for the rest of your life: "Traffic, late aagutte" — traffic, I will be late.', 'ಟ್ರಾಫಿಕ್, ಲೇಟ್ ಆಗುತ್ತೆ');
        } },
      { id: 'sb_wft', title: 'Work From Traffic', giver: 'tejas', coins: 90, summary: 'Get Tejas a charger and a coffee before his laptop dies',
        async run(q) {
          await q.say('tejas', 'Bro. BRO. Laptop at 3 percent. I am presenting the quarterly roadmap in 4 minutes. From this auto.');
          await q.say('tejas', 'I need a charger and a coffee. The snack guy has chargers. There is a darshini on the corner. Please. My career depends on you.');
          q.done();
          const s = q.npc('snack');
          const P = q.pos();
          const coffee = q.poi(/coffee|cafe|darshini|tiffin|hotel|bakery|chai/i, [P.x + 80, P.z - 60]);
          await q.collect([[s.pos.x + 1.5, s.pos.z], q.near(coffee[0], coffee[1], 8)], { text: 'Get a charger and a filter coffee', icon: '🔌', time: 150, failText: 'Laptop died at 0%. Tejas has been promoted to "away".' });
          const a = q.npc('tejas');
          await q.goto(a.pos.x, a.pos.z, { r: 4, text: 'Run them back to the auto', time: 90 });
          await q.say('tejas', '*plugs in* *sips* "…and that is why Q3 is a growth quarter." *unmutes* They loved it. They think I am in a cafe. I am in an auto. At Silk Board.');
          await q.say({ name: 'Auto driver', color: '#2f8f4e', pitch: 0.8 }, 'Saar, meter is at ₹890. We moved 40 metres.');
        } },
      { id: 'sb_deck', title: 'The Double Decker', giver: 'manjula', requires: ['sb_cross'], coins: 100, summary: 'Ride the double-decker flyover on your hover scooter',
        async run(q) {
          await q.say('manjula', 'Bengaluru\'s first double-decker: road below, metro above. Take your hover scooter up the ramp and ride it end to end.');
          await q.say('manjula', 'Press R for your scooter. And please do not try to ride on the metro deck. We have had… incidents.');
          q.done();
          // find the double-decker deck: the highest bridge road in the zone
          const roads = q.game.city.roads.filter((r) => r.bridge && r.heights && (r.name || '').toLowerCase().includes('silk'));
          const deck = roads.sort((a, b) => b.pts.length - a.pts.length)[0];
          if (!deck) { await q.say('manjula', 'Hm, the flyover is closed for "maintenance". Come back later.'); return; }
          const a = deck.pts[0], b = deck.pts[deck.pts.length - 1];
          await q.goto(a[0], a[1], { r: 12, text: 'Ride to the start of the flyover', ride: true });
          q.objective('Ride along the flyover to the far end (stay on the deck!)');
          await q.goto(b[0], b[1], { r: 14, text: 'Ride along the flyover to the far end', ride: true, time: 90 });
          q.big('DOUBLE DECKER!', 'Metro above, you in the middle, traffic below', 2800);
          await q.wait(2);
          await q.say('manjula', 'Smooth! Only you and the pigeons have used it without traffic. Welcome to the future.');
        } },
    ],
    cards: [{ phrase: 'traffic' }, { phrase: 'nimsha' }, { phrase: 'bega' }, { phrase: 'guru' }],
  },

  // ======================================================================= KORAMANGALA
  koramangala: {
    npcs: [
      { id: 'dinesh', name: 'Delivery Dinesh', title: 'ZIPPO 10-minute delivery', look: RIDER, color: '#f07b20', pitch: 1.0, at: 'spot:sony', offset: [12, 14], fallback: [560, -280], idle: 'phone',
        chatter: [['10-minute delivery! The 10 minutes start when I feel like it.'], ['Customer wrote "near the tree". This is Bengaluru. There are 40 lakh trees.']] },
      { id: 'farah', name: 'Founder Farah', title: 'Looking for a co-founder', look: { ...FOUNDER, hairStyle: 'long', shirt: '#b388eb' }, color: '#8e5bb5', pitch: 1.15, at: 'poi:Third Wave', offset: [-6, 6], fallback: [760, -70], idle: 'typing',
        chatter: [['My startup is "LinkedIn for cows". The cows are not on LinkedIn yet. Huge market.'], ['I have 3 advisors, 2 interns and 0 users. Classic.']] },
      { id: 'vc2', name: 'Angel Anand', title: 'Investor, allegedly', look: { ...TECHIE, shirt: '#ffffff', extras: ['glasses'] }, color: '#2f3a4a', pitch: 0.95, at: 'spot:social', offset: [6, 8], fallback: [-890, -160], idle: 'phone',
        chatter: [['I only invest in founders who wake up at 4 AM. I wake up at 11. It is called conviction.'], ['What is your burn rate? … No, your personal burn rate. How many cold brews per day?']] },
      { id: 'kora_uncle', name: 'Jayanna Uncle', title: 'Lived here before the startups', look: UNCLE, color: '#b5651d', pitch: 0.85, at: [0, 0], idle: 'wobble',
        chatter: [['In 1985 this was all coconut groves. Now it is all "cohorts".'], ['My son is a founder. I ask him "what do you make?" He says "impact". I ask "how much?" He says "pre-revenue".']] },
    ],
    quests: [
      { id: 'ko_zippo', title: '10-Minute Delivery', giver: 'dinesh', coins: 120, phrase: 'bega', summary: 'Deliver three ZIPPO orders across Koramangala before the 10-minute promise expires',
        async run(q) {
          await q.say('dinesh', 'Macha! I have 3 orders and my scooter is stuck at the Sony World signal. The app says "10 minutes". The app lies, but customers believe it.');
          await q.say('dinesh', 'Pick up at the dark store, then drop in Koramangala blocks. Use your hover scooter. In app time you have 10 minutes. In real time… 2 and a half.');
          q.done();
          const P = q.pos();
          const store = q.near(P.x + 40, P.z + 30, 15);
          await q.goto(store[0], store[1], { r: 5, text: 'Pick up the orders at the ZIPPO dark store', icon: '📦' });
          q.toast('Orders: 1 packet curd, 1 bunch coriander, 1 iPhone 99 Pro Max.');
          const items = ['curd', 'coriander', 'iPhone'];
          const start = performance.now();
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 + 0.6;
            const [x, z] = q.near(P.x + Math.cos(a) * (240 + i * 60), P.z + Math.sin(a) * (240 + i * 60), 15);
            const left = 150 - (performance.now() - start) / 1000;
            await q.goto(x, z, { r: 5, text: `Deliver the ${items[i]} (${3 - i} left)`, time: left, failText: 'Late! Customer gave 1 star: "Took 11 minutes. Unacceptable."', icon: '📦' });
            q.game.addCoins(15, q.pos());
            q.toast(['Customer: "You\'re early?! I haven\'t even ordered yet."', 'Customer: "Can you also take the garbage down?"', 'Customer: "5 stars. Also, are you single? My daughter is a PM."'][i], 3200);
          }
          await q.say('dinesh', 'All three in time?! You are the reason the app says 10 minutes. Here, my most used Kannada phrase: "Bega baa!" — come fast!', 'ಬೇಗ ಬಾ!');
        } },
      { id: 'ko_cofounder', title: 'Co-Founder Wanted', giver: 'farah', coins: 110, phrase: 'macha', summary: 'Find Farah a co-founder in Koramangala',
        async run(q) {
          await q.say('farah', 'I need a technical co-founder. Requirements: knows "AI", works for equity, and believes cows deserve LinkedIn.');
          await q.say('farah', 'There are four techies in the cafes around here. Go recruit one. Warning: they are all already founders.');
          q.done();
          const P = q.pos();
          const cands = [
            ['Pivot Pavan', 'Sorry, I\'m building "Tinder for flatmates". We pivot every Tuesday.'],
            ['Blockchain Bhavana', 'Is it on the blockchain? No? Then it doesn\'t exist.'],
            ['Burnout Bharath', 'I founded 6 startups this year. I just want to sleep. Is sleep a startup?'],
            ['Debug Deepa', 'Cows on LinkedIn… with endorsements for "grazing"? … I\'m in. But I want my name first on the pitch deck.'],
          ];
          for (let i = 0; i < cands.length; i++) {
            const a = i * 1.6 + 0.3;
            const [x, z] = q.near(P.x + Math.cos(a) * (90 + i * 35), P.z + Math.sin(a) * (90 + i * 35), 12);
            const n = q.spawn({ id: 'cand' + i, name: cands[i][0], look: i % 2 ? TECHIE2 : TECHIE, x, z, temp: true, silent: true, idle: 'typing' });
            await q.goto(x, z, { r: 4, text: `Talk to ${cands[i][0]} (${i + 1}/4)` });
            n.face(q.pos().x, q.pos().z);
            await q.say({ name: cands[i][0], color: '#5aa9e6' }, cands[i][1]);
            q.done();
          }
          const f = q.npc('farah');
          await q.goto(f.pos.x, f.pos.z, { r: 4, text: 'Bring the news to Farah' });
          await q.say('farah', 'Deepa said YES? We are a TEAM! Next: a WhatsApp group, a logo, and a ₹400 cold brew. Product can wait.');
          await q.say('farah', '"Macha, sakkath!" — that is how you say "dude, awesome" here. Use it liberally. Founders do.', 'ಮಚ್ಚಾ, ಸಕ್ಕತ್!');
        } },
      { id: 'ko_race', title: 'Koramangala Hover Race', giver: 'dinesh', requires: ['ko_zippo'], repeat: true, summary: 'Race through Koramangala on your hover scooter',
        async run(q) {
          const i = await q.choose('dinesh', 'Race me through the blocks? Everyone nearby can join.', ['Start the race!', 'Later']);
          if (i === 1) return;
          q.done();
          await q.minigame('race');
        } },
    ],
    cards: [{ phrase: 'macha' }, { phrase: 'super' }, { phrase: 'coffee' }, { phrase: 'guru' }],
  },

  // ======================================================================= INDIRANAGAR
  indiranagar: {
    npcs: [
      { id: 'broker', name: 'Broker Babu', title: 'No brokerage* (*conditions apply)', look: { ...AUTO, shirt: '#ffffff', shirtStyle: 'shirt', pants: '#3b3b40', extras: ['mustache', 'phone'] }, color: '#c0392b', pitch: 0.9, at: 'spot:metro', offset: [40, 30], fallback: [-200, -440], idle: 'phone',
        chatter: [['Indiranagar flats are like Silk Board: everyone wants in, nobody moves.'], ['1BHK, 1BHK… ah! A 1RK. Room, kitchen, and the kitchen is also the room.']] },
      { id: 'drummer', name: 'Gig-night Gautam', title: 'Band manager, 12th Main', look: { ...STUDENT, shirt: '#2b2b30', hairStyle: 'long' }, color: '#2b2b30', pitch: 1.0, at: 'spot:toit', offset: [10, 10], fallback: [-30, -590], idle: 'dance',
        chatter: [['Tonight: indie folk-rock-fusion-lofi. Genre? Bengaluru.'], ['We have played every pub on 12th Main. Some of them even paid us.']] },
      { id: 'pradeep2', name: 'Placard Pradeep', title: 'Still looking for a 2BHK', look: TECHIE, color: '#5aa9e6', pitch: 1.0, at: 'spot:defence', offset: [0, 0], fallback: [360, -240], pose: 'cheer',
        chatter: [['Day 214 of looking for a 2BHK in Indiranagar. The landlord asked for my horoscope.']] },
    ],
    quests: [
      { id: 'in_flat', title: 'The 2BHK Hunt', giver: 'broker', coins: 130, phrase: 'gottilla', summary: 'Survive three landlord interviews',
        async run(q) {
          await q.say('broker', 'Looking for a flat in Indiranagar? Ha ha. Ha. OK. I have three. Each landlord will interview you. Be your best self. Or someone else\'s.');
          q.done();
          const P = q.pos();
          const flats = [
            { who: 'Landlord Lakshman', look: UNCLE, qs: [
              ['Veg or non-veg?', ['Pure veg, sir', 'Non-veg', 'Eggitarian (it\'s complicated)'], [2, 0, 1]],
              ['Deposit is 10 months. Cash. Today.', ['Of course!', 'Can we do 3?', 'Do you take kidneys?'], [2, 0, 1]],
            ], verdict: ['Very good. But I prefer families. You are not a family. Next.', 'Come with your parents. Grandparents also. Next.'] },
            { who: 'Landlady Leela', look: AUNTY, qs: [
              ['Send your LinkedIn and a 500-word essay on "Why Indiranagar".', ['Already written', 'Can I send a meme?', 'What is LinkedIn?'], [2, 1, 0]],
              ['Visitors after 9 PM?', ['Never', 'Sometimes', 'I have friends, yes'], [2, 1, 0]],
            ], verdict: ['Your essay was 498 words. Rejected.', 'You smiled too much in your profile photo. Suspicious.'] },
            { who: 'Landlord Lokesh', look: { ...UNCLE, hairStyle: 'short', shirt: '#f2c14e' }, qs: [
              ['Rent ₹62,000. Maintenance ₹8,000. "Lift charges" ₹2,000 (no lift).', ['Sounds fair', 'There is no lift', 'Adjust maadi, sir?'], [2, 0, 3]],
              ['Pets?', ['None', 'A cat', 'Only my startup'], [2, 0, 3]],
            ], verdict: ['Ok ok. You said "adjust maadi". You are one of us. Flat is yours. Rent increases 15% every year. Welcome home!'] },
          ];
          for (let i = 0; i < flats.length; i++) {
            const f = flats[i];
            const a = i * 2.1 + 0.4;
            const [x, z] = q.near(P.x + Math.cos(a) * (110 + i * 40), P.z + Math.sin(a) * (110 + i * 40), 12);
            const n = q.spawn({ id: 'll' + i, name: f.who, look: f.look, x, z, temp: true, silent: true });
            await q.goto(x, z, { r: 4, text: `Flat ${i + 1}: meet ${f.who}`, icon: '🏠' });
            n.face(q.pos().x, q.pos().z);
            let score = 0;
            for (const [qq, opts, pts] of f.qs) score += pts[await q.choose({ name: f.who, color: '#c0392b' }, qq, opts)];
            if (i < 2) await q.say({ name: f.who, color: '#c0392b' }, f.verdict[score % f.verdict.length]);
            else await q.say({ name: f.who, color: '#c0392b' }, f.verdict[0]);
            q.done();
          }
          q.big('FLAT FOUND!', '1BHK · ₹62,000 · View of a wall', 3000);
          await q.wait(2);
          const b = q.npc('broker');
          await q.goto(b.pos.x, b.pos.z, { r: 4, text: 'Tell Broker Babu' });
          await q.say('broker', 'Congratulations! Now, my brokerage: two months rent. What? I said "no brokerage". The asterisk said otherwise.');
          await q.say('broker', 'When the landlord asks anything you cannot answer, say "Gottilla" — I don\'t know. Works every time.', 'ಗೊತ್ತಿಲ್ಲ');
        } },
      { id: 'in_gig', title: 'Gig Night on 12th Main', giver: 'drummer', coins: 110, phrase: 'super', summary: 'Find the band before the gig',
        async run(q) {
          await q.say('drummer', 'Gig in 3 minutes and my band has vanished. Drummer, guitarist, singer. Classic Indiranagar Friday.');
          await q.say('drummer', 'Drummer is always in a cafe. Guitarist went to "check something" on a rooftop. Singer is stuck in traffic somewhere close.');
          q.done();
          const P = q.pos();
          const roof = q.game.city.buildings.filter((b) => b.h > 8 && b.h < 18 && Math.hypot(b.c[0] - P.x, b.c[1] - P.z) < 220 && b.area > 150)[0];
          const cafe = q.poi(/cafe|coffee|bakery/i, [P.x + 120, P.z - 60]);
          const pts = [q.near(cafe[0], cafe[1], 8), roof ? [roof.c[0], roof.c[1], roof.h + 1.2] : [P.x - 90, P.z + 70], q.near(P.x + 160, P.z + 130, 10)];
          await q.collect(pts, { text: 'Find the band members (one is on a rooftop — climb!)', icon: '🎸', time: 200, failText: 'Gig cancelled. The audience went to another pub. There are 40 on this street.' });
          const d = q.npc('drummer');
          await q.goto(d.pos.x, d.pos.z, { r: 5, text: 'Get back to the venue', time: 90 });
          q.big('ROCK ON, INDIRANAGAR!', '', 2400);
          q.game.player.avatar.play('dance', 4);
          await q.wait(3);
          await q.say('drummer', 'SUPER, MAGA! The crowd loved it. Mainly because there was a free shot of filter coffee.', 'ಸೂಪರ್, ಮಗಾ!');
        } },
    ],
    cards: [{ phrase: 'gottilla' }, { phrase: 'super' }, { phrase: 'oota' }, { phrase: 'hogi' }],
  },

  // ======================================================================= BASAVANAGUDI
  basavanagudi: {
    npcs: [
      { id: 'seenappa', name: 'Seenappa', title: 'Waiter, Vidyarthi Bhavan', look: WAITER, color: '#8a2b1e', pitch: 0.9, at: 'spot:vidyarthi', offset: [8, 6], fallback: [-590, 230], idle: 'namaste',
        chatter: [['I carry 18 plates of dose on one arm. My physiotherapist carries 19. Competition.'], ['Masala dose, khara bath, kesari bath, coffee. That is the whole menu. Since 1943. Perfect things do not change.']] },
      { id: 'priest', name: 'Archak Acharya', title: 'Bull Temple', look: { ...UNCLE, shirt: '#f7f3e8', extras: ['veshti'] }, color: '#c9a64b', pitch: 0.85, at: 'spot:bullTemple', offset: [6, 4], fallback: [-870, 580], idle: 'namaste',
        chatter: [['Our Nandi is carved from one single rock. Still growing, they say. Like rents.'], ['Kadalekai Parishe in November: the groundnut fair. Farmers offer their first crop to Basavanna.']] },
      { id: 'gardener', name: 'Gardener Gangamma', title: 'Lalbagh', look: AUNTY, color: '#2f6f4e', pitch: 1.1, at: 'spot:glassHouse', offset: [0, 6], fallback: [1030, -260], idle: 'point',
        chatter: [['Lalbagh: 240 acres, 1,800 species, and one man doing yoga loudly every morning.'], ['The rock here is 3,000 million years old. Older than the Pink Line deadline.']] },
    ],
    quests: [
      { id: 'ba_dose', title: 'Benne Dose Balance', giver: 'seenappa', coins: 120, phrase: 'oota', summary: 'Carry a tower of dose plates without dropping them',
        async run(q) {
          await q.say('seenappa', 'Rush hour! Sunday morning, the queue goes to the next street. I need help serving.');
          await q.say('seenappa', 'Carry this stack of dose plates to three tables. Walk smoothly. No running, no sudden turns. Respect the dose.');
          q.done();
          const res = await q.minigame('dosa', { tables: 3 });
          if (!res) q.fail('All the plates fell. The crows are very happy.');
          await q.say('seenappa', `You served ${res} plates! Customers are asking for you by name. I am a little jealous.`);
          await q.say('seenappa', 'In Bengaluru we do not say hello. We say "Oota aayta?" — had your meal? Correct answer is always "Aaytu!"', 'ಊಟ ಆಯ್ತಾ?');
        } },
      { id: 'ba_parishe', title: 'Kadalekai Parishe', giver: 'priest', coins: 100, phrase: 'namaskara', summary: 'Collect groundnuts for the groundnut fair offering',
        async run(q) {
          await q.say('priest', 'Long ago a bull ate all the groundnut crops here. The farmers prayed, and the bull became stone: our Nandi. Every year we offer the first groundnuts.');
          await q.say('priest', 'The crows have scattered the offering around Bugle Rock and the temple. Gather 12 handfuls before the evening aarti.');
          q.done();
          const c = sp(q, 'nandi', [-897, 580]);
          const pts = [];
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2, d = 25 + (i % 4) * 22;
            pts.push(q.near(c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d, 6));
          }
          await q.collect(pts, { text: 'Gather groundnuts (kadlekai)', icon: '🥜', color: '#c9a064', label: 'KADLEKAI!', time: 180, failText: 'The crows won. They always do.' });
          await q.goto(c[0] + 6, c[1], { r: 5, text: 'Offer them at the Nandi' });
          q.game.player.avatar.play('namaste', 2.5);
          q.big('OFFERING MADE', 'The Nandi approves (he did not move. He never moves.)', 3000);
          await q.wait(2.5);
          await q.say('priest', 'Blessings! May your rent never increase and your auto always say yes.');
        } },
    ],
    cards: [{ phrase: 'oota' }, { phrase: 'namaskara' }, { phrase: 'hogi' }, { phrase: 'coffee' }],
  },

  // ======================================================================= BELLANDUR
  bellandur: {
    npcs: [
      { id: 'dr_lake', name: 'Dr. Kere Kavitha', title: 'Lake scientist', look: SCIENTIST, color: '#2f6fd1', pitch: 1.1, at: 'spot:lakeShore', offset: [0, 0], fallback: [-200, 230], idle: 'point',
        chatter: [['The foam is a mix of detergent, sewage and bad decisions. In 2099 it became… self-aware.'], ['Bellandur used to be the biggest lake in the city. It still is. It just has extra layers now.']] },
      { id: 'orr_techie', name: 'ORR Oviya', title: 'Commutes on the Outer Ring Road', look: TECHIE2, color: '#e75a7c', pitch: 1.15, at: 'spot:flyover', offset: [-40, 30], fallback: [700, 450], idle: 'phone',
        chatter: [['My office is 4 km away. I leave at 8. I reach at 10. I have read 70 books in traffic this year.'], ['When it rains, the Outer Ring Road becomes the Outer Ring River. We have boats now. Hover boats.']] },
    ],
    quests: [
      { id: 'be_foam', title: 'The Foam Awakens', giver: 'dr_lake', coins: 200, phrase: 'weather', summary: 'Defeat the sentient foam of Bellandur Lake',
        async run(q) {
          await q.say('dr_lake', 'Stay back! The foam has gained consciousness. It has opinions. It wants the Outer Ring Road.');
          await q.say('dr_lake', 'Take this Clean-up Cannon. Aim at the foam and click (or tap ✋). Hit its blobs before they splat you.');
          const i = await q.choose('dr_lake', 'Ready?', ['Let\'s clean this lake!', 'Is this covered by insurance?']);
          if (i === 1) await q.say('dr_lake', 'Insurance covers "acts of God". This is an act of detergent. So, no.');
          q.done();
          const ok = await q.minigame('foam', {});
          if (!ok) q.fail('Splat. You are now 40% foam. Shower and try again.');
          await q.say('dr_lake', 'You did it! The foam has retreated to… a smaller foam. Science is incremental.');
          await q.say('dr_lake', 'Look at that sky. "Bengaluru weather, ayyo!" — say it with a sigh of pride.', 'ಬೆಂಗಳೂರು weather, ಅಯ್ಯೋ!');
        } },
      { id: 'be_orr', title: 'ORR Express', giver: 'orr_techie', coins: 90, summary: 'Get Oviya from Ecospace to Ecoworld before her meeting',
        async run(q) {
          await q.say('orr_techie', 'Meeting at Ecoworld in 90 seconds and I am at Ecospace. On the ORR that is… two business days.');
          await q.say('orr_techie', 'Ride there for me and show my badge at the gate. The security guard trusts badges more than faces.');
          q.done();
          const a = sp(q, 'ecospace', [1215, 687]), b = sp(q, 'ecoworld', [1761, 599]);
          const pa = q.near(a[0], a[1], 30), pb = q.near(b[0], b[1], 30);
          await q.goto(pa[0], pa[1], { r: 10, text: 'Collect the badge at the Ecospace gate', icon: '🪪' });
          await q.goto(pb[0], pb[1], { r: 10, text: 'Ride to the Ecoworld gate', time: 90, failText: 'Meeting started without her. They made her the "action item owner".', icon: '🏢' });
          q.big('MEETING SAVED', 'It could have been an email.', 2600);
          await q.wait(2);
        } },
    ],
    cards: [{ phrase: 'weather' }, { phrase: 'traffic' }, { phrase: 'nimsha' }],
  },

  // ======================================================================= MAJESTIC
  majestic: {
    npcs: [
      { id: 'tourist', name: 'Lost Lakshmi', title: 'First day in Bengaluru', look: { ...AUNTY, shirt: '#f2c14e', extras: ['saree', 'bindi', 'backpack'] }, color: '#e2b51a', pitch: 1.15, at: 'spot:kbs', offset: [10, 30], fallback: [-60, -540], idle: 'shrug',
        chatter: [['So many buses! How does anyone know which one? … By asking 14 people, I suppose.'], ['My son said "take the metro". The metro took me to Majestic. Majestic took my sanity.']] },
      { id: 'coolie', name: 'Coolie Krishna', title: 'Badge 1123, KSR', look: { ...AUTO, shirt: '#c0392b', shirtStyle: 'shirt', extras: ['mustache'] }, color: '#c0392b', pitch: 0.85, at: 'spot:ksr', offset: [60, 20], fallback: [-400, -420], idle: 'wobble',
        chatter: [['Everyone in Bengaluru came through Majestic once. Some of them are still looking for the exit.'], ['Platform 7? Go straight, left, right, up, down, ask again.']] },
    ],
    quests: [
      { id: 'ma_bus', title: 'Which Bus?', giver: 'tourist', coins: 100, phrase: 'meter', summary: 'Find bus 500-D for Lakshmi among a hundred buses',
        async run(q) {
          await q.say('tourist', 'Excuse me! I need bus 500-D to go to my son in Whitefield. He works in "IT". I don\'t know what that means but he pays for my phone.');
          q.done();
          const routes = q.game.city.busRoutes || [];
          if (!routes.length) { await q.say('tourist', 'Oh, the buses all left. Bengaluru!'); return; }
          // make sure exactly one 500-D exists
          const target = routes[Math.floor(Math.random() * routes.length)];
          routes.forEach((r) => { if (r !== target && r.no === '500-D') r.no = '500-K'; });
          target.no = '500-D';
          const tags = routes.map((r) => q.game.labels.add(r.no, () => ({ x: r.x, y: 4.2, z: r.z, clone() { return this; } }), { cls: 'tag', maxDist: 45 }));
          q.cleanup.push(() => tags.forEach((t) => t.remove()));
          const t0 = performance.now();
          let hinted = false;
          await q.until(() => {
            if (!hinted && performance.now() - t0 > 45000) {
              hinted = true;
              q.toast('Lakshmi aunty: "Wait, the conductor waved from that side!" (marker added)', 4000);
              q.qs.target = { x: target.x, z: target.z, icon: '🚌' };
            }
            return Math.hypot(q.pos().x - target.x, q.pos().z - target.z) < 7;
          }, { time: 240, failText: '500-D left. Next one in 40 minutes. Or 4.' });
          q.qs.target = null;
          q.big('500-D FOUND!', 'Kempegowda Bus Station, bay 23', 2600);
          const t = q.npc('tourist');
          await q.goto(t.pos.x, t.pos.z, { r: 5, text: 'Bring Lakshmi aunty the good news' });
          await q.say('tourist', 'Thank you, kanna! If the bus doesn\'t come, I will take an auto. How do I talk to the auto man?');
          await q.say('tourist', '"Meter haaki, anna" — put the meter, brother. Say it firmly. Then pay meter-mele-fifty anyway.', 'ಮೀಟರ್ ಹಾಕಿ, ಅಣ್ಣ');
        } },
      { id: 'ma_train', title: 'Platform Panic', giver: 'coolie', coins: 90, summary: 'Get a suitcase to the train before it leaves',
        async run(q) {
          await q.say('coolie', 'Saar! A passenger forgot his suitcase at the bus stand and his train leaves KSR in 75 seconds. I am 63 years old. You are not.');
          q.done();
          const k = sp(q, 'kbs', [-78, -570]);
          const t = sp(q, 'ksr', [-480, -450]);
          await q.goto(k[0] + 30, k[1] - 10, { r: 6, text: 'Grab the suitcase at the bus stand', icon: '🧳' });
          await q.goto(t[0] + 20, t[1], { r: 10, text: 'Run it to the train at KSR', time: 75, failText: 'The train left. The suitcase now lives at Majestic. Like everyone.', icon: '🚆' });
          q.big('MADE IT!', 'The train was also late. Of course it was.', 2600);
          await q.wait(2);
        } },
    ],
    cards: [{ phrase: 'meter' }, { phrase: 'bega' }, { phrase: 'hogi' }],
  },

  // ======================================================================= MALLESHWARAM
  malleshwaram: {
    npcs: [
      { id: 'ctr', name: 'CTR Chandrashekar', title: 'Queue manager since 1980', look: WAITER, color: '#2f6f4e', pitch: 0.85, at: 'spot:ctr', offset: [6, 8], fallback: [-40, 300], idle: 'point',
        chatter: [['The benne masala dose is crisp outside, soft inside, butter everywhere. The queue is the seasoning.'], ['No, we do not take reservations. We take patience.']] },
      { id: 'veena', name: 'Veena Stores Venkatesh', title: 'Idli expert', look: UNCLE, color: '#f2c14e', pitch: 0.9, at: 'spot:veena', offset: [6, 4], fallback: [-70, -500], idle: 'namaste',
        chatter: [['Idli so soft you can sleep on it. Chutney so good you will forget your ex.'], ['Eat standing. Sitting is for people with time.']] },
    ],
    quests: [
      { id: 'ml_queue', title: 'The CTR Queue', giver: 'ctr', coins: 110, phrase: 'adjust', summary: 'Survive the legendary queue for a benne masala dose',
        async run(q) {
          await q.say('ctr', 'You want a benne masala dose? Join the queue. It moves. Slowly. Like tectonic plates.');
          q.done();
          const c = sp(q, 'ctr', [-55, 303]);
          const people = [];
          for (let i = 0; i < 6; i++) {
            const [x, z] = q.near(c[0] + 6 + i * 1.3, c[1] + 10, 2);
            people.push(q.spawn({ id: 'qp' + i, name: ['Uncle 1', 'Techie', 'Aunty', 'Student', 'Uncle 2', 'Tourist'][i], look: [UNCLE, TECHIE, AUNTY, STUDENT, UNCLE, TECHIE2][i], x, z, temp: true, silent: true, idle: 'phone' }));
          }
          const [qx, qz] = q.near(c[0] + 6 + 6 * 1.3 + 1, c[1] + 10, 2);
          await q.goto(qx, qz, { r: 2.5, text: 'Join the end of the queue', icon: '🧍' });
          const events = [
            ['A man walks straight to the front.', 'Uncle, line illa?', 'Swalpa adjust maadi', 'Let it go'],
            ['Someone asks if you are "in the queue or just standing".', 'Queue, obviously', 'Just standing (for 40 minutes)', 'Philosophically, both'],
            ['A techie asks you to "hold his spot for 2 minutes".', 'Sure!', 'No way', '2 Bengaluru minutes or real minutes?'],
          ];
          let patience = 3;
          for (const [ev, a, b, c2] of events) {
            await q.wait(3);
            q.toast(ev, 3000);
            const i = await q.choose({ name: 'The Queue', color: '#2f6f4e' }, ev, [a, b, c2]);
            if (i === 1 && ev.startsWith('A man')) { await q.say({ name: 'Line-cutter', color: '#7d8a83' }, '*adjusts to the back of the line* …Sorry, sorry.'); }
            else if (i === 2) { await q.say({ name: 'The Queue', color: '#2f6f4e' }, '*everyone nods wisely*'); }
            else patience--;
            q.done();
            people.shift()?.walkTo([[c[0] - 4, c[1] - 6]]);
          }
          if (patience <= 0) q.fail('You lost patience and went to a cafe. The dose will never forgive you.');
          await q.wait(2);
          q.big('BENNE MASALA DOSE!', 'Crisp. Buttery. Worth every minute.', 3200);
          q.game.player.avatar.play('cheer', 2);
          await q.wait(2.5);
          await q.say('ctr', 'See? The queue is a test. You passed. "Swalpa adjust maadi" — you know this already. Now you mean it.');
        } },
    ],
    cards: [{ phrase: 'coffee' }, { phrase: 'oota' }, { phrase: 'namaskara' }],
  },

  // ======================================================================= ELECTRONIC CITY
  ecity: {
    npcs: [
      { id: 'security', name: 'Security Shivanna', title: 'Gate 6', look: COP, color: '#1f4e8c', pitch: 0.85, at: 'spot:gate', offset: [8, 8], fallback: [330, -330], idle: 'point',
        chatter: [['Badge?'], ['Laptop declaration?'], ['Badge AND laptop declaration?']] },
      { id: 'fresher', name: 'Fresher Fathima', title: 'Day 1, batch 2099-B', look: { ...STUDENT, hairStyle: 'ponytail', shirt: '#ffffff', shirtStyle: 'shirt', extras: ['lanyard', 'backpack'] }, color: '#3fb3a6', pitch: 1.2, at: 'spot:pyramid', offset: [10, 10], fallback: [110, 190], idle: 'typing',
        chatter: [['Training starts at 9. I came at 6. My bus came at 5. I live in the bus now.'], ['They said "campus". They did not say it is bigger than my hometown.']] },
    ],
    quests: [
      { id: 'ec_badge', title: 'Day One', giver: 'fresher', coins: 100, summary: 'Help a fresher get badge, laptop and lunch before training starts',
        async run(q) {
          await q.say('fresher', 'Hi! It\'s my first day. I need: my badge from Gate 6, a laptop declaration, and lunch. Training starts in 3 minutes!');
          q.done();
          const g = sp(q, 'gate', [326, -340]);
          const bus = sp(q, 'busStation', [222, -346]);
          const P = q.pos();
          await q.collect([q.near(g[0] + 4, g[1] + 4, 4), q.near(bus[0], bus[1] + 20, 6), q.near(P.x - 120, P.z + 80, 10)], { text: 'Collect badge, declaration form and a lunch box', icon: '🪪', time: 200, failText: 'Training started. She is now "under observation" for 6 months.' });
          const f = q.npc('fresher');
          await q.goto(f.pos.x, f.pos.z, { r: 4, text: 'Back to Fathima at the pyramid', time: 120 });
          await q.say('fresher', 'Badge! Form! Curd rice! I am officially an employee. Next goal: retire.');
        } },
      { id: 'ec_race', title: 'Campus Shuttle Race', giver: 'security', repeat: true, summary: 'Race the campus shuttle on your hover scooter',
        async run(q) {
          const i = await q.choose('security', 'Shuttle race? Unofficial. Very unofficial. Everyone nearby can join.', ['Race!', 'No, I have a badge to protect']);
          if (i === 1) return;
          q.done();
          await q.minigame('race');
        } },
    ],
    cards: [{ phrase: 'nimsha' }, { phrase: 'traffic' }, { phrase: 'gottilla' }],
  },

  // ======================================================================= WHITEFIELD
  whitefield: {
    npcs: [
      { id: 'wf_commuter', name: 'Commuter Kiran', title: 'Purple Line regular', look: TECHIE, color: '#8e5bb5', pitch: 1.0, at: 'spot:itpl', offset: [20, 20], fallback: [150, 230], idle: 'phone',
        chatter: [['Since the metro reached Whitefield, my commute is 1 hour. Before it was 2. I have so much free time I started a podcast.'], ['Whitefield: half tech park, half forest, all traffic.']] },
    ],
    quests: [
      { id: 'wf_metro', title: 'Last Metro', giver: 'wf_commuter', coins: 100, phrase: 'hogi', summary: 'Catch the last Purple Line train at Kadugodi',
        async run(q) {
          await q.say('wf_commuter', 'Last metro to MG Road leaves Kadugodi in 2 minutes! If I miss it I have to take an auto. Do you know what an auto costs from Whitefield? A kidney. Two kidneys after 10 PM.');
          q.done();
          const k = sp(q, 'kadugodi', [1140, 149]);
          const [x, z] = q.near(k[0], k[1] + 15, 15);
          await q.goto(x, z, { r: 12, text: 'Get to Kadugodi metro station', time: 130, failText: 'Missed it. The auto said "₹900, saar. Meter? What meter?"', icon: '🚇' });
          q.big('ON THE LAST METRO!', 'Doors closing. Please stand clear.', 2600);
          await q.wait(2);
          await q.say('wf_commuter', '*panting* Made it! When you leave somewhere here, say "Hogi banni" — go and come back. We always come back. Rent is paid.', 'ಹೋಗಿ ಬನ್ನಿ');
        } },
    ],
    cards: [{ phrase: 'hogi' }, { phrase: 'guru' }, { phrase: 'super' }],
  },
};
