import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs on :4000; proxying keeps everything same-origin,
// which is what lets the refresh cookie stay SameSite=Strict.
const api = process.env.VITE_DEV_API ?? 'http://localhost:4000';
export default defineConfig({
  plugins: [react()],
  // Regex keys: a plain '/t' prefix would also capture /tasks and /templates.
  server: { port: 5173, proxy: { '/api': api, '^/t/': api, '^/u/': api } },
  preview: { port: 4173, proxy: { '/api': api, '^/t/': api, '^/u/': api } },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
});
