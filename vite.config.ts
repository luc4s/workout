/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

// HTTPS is needed on the LAN: service workers and the Wake Lock API require a secure context.
const useSsl = process.env.NO_SSL !== '1';

// GitHub Pages serves project sites from /<repo>/; BASE_PATH is set by the deploy workflow.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    ...(useSsl ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Workout',
        short_name: 'Workout',
        description: 'Guided sessions, timers and progress tracking for the time-efficient training program.',
        theme_color: '#14161a',
        background_color: '#14161a',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  server: { host: true },
  preview: { host: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
