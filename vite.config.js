import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Playlists are now loaded at runtime via IPC (Electron) or API calls (web)
// No build-time parsing - this improves build performance and allows dynamic playlist loading

export default defineConfig({
  base: './',  // Use relative paths for Electron file:// protocol
  plugins: [
    react(),
    // Removed serve-playlist middleware - file serving handled by Electron main process
  ],
  define: {
    __PLATFORM__: JSON.stringify('electron')
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        fullscreen: path.resolve(__dirname, 'fullscreen.html')
      },
      output: {
        manualChunks: {
          // Split large hooks into separate chunks
          'video-player': ['./src/hooks/useVideoPlayer.ts'],
          // Split vendor libraries
          'vendor-react': ['react', 'react-dom'],
          'vendor-supabase': ['@supabase/supabase-js']
        }
      }
    },
    chunkSizeWarningLimit: 1000 // Increase limit for large chunks
  },
  server: {
    port: 3003,
    strictPort: true,  // Force port 3003 so Electron wait-on works
    open: false  // Don't auto-open browser when running with Electron
  },
  // Removed __PLAYLISTS__ define - playlists loaded at runtime
})
  },
  // Removed __PLAYLISTS__ define - playlists loaded at runtime
})
  },
  // Removed __PLAYLISTS__ define - playlists loaded at runtime
})