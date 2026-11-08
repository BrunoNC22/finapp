import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// Em desenvolvimento, /api vai para a API (FINAPP_API_TARGET, padrão http://127.0.0.1:3000).
const apiTarget = process.env.FINAPP_API_TARGET ?? 'http://127.0.0.1:3000';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // O registro é feito em main.tsx (com verificação periódica de versão nova).
      injectRegister: false,
      manifest: {
        name: 'finapp',
        short_name: 'finapp',
        description: 'Inteligência financeira pessoal',
        lang: 'pt-BR',
        display: 'standalone',
        start_url: '/',
        background_color: '#0f1720',
        theme_color: '#0f1720',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Só os arquivos do app. Respostas da API (dados financeiros) NUNCA vão para o cache.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    proxy: { '/api': { target: apiTarget, rewrite: (path) => path.replace(/^\/api/, '') } },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}', 'test/**/*.spec.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    sequence: { shuffle: true },
    restoreMocks: true,
  },
});
