// The playable districts. Each is a real slice of Bengaluru built from OpenStreetMap data
// (tools/zones.json has the bounding boxes). Spawn points are in zone-local metres.

export const ZONES = {
  central: {
    name: 'MG Road & Cubbon Park', kn: 'ಎಂ.ಜಿ. ರಸ್ತೆ', short: 'MG Road',
    spawn: [612, 92, Math.PI * 0.6], ll: [12.976, 77.601], bbox: [12.966, 77.588, 12.986, 77.614], jam: 0.25,
    blurb: 'Brigade Road, Church Street, Cubbon Park, Chinnaswamy and the Vidhana Soudha. Start here.',
  },
  indiranagar: {
    name: 'Indiranagar', kn: 'ಇಂದಿರಾನಗರ', short: 'Indiranagar',
    spawn: [-150, -470, Math.PI], ll: [12.974, 77.641], bbox: [12.964, 77.632, 12.984, 77.65], jam: 0.3,
    blurb: '100 Feet Road, 12th Main, breweries, and the hunt for a 2BHK.',
  },
  koramangala: {
    name: 'Koramangala', kn: 'ಕೋರಮಂಗಲ', short: 'Koramangala',
    spawn: [540, -300, -Math.PI / 2], ll: [12.934, 77.6225], bbox: [12.925, 77.61, 12.943, 77.635], jam: 0.35,
    blurb: 'Startup land. Every cafe table is a board meeting.',
  },
  silkboard: {
    name: 'Silk Board & HSR', kn: 'ಸಿಲ್ಕ್ ಬೋರ್ಡ್', short: 'Silk Board',
    spawn: [-380, 50, -2.2], ll: [12.917, 77.626], bbox: [12.908, 77.612, 12.926, 77.64], jam: 1.0,
    blurb: 'The most famous junction in India. Bring snacks.',
  },
  basavanagudi: {
    name: 'Basavanagudi & Lalbagh', kn: 'ಬಸವನಗುಡಿ', short: 'Basavanagudi',
    spawn: [-560, 240, Math.PI / 2], ll: [12.947, 77.577], bbox: [12.938, 77.564, 12.956, 77.59], jam: 0.2,
    blurb: 'Bull Temple, Gandhi Bazaar, benne dosa and Lalbagh.',
  },
  bellandur: {
    name: 'Bellandur & ORR', kn: 'ಬೆಳ್ಳಂದೂರು', short: 'Bellandur',
    spawn: [-180, 260, -Math.PI / 2], ll: [12.93, 77.67], bbox: [12.918, 77.655, 12.942, 77.685], jam: 0.6,
    blurb: 'Tech parks on the Outer Ring Road, and a lake that foams.',
  },
  majestic: {
    name: 'Majestic', kn: 'ಮೆಜೆಸ್ಟಿಕ್', short: 'Majestic',
    spawn: [-60, -520, Math.PI], ll: [12.972, 77.573], bbox: [12.96, 77.562, 12.984, 77.584], jam: 0.5,
    blurb: 'Bus stand, railway station and metro interchange. Everyone arrives here once.',
  },
  malleshwaram: {
    name: 'Malleshwaram', kn: 'ಮಲ್ಲೇಶ್ವರಂ', short: 'Malleshwaram',
    spawn: [-30, 280, Math.PI / 2], ll: [13.001, 77.57], bbox: [12.992, 77.56, 13.01, 77.58], jam: 0.2,
    blurb: 'Old Bengaluru: 8th Cross, filter coffee, CTR dosa queues.',
  },
  ecity: {
    name: 'Electronic City', kn: 'ಎಲೆಕ್ಟ್ರಾನಿಕ್ ಸಿಟಿ', short: 'E-City',
    spawn: [300, -320, 0], ll: [12.847, 77.661], bbox: [12.838, 77.65, 12.856, 77.672], jam: 0.4,
    blurb: 'Campuses, the elevated tollway, and a famous glass pyramid.',
  },
  whitefield: {
    name: 'Whitefield', kn: 'ವೈಟ್‌ಫೀಲ್ಡ್', short: 'Whitefield',
    spawn: [120, 200, Math.PI], ll: [12.987, 77.7365], bbox: [12.978, 77.725, 12.996, 77.748], jam: 0.5,
    blurb: 'ITPL and the purple line to the edge of the city.',
  },
};

export const ZONE_ORDER = ['central', 'indiranagar', 'koramangala', 'silkboard', 'basavanagudi', 'bellandur', 'majestic', 'malleshwaram', 'ecity', 'whitefield'];

export const TRAVEL_TIPS = [
  'Mundina nildana… (Next station…) Please mind the gap, and the auto-wala outside.',
  'Tip: Locals greet you with "Oota aayta?" — "had your meal?". The correct answer is always "Aaytu!"',
  'Fun fact: in 2099 the Pink Line is finally… still under construction.',
  'Tip: Hold Shift to run. On the hover scooter, Shift is boost.',
  'Tip: Jump into a wall to climb it. Every rooftop has a black Sintex tank to admire.',
  'Bengaluru weather tip: carry a jacket in summer and an umbrella every afternoon.',
  'Tip: Press Q for emotes. The head wobble means yes, no and maybe, all at once.',
  'Fun fact: Silk Board junction has its own weather system. It is called traffic.',
  'Tip: Share your room link from the menu to play with friends.',
  'Tip: Find yellow Kannada word cards to unlock new chat phrases.',
];
