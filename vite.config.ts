import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
        },
      },
    },
    chunkSizeWarningLimit: 600,
    assetsInlineLimit: 4096,
  },
});
