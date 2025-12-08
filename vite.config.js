import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Read all playlist directories (optimized for large playlists)
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
      
      try {
        const allFiles = fs.readdirSync(playlistPath)
          .filter(file => file.endsWith('.mp4'))
        
        const files = allFiles
          .map((file, index) => {
            // Parse filename format: "[Artist] - [Title] -- [YouTube_ID].mp4"
            const nameWithoutExt = file.replace(/\.mp4$/i, '')
            
            // Extract YouTube ID (after " -- ")
            const doubleHyphenIndex = nameWithoutExt.lastIndexOf(' -- ')
            let artist = null
            let title = nameWithoutExt
            let youtubeId = null
            
            if (doubleHyphenIndex !== -1) {
              youtubeId = nameWithoutExt.substring(doubleHyphenIndex + 4).trim()
              const artistAndTitle = nameWithoutExt.substring(0, doubleHyphenIndex)
              
              // Extract Artist and Title (separated by " - ")
              const singleHyphenIndex = artistAndTitle.indexOf(' - ')
              if (singleHyphenIndex !== -1) {
                artist = artistAndTitle.substring(0, singleHyphenIndex).trim()
                title = artistAndTitle.substring(singleHyphenIndex + 3).trim()
              } else {
                title = artistAndTitle.trim()
              }
            } else {
              // No YouTube ID, try to parse as "Artist - Title"
              const singleHyphenIndex = nameWithoutExt.indexOf(' - ')
              if (singleHyphenIndex !== -1) {
                artist = nameWithoutExt.substring(0, singleHyphenIndex).trim()
                title = nameWithoutExt.substring(singleHyphenIndex + 3).trim()
              }
            }
            
            return {
              id: `${playlistName}-${index}`,
              title,
              artist: artist || playlistName,
              filename: file,
              playlist: playlistName,
              playlistDisplayName: playlistName.replace(/^PL[A-Za-z0-9_-]+[._]/, ''), // Strip YouTube playlist ID
              src: `/playlist/${encodeURIComponent(playlistName)}/${encodeURIComponent(file)}`,
              path: path.join(playlistPath, file)
            }
          })
          .sort((a, b) => a.title.localeCompare(b.title))
        
        playlists[playlistName] = files
        console.log(`Playlist ${playlistName}: ${files.length} files`)
      } catch (error) {
        console.warn(`Error reading playlist ${playlistName}:`, error.message)
        playlists[playlistName] = []
      }
    })
    console.log('Final playlists object:', Object.keys(playlists))
  } else {
    console.warn('Playlists directory does not exist:', playlistsDir)
  }
} catch (error) {
  console.warn('Could not read playlists directory:', error.message)
}

export default defineConfig({
  base: './',  // Use relative paths for Electron file:// protocol
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