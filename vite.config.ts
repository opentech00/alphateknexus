import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: [
        'icons/pwa-192.png',
        'icons/pwa-512.png',
        'icons/pwa-512-maskable.png',
        'icons/apple-touch-icon.png',
        'offline.html',
        'payment-return.html',
      ],
      manifest: {
        id: '/',
        name: 'AlphaTek Nexus',
        short_name: 'AlphaTek',
        description: 'Book and manage essential services from your phone.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        background_color: '#0f172a',
        theme_color: '#f5f8ff',
        lang: 'en',
        dir: 'ltr',
        categories: ['business', 'lifestyle'],
        handle_links: 'preferred',
        launch_handler: { client_mode: ['navigate-existing', 'auto'] },
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Home', short_name: 'Home', url: '/', icons: [{ src: 'icons/pwa-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2,woff}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/admin(?:\.html|\/)/,
          /^\/employee(?:\.html|\/)/,
          /^\/field(?:\.html|\/)/,
          /^\/payment-return(?:\.html)?/,
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-data',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 10 },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|webp|gif)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  appType: 'mpa',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        admin: 'admin.html',
        employee: 'employee.html',
        field: 'field.html',
      },
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'supabase': ['@supabase/supabase-js'],
          'icons': ['lucide-react'],
          'mapbox': ['mapbox-gl'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
    assetsInlineLimit: 4096,
  },
  optimizeDeps: {
    include: ['mapbox-gl'],
  },
});
