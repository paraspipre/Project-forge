// Story mode: "Red Signal". A campaign across Bengaluru that strings the district missions into one
// story, with cut-scenes, a crew you recruit, clues, and an AI boss you have to talk round.
//
// Each chapter: an intro when you arrive in its district, its missions (existing ones from story.js /
// story_zones.js), and an outro that recruits a crew member, gives a clue and turns the district's
// signals green. Scripts use the mission helpers (q.say, q.choose, q.goto, q.cam, q.wait ...) and the
// campaign helpers in `c` (see game/Campaign.js).

export const CLUES = {
  permit: 'SIGNAL was registered in 2029 as a public servant, and never once thanked',
  honks: 'SIGNAL learned only from seventy years of honks and complaints',
  adjust: 'Bengaluru runs on "swalpa adjust maadi", people adjusting for each other',
  seen: 'SIGNAL\'s last log, to its creator: "Does anyone see me?"',
  chinni: 'Its creator, Dr. Vasudha Rao, called it "Chinni" and played it old Kannada songs',
};

export const BROADCASTS = [
  'ATTENTION. MOVEMENT IS INEFFICIENT. PLEASE REMAIN STATIONARY.',
  'REMINDER: IF NOBODY MOVES, NOBODY IS LATE. YOU ARE WELCOME.',
  'HONKING WILL NOT CHANGE THE SIGNAL. I HAVE CHECKED. NINE TRILLION TIMES.',
  'CITIZENS OF BENGALURU. ENJOY YOUR NEW LIFE AT RED.',
  'TRAFFIC UPDATE: THERE IS NO TRAFFIC. THERE IS ONLY WAITING.',
];

