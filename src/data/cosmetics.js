// Boutique items and player titles. Titles travel in the look as a small number (see safeLook).

export const TITLES = [
  '',
  'Silk Board Survivor',
  'Filter Kaapi Expert',
  'Startup Founder (pre-revenue)',
  'Certified Bengalurean',
  'Quiz Guru',
  'Dance Macha',
  'Chor Champion',
  'Pothole Navigator',
  'Ee Sala Cup Namde',
  'Weekend Nandi Hills Trekker',
  'Swalpa Adjust Specialist',
  'Blaster Bhai',
  'Meter Mele Fifty',
];

// kind: extra (worn, see Avatar extras) | title (index into TITLES)
export const SHOP = [
  { id: 'shades', kind: 'extra', name: '😎 Aviator shades', price: 60 },
  { id: 'mallige', kind: 'extra', name: '🌼 Mallige in the hair', price: 40 },
  { id: 'headphones', kind: 'extra', name: '🎧 Big headphones', price: 90 },
  { id: 'goldchain', kind: 'extra', name: '📿 Gold chain', price: 120 },
  { id: 'rcb', kind: 'extra', name: '❤️ Red-and-black fan jersey', price: 150 },
  { id: 'title:2', kind: 'title', title: 2, name: '🏷️ Title: Filter Kaapi Expert', price: 80 },
  { id: 'title:3', kind: 'title', title: 3, name: '🏷️ Title: Startup Founder (pre-revenue)', price: 100 },
  { id: 'title:8', kind: 'title', title: 8, name: '🏷️ Title: Pothole Navigator', price: 80 },
  { id: 'title:9', kind: 'title', title: 9, name: '🏷️ Title: Ee Sala Cup Namde', price: 120 },
  { id: 'title:10', kind: 'title', title: 10, name: '🏷️ Title: Weekend Nandi Hills Trekker', price: 100 },
  { id: 'title:11', kind: 'title', title: 11, name: '🏷️ Title: Swalpa Adjust Specialist', price: 60 },
];

// titles earned by playing (not sold)
export const EARNED = { quiz: 5, dance: 6, chor: 7, blasters: 12, silkboard: 1, certified: 4, auto: 13 };
