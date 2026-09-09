import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development the UI talks to the API on its own port; in production
    // the built files are served by the API itself, so there is no CORS at all.
    proxy: { '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
