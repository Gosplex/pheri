import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import '@fontsource/baloo-bhai-2/gujarati-600.css';
import '@fontsource/baloo-bhai-2/gujarati-700.css';
import '@fontsource/baloo-bhai-2/gujarati-800.css';
import '@fontsource/baloo-bhai-2/latin-700.css';
import '@fontsource/noto-sans-devanagari/devanagari-600.css';
import './style.css';
import { Game } from './game.js';
import { initAnalytics } from './analytics.js';
initAnalytics();

// Fonts must be ready before shop boards are painted into the sign atlas.
async function loadFonts() {
  if (!document.fonts) return;
  const want = [
    ['700 40px "Rajdhani"', 'RAJKOT 0123'], ['600 40px "Rajdhani"', 'Rajkot'], ['500 40px "Rajdhani"', 'Rajkot'],
    ['600 40px "Baloo Bhai 2"', 'રાજકોટ'], ['700 40px "Baloo Bhai 2"', 'રાજકોટ'], ['800 40px "Baloo Bhai 2"', 'રાજકોટ'],
    ['600 40px "Noto Sans Devanagari"', 'राजकोट'],
  ];
  await Promise.race([Promise.all(want.map(([f, t]) => document.fonts.load(f, t).catch(() => null))), new Promise((r) => setTimeout(r, 4000))]);
}

function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

(async () => {
  if (!webglOk()) {
    document.getElementById('load-msg').textContent = 'This browser cannot run WebGL. Try the latest Chrome, Edge, Firefox or Safari with hardware acceleration switched on.';
    return;
  }
  await loadFonts();
  const game = new Game();
  try { await game.init(); }
  catch (err) {
    console.error(err);
    document.getElementById('load-msg').textContent = 'Something went wrong while building the city: ' + err.message + '. Reload to try again, or lower Graphics quality.';
  }
})();
