// Minimal DOM stubs so world generation can run in Node for smoke tests.
const ctx2d = new Proxy({}, { get: (t, k) => {
  if (k === 'measureText') return (s) => ({ width: String(s).length * 10 });
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
  if (k in t) return t[k];
  return () => {};
}, set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }), getElementById: () => null };
globalThis.window = { addEventListener() {}, AudioContext: null };
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
