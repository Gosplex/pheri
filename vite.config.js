import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`         -> dist/ (normal multi-file build, serve with any static server)
// `npm run build:single`  -> dist-single/index.html (one self-contained file, double-click to play)
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [viteSingleFile()] : [],
    // Vercel Web Analytics: on for Vercel builds (VERCEL=1) or when VITE_VERCEL_ANALYTICS=true, off for the offline file
    define: { __ANALYTICS__: JSON.stringify(!single && (process.env.VERCEL === '1' || process.env.VITE_VERCEL_ANALYTICS === 'true')) },
    build: {
      outDir: single ? 'dist-single' : 'dist',
      target: 'es2020',
      chunkSizeWarningLimit: 2000,
      assetsInlineLimit: single ? 100000000 : 4096,
      rollupOptions: single ? {} : { input: { main: 'index.html', admin: 'admin.html' } },
    },
    server: { host: true },
  };
});
