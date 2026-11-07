import { Game } from './engine/Game.js';
import { validateStory } from './engine/validate.js';

// Which story to load: ?story=<file> (in /story), default The Grinning Hour.
const params = new URLSearchParams(location.search);
const file = (params.get('story') || 'the-grinning-hour').replace(/[^a-z0-9_-]/gi, '');

async function boot() {
  const res = await fetch(`story/${file}.json`);
  if (!res.ok) throw new Error(`Could not load story "${file}" (${res.status})`);
  const story = await res.json();
  const errs = validateStory(story);
  if (errs.length) console.warn('Story problems:\n' + errs.join('\n'));
  // Wait for the comic fonts so canvas-drawn signs use them.
  try { await Promise.race([document.fonts.load('40px Bangers'), new Promise((r) => setTimeout(r, 2500))]); } catch {}
  window.game = new Game(story);
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('loading').textContent = `Failed to load: ${e.message}`;
});
