// Game identity and online endpoints. Change the name here and it updates everywhere.
export const GAME = {
  name: 'PHERI',
  nameGu: 'ફેરી',
  tagline: 'Ride. Deliver. Race.',
  version: '2.3.0',
};

// Online services are optional: leave them empty and the game runs fully offline.
// Set them in Vercel (Project -> Settings -> Environment Variables) or a local .env file.
const env = import.meta.env || {};
export const ONLINE = {
  supabaseUrl: env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || '',
  // Render game server, e.g. https://pheri-server.onrender.com (ws URL is derived from it).
  // Empty = same origin (when the Render server also serves the game).
  serverUrl: env.VITE_SERVER_URL || '',
};
export const WORLD_HASH = '2721:165310';
