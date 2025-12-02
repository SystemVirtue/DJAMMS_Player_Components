import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Read all playlist directories
const playlistsDir = '/Users/mikeclarkin/Music/DJAMMS/PLAYLISTS'
let playlists = {}

try {
  if (fs.existsSync(playlistsDir)) {
    console.log('Playlists directory exists:', playlistsDir)
    const playlistDirs = fs.readdirSync(playlistsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
    console.log('Found playlist directories:', playlistDirs)

    playlistDirs.forEach(playlistName => {
      const playlistPath = path.join(playlistsDir, playlistName)
      const files = fs.readdirSync(playlistPath)
        .filter(file => file.endsWith('.mp4'))
        .map((file, index) => {
          // Parse title from filename (format: "ID | Title.mp4" or just "Title.mp4")
          const nameWithoutExt = file.replace(/\.mp4$/, '')
          const parts = nameWithoutExt.split(' | ')
          const title = parts.length > 1 ? parts.slice(1).join(' | ') : nameWithoutExt
          
          return {
            id: `${playlistName}-${index}`,
            title,
            artist: playlistName,
            filename: file,
            playlist: playlistName,
            src: `/playlist/${encodeURIComponent(playlistName)}/${encodeURIComponent(file)}`, // Vite proxy URL
            path: path.join(playlistPath, file) // Keep original path for reference
          }
        })
        .sort((a, b) => a.title.localeCompare(b.title))
      playlists[playlistName] = files
      console.log(`Playlist ${playlistName}: ${files.length} files`)
    })
    console.log('Final playlists object:', Object.keys(playlists))
  } else {
    console.warn('Playlists directory does not exist:', playlistsDir)
  }
} catch (error) {
  console.warn('Could not read playlists directory:', error.message)
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-playlist',
      configureServer(server) {
        server.middlewares.use('/playlist', (req, res, next) => {
          const urlParts = req.url.split('/').filter(part => part)
          if (urlParts.length < 2) {
            res.statusCode = 400
            res.end('Invalid playlist URL')
            return
          }
          const playlistName = decodeURIComponent(urlParts[0])
          const fileName = decodeURIComponent(urlParts[1])
          const filePath = path.join(playlistsDir, playlistName, fileName)

          if (fs.existsSync(filePath) && fileName.endsWith('.mp4')) {
            res.setHeader('Content-Type', 'video/mp4')
            const stream = fs.createReadStream(filePath)
            stream.pipe(res)
          } else {
            res.statusCode = 404
            res.end('File not found')
          }
        })
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        fullscreen: path.resolve(__dirname, 'fullscreen.html')
      }
    }
  },
  server: {
    port: 3000,
    strictPort: true,  // Force port 3000 so Electron wait-on works
    open: false  // Don't auto-open browser when running with Electron
  },
  define: {
    __PLAYLISTS__: JSON.stringify(playlists)
  }
})