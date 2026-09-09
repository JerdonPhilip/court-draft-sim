import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001';

export default defineConfig({
  plugins: [
    react(),
    // Offline-first PWA: precache the shell + fonts + lazy engine chunk.
    // API calls are NOT cached — the app falls back to the local engine.
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@store': path.resolve(__dirname, './src/store'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@data': path.resolve(__dirname, './src/data'),
      // Shared game core (server services/data: platform-agnostic, no node builtins).
      '@server': path.resolve(__dirname, '../server/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    rollupOptions: {
      output: {
        // Offline game engine (shared server core) in its own chunk so the
        // shell stays lean and engine bytes cache independently.
        manualChunks(id) {
          if (id.includes('/server/src/')) return 'engine';
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)([\\/]|$)/.test(id)) return 'vendor';
          if (/[\\/]node_modules[\\/](lucide-react|clsx|tailwind-merge)([\\/]|$)/.test(id)) return 'ui';
        },
      },
    },
  },
});
