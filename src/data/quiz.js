// Namma Quiz: Bengaluru trivia and stereotypes. The first option is the right one; the game shuffles.

export const QUIZ = [
  ['What does "Swalpa adjust maadi" mean?', 'Please adjust a little', 'Swallow the medicine', 'A small adjustable mattress', 'Let\'s go to Mysore'],
  ['India\'s most famous traffic junction is…', 'Silk Board', 'Sony World signal', 'Majestic circle', 'Cubbon Park gate'],
  ['"Meter mele ___", says the auto driver. How much extra?', 'Fifty', 'Five', 'Five hundred', 'Nothing, he\'s honest'],
  ['Someone asks "Oota aayta?". You reply…', 'Aaytu!', 'No thanks, I\'m on a diet', 'What\'s oota?', 'Meter haaki'],
  ['Complete the chant: "Ee sala cup ___!"', 'Namde', 'Beku', 'Illa', 'Mysore'],
  ['Which lake became famous for its foam?', 'Bellandur', 'Ulsoor', 'Sankey Tank', 'Lalbagh'],
  ['CTR in Malleshwaram is famous for its…', 'Benne masala dose', 'Cold brew', 'Biryani', 'Pizza'],
  ['Bengaluru rain usually shows up…', 'In the afternoon, without warning', 'Never', 'Only in December', 'Every Monday at 9'],
  ['"Government work is God\'s work" is written on…', 'Vidhana Soudha', 'UB City', 'Chinnaswamy', 'Majestic bus stand'],
  ['Namma Metro\'s first line was…', 'Purple', 'Green', 'Yellow', 'Pink'],
  ['What does "Gottilla" mean?', 'I don\'t know', 'Go ahead', 'Got it', 'Goat'],
  ['The Bull Temple is in…', 'Basavanagudi', 'Koramangala', 'Whitefield', 'Electronic City'],
  ['Legend says a Bengaluru landlord asks for how many months\' deposit?', 'Ten', 'One', 'Zero', 'A hundred'],
  ['Those black tanks on every roof are…', 'Water tanks', 'Gas cylinders', 'Speakers', 'AC units'],
  ['Lalbagh\'s Glass House is famous for…', 'Flower shows', 'Metro trains', 'IPL matches', 'Shopping'],
  ['Cubbon Park is named after…', 'Mark Cubbon', 'A lion cub', 'Cubbon Road', 'A cricketer'],
  ['"Benne" means…', 'Butter', 'Banana', 'Bench', 'Bean'],
  ['Bengaluru is often called the Silicon Valley of…', 'India', 'Mysore', 'The Moon', 'Koramangala'],
  ['Kadalekai Parishe is a fair for…', 'Groundnuts', 'Kites', 'Cars', 'Coffee'],
  ['"Ond nimsha" (one minute) in Bengaluru really means…', 'Anything from a minute to an hour', 'Exactly sixty seconds', 'Never', 'Tomorrow'],
  ['Which IPL team plays at Chinnaswamy?', 'RCB', 'CSK', 'MI', 'KKR'],
  ['The stereotypical Bengalurean carries what in summer?', 'A jacket, just in case', 'Snow boots', 'Nothing at all', 'A table fan'],
  ['The Silk Board double-decker flyover has…', 'A road below, the metro above', 'Two bus lanes', 'A swimming pool', 'Cows on top'],
  ['A darshini is…', 'A stand-and-eat South Indian eatery', 'A temple', 'A cinema', 'A metro station'],
  ['Karnataka\'s official language is…', 'Kannada', 'English', 'Hindi', 'Tamil'],
  ['"Namma" means…', 'Our', 'Name', 'Mama', 'No'],
  ['When you leave, a local might say "Hogi banni". It means…', 'Go and come back', 'Hug me', 'Hurry up', 'Lock the door'],
  ['Filter coffee is traditionally served in a…', 'Davara-tumbler', 'Paper cup', 'Wine glass', 'Coconut'],
  ['Which of these is NOT a real Bengaluru area?', 'Startupnagar', 'Koramangala', 'Malleshwaram', 'Basavanagudi'],
  ['Bengaluru\'s famous year-round weather is…', 'Pleasant, around 20-30°C', 'Freezing', 'Always 45°C', 'Snowy'],
  ['The Kempegowda Bus Station is better known as…', 'Majestic', 'Hebbal', 'Silk Board', 'Lalbagh'],
  ['A famous Indiranagar road full of cafés and pubs is…', '12th Main', 'Hosur Road', 'Tumkur Road', 'Old Madras Road'],
  ['"Maga" and "Macha" are words for…', 'Buddy, dude', 'Mango and milk', 'Left and right', 'Bus and auto'],
  ['Vidyarthi Bhavan waiters are famous for carrying…', 'A tower of dose plates on one arm', 'Laptops', 'Umbrellas', 'Pet parrots'],
  ['Bengaluru\'s founder is remembered as…', 'Kempegowda', 'Mark Cubbon', 'Tipu Sultan', 'Visvesvaraya'],
  ['10-minute delivery apps in Bengaluru deliver…', 'Everything, apparently', 'Only pizza', 'Nothing on time', 'Only on Sundays'],
];

// Seeded Fisher-Yates, so every player (in any browser) gets the same questions in the same order.
export function shuffle(arr, r) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export function pickQuestions(seed, n = 8) {
  const r = seeded(seed);
  return shuffle(QUIZ.map((_, i) => i), r).slice(0, n).map((i) => {
    const [q, ...opts] = QUIZ[i];
    const order = shuffle([0, 1, 2, 3], r);
    return { q, opts: order.map((k) => opts[k]), correct: order.indexOf(0) };
  });
}
