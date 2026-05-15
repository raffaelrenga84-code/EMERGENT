import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
