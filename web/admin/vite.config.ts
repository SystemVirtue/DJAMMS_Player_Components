import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  optimizeDeps: {
    include: ['@supabase/supabase-js', 'react', 'react-dom', 'lucide-react', 'clsx', 'tailwind-merge'],
  },
  server: {
    port: 5176,
    fs: {
      allow: [
        // Allow serving files from project root and shared
        path.resolve(__dirname, '..'),
        path.resolve(__dirname, '../shared'),
      ],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
