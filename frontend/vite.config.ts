import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // Read .env from the repo root (env files live in the parent folder).
  envDir: '..',
  // @canvas/shared ships CommonJS; let Vite pre-bundle it for the browser.
  optimizeDeps: { include: ['@canvas/shared'] },
});
