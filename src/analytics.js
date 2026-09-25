// Vercel Web Analytics. Loaded only in builds made on Vercel (or with VITE_VERCEL_ANALYTICS=true),
// never in the offline single-file build, so the Render-hosted and offline versions stay clean.
/* global __ANALYTICS__ */
let trackFn = null;

export async function initAnalytics() {
  if (typeof __ANALYTICS__ === 'undefined' || !__ANALYTICS__) return;
  try {
    const m = await import('@vercel/analytics');
    m.inject({ mode: import.meta.env.DEV ? 'development' : 'production' });
    trackFn = m.track;
  } catch { /* blocked by an ad blocker: fine */ }
}

// Custom events (visible on Vercel plans that include custom events). Never send personal data.
const last = new Map();
export function track(name, props = {}) {
  if (!trackFn) return;
  const now = Date.now();
  if (now - (last.get(name) || 0) < 3000) return; // light throttle
  last.set(name, now);
  try { trackFn(name, props); } catch { /* ignore */ }
}
