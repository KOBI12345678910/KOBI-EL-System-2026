import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// import { VitePWA } from 'vite-plugin-pwa'; // TODO: install vite-plugin-pwa

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // VitePWA({ registerType: 'autoUpdate', ... }) // TODO: re-enable after installing vite-plugin-pwa
  ],
  base: '/payroll/',
  server: {
    port: 5174,
    host: true,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1500
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts']
  }
});
