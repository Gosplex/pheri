// Persistence: progress and settings in localStorage (guarded; the game runs fine without it).
const KEY = 'rajkot-rider-save-v1';
const SKEY = 'rajkot-rider-settings-v1';

export const DEFAULT_SETTINGS = {
  quality: 'medium',     // low | medium | high
  volume: 0.8,
  dayMinutes: 24,        // real minutes per in-game day
  weather: 'dynamic',    // dynamic | clear | cloudy | rain
  showFps: false,
  cameraShake: true,
  units: 'kmh',
  festival: 'auto',     // auto | off | navratri | uttarayan | diwali
  autoRes: true,
  tilt: false,
  uiScale: 1,
};

export function newProfile() {
  return {
    money: 250,
    rating: 3.8,
    ratings: [],
    fuel: 85,
    time: 7.5,           // hours
    day: 1,
    bike: 'sparrow',
    owned: { bikes: ['sparrow'], upgrades: [], cosmetics: ['helmet-red', 'jacket-indigo', 'paint-red'] },
    equip: { helmet: 'helmet-red', jacket: 'jacket-indigo', paint: 'paint-red', box: false },
    stats: { jobs: 0, earned: 0, distance: 0, bestStreak: 0, shiftJobs: 0, shiftEarned: 0, shiftDistance: 0, fines: 0 },
    pos: null,
    tutorialDone: false,
  };
}

export function loadProfile() {
  try { const s = localStorage.getItem(KEY); if (!s) return null; return { ...newProfile(), ...JSON.parse(s) }; }
  catch { return null; }
}
export function saveProfile(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); return true; } catch { return false; } }
export function hasSave() { try { return !!localStorage.getItem(KEY); } catch { return false; } }
export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

export function loadSettings() {
  try { const s = localStorage.getItem(SKEY); return { ...DEFAULT_SETTINGS, ...(s ? JSON.parse(s) : {}) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s) { try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch { /* ignore */ } }
