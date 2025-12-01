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
        .map(file => ({
          name: file,
          path: path.join(playlistPath, file),
          url: `/playlist/${playlistName}/${file}`, // Serve through Vite dev server
          title: file.replace(/\.mp4$/, '').replace(/^[^|]*\| /, '') // Remove ID prefix and .mp4 extension
        }))
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
    open: true
  },
  define: {
    __PLAYLISTS__: JSON.stringify(playlists)
  }
})