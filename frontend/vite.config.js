import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

/**
 * swCacheBust — plugin Vite che a build-time sostituisce il placeholder
 * `__BUILD_VERSION__` dentro `dist/sw.js` con un valore unico basato sul
 * timestamp del build.
 *
 * Risultato: ad ogni `yarn build` (e quindi ad ogni deploy GitHub/Vercel),
 * il CACHE_NAME del Service Worker cambia → il browser scarica il nuovo SW
 * → l'UpdateBanner mostra il toast "App aggiornata · ricarica" all'utente
 * senza che debba fare nulla manualmente.
 */
function swCacheBust() {
  const BUILD_VERSION = new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[-:T]/g, '');
  return {
    name: 'sw-cache-bust',
    apply: 'build',
    closeBundle() {
      const candidates = [
        resolve(__dirname, 'dist/sw.js'),
        resolve(__dirname, 'build/sw.js'),
      ];
      const swPath = candidates.find((p) => existsSync(p));
      if (!swPath) {
        console.warn('[sw-cache-bust] sw.js non trovato nella dist, salto');
        return;
      }
      try {
        const content = readFileSync(swPath, 'utf8');
        const next = content.replace(/__BUILD_VERSION__/g, BUILD_VERSION);
        writeFileSync(swPath, next);
        // eslint-disable-next-line no-console
        console.log(`[sw-cache-bust] CACHE_NAME → fammy-${BUILD_VERSION}`);
      } catch (e) {
        console.warn('[sw-cache-bust] failed:', e.message);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), swCacheBust()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    // Allow Emergent preview host so dev-server doesn't reject requests
    allowedHosts: true,
    hmr: {
      // Use wss for the preview proxy
      clientPort: 443,
      protocol: 'wss',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
  publicDir: 'public',
  build: {
    sourcemap: true,
  },
});