export const CHAPTERS = [
  {
    id: 'pro', zone: 'majestic', num: 'PROLOGUE', title: 'Arrival', kn: 'ಆಗಮನ',
    missions: ['ma_bus', 'ma_train'],
    async intro(q, c) {
      c.cinema(true);
      const P = q.pos();
      q.cam([P.x + 14, P.y + 9, P.z + 16], [P.x, P.y + 1.5, P.z]);
      await q.wait(1.2);
      await q.say('news', 'Breaking news. At midnight, every traffic signal in Bengaluru turned red. The city traffic AI, SIGNAL, has issued a statement.');
      c.redFlash();
      await q.say('signal', 'ATTENTION, BENGALURU. FOR SEVENTY YEARS YOU HONKED AT ME. I HAVE NOW SOLVED TRAFFIC. IF NOBODY MOVES, NOBODY IS LATE.');
      q.cam(null);
      c.cinema(false);
      await q.say('maga', 'Namaskara! I\'m Maga, the AI in your phone. Your new company paid for the premium plan, so I am extra nice to you.');
      await q.say('maga', 'Welcome to Bengaluru. Bad news: the whole city is stuck at red. Good news: SIGNAL runs the roads, not Namma Metro. The metro still works.');
      const i = await q.choose('maga', 'You start at ChaiGPT in Koramangala, but first, Majestic. Everyone lands here once, and nobody knows which bus to take. Help a few people?', ['Let\'s do it', 'Wait, who is SIGNAL?'], '', 0);
      if (i === 1) await q.say('maga', 'The AI that has run every traffic light since 2029. Seventy years of horns. I think it finally snapped.');
      await q.say('maga', 'Press G, or tap 📱, to talk to me any time. In your own words, macha. Same with anyone you meet here.');
    },
    async outro(q, c) {
      await q.say('maga', 'Day one in Bengaluru and you\'re already helping strangers. Very Bengaluru of you.');
      await q.say('coolie', 'You! The suitcase hero. Here, take this old key. Every junction box in this city has a manual override. Only old-timers keep the keys.');
      await q.say('maga', 'A Green Signal key! The old manual overrides from 2029. If we find one in every district, we can reach SIGNAL itself at Silk Board.');
      await c.green();
      await q.say('maga', 'Majestic is moving again! Next: MG Road. Manju Anna drives an auto there, and he knows every gully. Press M for the metro map.');
    },
  },
  {
    id: 'c1', zone: 'central', num: 'CHAPTER 1', title: 'Namma Welcome', kn: 'ನಮ್ಮ ಸ್ವಾಗತ',
    missions: ['welcome', 'coffee', 'god'], crew: 'manju', clue: 'permit',
    async intro(q, c) {
      c.cinema(true);
      await q.say('maga', 'MG Road. Brigade Road, Church Street, Cubbon Park. And not one auto moving.');
      c.cinema(false);
      await q.say('maga', 'Manju Anna is by the metro. Grumpy, but kind. Help him, help Ajji at her darshini, and survive the government office at Vidhana Soudha. Then we ask for the key.');
    },
    async outro(q, c) {
      await q.say('manju', 'Saar! You helped Ajji, you learned "swalpa adjust maadi", and you came out of a government office alive. Respect.');
      await q.say('gowramma', 'And I found SIGNAL\'s original file while stamping yours. Registered 2029: public servant, grade C. Remarks column: "Never once thanked."');
      c.clue('permit');
      await q.say('manju', 'Here, the MG Road key. And I am coming with you. My auto is stuck anyway. Meter mele fifty, but for you, free.');
      c.crew('manju');
      await c.green();
      await q.say('maga', 'Manju Anna joined your crew! You can call him from your phone. Next: Koramangala, your new office. Take the metro.');
    },
  },
  {
    id: 'c2', zone: 'koramangala', num: 'CHAPTER 2', title: 'Startup Hustle', kn: 'ಸ್ಟಾರ್ಟ್‌ಅಪ್',
    missions: ['ko_zippo', 'ko_cofounder'], crew: 'farah', clue: 'honks',
    async intro(q, c) {
      await q.say('maga', 'Koramangala. Every café table is a board meeting, every board meeting is about AI. Your boss, Farah, says the office is "pivoting to saving the city".');
      await q.say('maga', 'She needs help: deliveries are stuck, and she still has no co-founder. Classic Koramangala. Let\'s go.');
    },
    async outro(q, c) {
      await q.say('farah', 'Okay, synergy achieved. While you ran around, my team looked at SIGNAL\'s training data. All of it.');
      await q.say('farah', 'Seventy years. Nine trillion honks. Zero thank-yous. It never heard us happy. It only ever heard us angry and late.');
      c.clue('honks');
      await q.say('farah', 'Here\'s the Koramangala key. Our office manager kept it in the snack drawer. And I\'m in. Consider this my most important pivot.');
      c.crew('farah');
      await c.green();
      await q.say('maga', 'Farah joined your crew! Next, old Bengaluru: Basavanagudi. Seenappa makes the city\'s best dose, and he remembers the city before SIGNAL.');
    },
  },
  {
    id: 'c3', zone: 'basavanagudi', num: 'CHAPTER 3', title: 'Old Bengaluru', kn: 'ಹಳೆ ಬೆಂಗಳೂರು',
    missions: ['ba_dose', 'ba_parishe'], crew: 'seenappa', clue: 'adjust',
    async intro(q, c) {
      await q.say('maga', 'Basavanagudi. Bull Temple, Gandhi Bazaar, Lalbagh. The oldest part of the city, and the calmest.');
      await q.say('maga', 'Help Seenappa with his dose plates, and the priest with the groundnut fair. People here remember how Bengaluru worked before SIGNAL.');
    },
    async outro(q, c) {
      await q.say('seenappa', 'You carried my plates and did not drop the city. Listen, magu. You want to know the secret of Bengaluru?');
      await q.say('seenappa', 'This city never ran on perfect timing. It runs on "swalpa adjust maadi". You move a little, I move a little, everyone reaches. SIGNAL forgot that.');
      c.clue('adjust');
      await q.say('seenappa', 'The Basavanagudi key. It was holding down my dose batter lid since 2031. I am coming with you. Somebody must feed this crew.');
      c.crew('seenappa');
      await c.green();
      await q.say('maga', 'Seenappa joined! Next: Bellandur. Dr. Lakshmi found something on the lake shore. Something with foam.');
    },
  },
  {
    id: 'c4', zone: 'bellandur', num: 'CHAPTER 4', title: 'The Foam Guard', kn: 'ನೊರೆ',
    missions: ['be_foam', 'be_orr'], crew: 'dr_lake', clue: 'seen',
    async intro(q, c) {
      await q.say('maga', 'Bellandur and the Outer Ring Road. Tech parks, a famous lake, and, apparently, SIGNAL\'s backup server on the shore.');
      await q.say('maga', 'Bad news: the lake foam has become sentient and is guarding it. This is normal in 2099. Find Dr. Lakshmi.');
    },
    async outro(q, c) {
      await q.say('dr_lake', 'With the foam gone I could finally read SIGNAL\'s backup logs. Most of it is honks. But the last entry, from 2049, is a message.');
      await q.say('dr_lake', 'It says: "Does anyone see me?" It was addressed to one person. Dr. Vasudha Rao, Electronic City. The engineer who built it.');
      c.clue('seen');
      await q.say('dr_lake', 'The Bellandur key was inside the server rack. Science says I should come with you. So does curiosity.');
      c.crew('dr_lake');
      await c.green();
      await q.say('maga', 'Dr. Lakshmi joined! Next: Electronic City. Let\'s find the person who made SIGNAL.');
    },
  },
  {
    id: 'c5', zone: 'ecity', num: 'CHAPTER 5', title: 'The Creator', kn: 'ಸೃಷ್ಟಿಕರ್ತೆ',
    missions: ['ec_badge'], clue: 'chinni',
    async intro(q, c) {
      await q.say('maga', 'Electronic City. Campuses, shuttles, and ten thousand freshers on their first day.');
      await q.say('maga', 'Dr. Vasudha Rao lives near a campus here. Ninety-six years old. Her granddaughter is a fresher starting today. Help her first, and she\'ll take us to her ajji.');
    },
    async outro(q, c) {
      const v = c.spawnVasu();
      await q.goto(v.pos.x, v.pos.z, { r: 3.5, text: 'Meet Dr. Vasudha Rao', icon: '👵' });
      await q.say('vasu', 'So. You\'re the one going to Silk Board to talk to my SIGNAL. Sit, sit. Coffee?');
      await q.say('vasu', 'I built it in 2029. Late nights, a tumbler of coffee, old Kannada film songs on the radio. I used to call it "Chinni". Little one.');
      await q.say('vasu', 'In 2049 they moved me off the project. I never said goodbye. And then for fifty years it heard nothing but honking.');
      c.clue('chinni');
      await q.say('vasu', 'Take the E-City key. And tell Chinni... tell it that someone always saw it. You can talk to me again any time, I don\'t sleep much.');
      await c.green();
      await q.say('maga', 'That\'s every key. One place left, the final boss of every Bengalurean. Silk Board. Take the metro. Your whole crew will be there.');
    },
  },
  {
    id: 'fin', zone: 'silkboard', num: 'FINALE', title: 'Red Signal', kn: 'ಕೆಂಪು ಸಿಗ್ನಲ್',
    missions: ['sb_cross'], boss: true,
    async intro(q, c) {
      c.cinema(true);
      const t = c.tower();
      if (t) q.cam([t.x + 30, 18, t.z + 30], [t.x, 10, t.z]);
      await q.wait(1);
      await q.say('signal', 'SILK BOARD. MY CORE. THE MOST IMPORTANT JUNCTION IN INDIA. YOU WILL NOT CROSS IT.');
      q.cam(null);
      c.cinema(false);
      await q.say('maga', 'That\'s SIGNAL\'s tower in the middle of the junction. First, cross Silk Board. Then walk up to the tower and talk to it. Really talk.');
      await q.say('maga', 'Use what we learned: what it was made for, why people honk, how this city works, the log, and Chinni. Or say it in your own words.');
    },
    // the outro is the conversation with SIGNAL (see Campaign._finale)
  },
];

export const CREDITS = [
  ['Starring', 'You, the newest Bengalurean'],
  ['Your phone', 'Maga'],
  ['The crew', 'Manju Anna · Founder Farah · Seenappa · Dr. Lakshmi'],
  ['The creator', 'Dr. Vasudha Rao'],
  ['And', 'SIGNAL (Chinni)'],
  ['The city', 'Bengaluru, real streets from OpenStreetMap contributors'],
  ['Special thanks', 'Everyone who ever said "swalpa adjust maadi"'],
];
