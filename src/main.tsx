import React, { useState, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { Video } from './types'
import { DJAMMSPlayerRef, NowPlayingPanel, VideoPlayer, TabNavigation, PlaylistTab, SettingsTab, FullscreenPlayer } from './components'

function App() {
  const [playlist, setPlaylist] = useState<Video[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedPlaylist, setSelectedPlaylist] = useState('')
  const [activeTab, setActiveTab] = useState<'playlist' | 'settings'>('playlist')
  const [playerState, setPlayerState] = useState<{ currentVideo: Video | null, currentTime: number, duration: number, isPlaying: boolean }>({
    currentVideo: null,
    currentTime: 0,
    duration: 0,
    isPlaying: false
  })

  // Settings state
  const [settings, setSettings] = useState({
    autoShufflePlaylists: true,
    normalizeAudioLevels: false,
    enableFullscreenPlayer: false,
    fadeDuration: 2.0 // seconds
  })

  const [fullscreenWindowOpen, setFullscreenWindowOpen] = useState(false)

  const playerRef = useRef<DJAMMSPlayerRef>(null)

  const playlists = (globalThis as any).__PLAYLISTS__ || {}

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  const shufflePlaylist = () => {
    setPlaylist(prevPlaylist => {
      if (prevPlaylist.length <= 1) return prevPlaylist

      // Keep the current video at position 0 and shuffle the rest
      const currentVideo = prevPlaylist[currentIndex]
      const remainingVideos = prevPlaylist.filter((_, idx) => idx !== currentIndex)
      const shuffledRemaining = shuffleArray(remainingVideos)

      const newPlaylist = [currentVideo, ...shuffledRemaining]
      setCurrentIndex(0) // Current video is at index 0, next video to play is at index 1
      return newPlaylist
    })
  }

  const removeFromQueue = (videoId: string) => {
    setPlaylist(prevPlaylist => {
      const newPlaylist = prevPlaylist.filter(video => video.id !== videoId)
      // If we're removing the current video, move to the next one
      const currentVideo = prevPlaylist[currentIndex]
      if (currentVideo?.id === videoId) {
        if (newPlaylist.length > 0) {
          const nextIndex = currentIndex % newPlaylist.length
          setCurrentIndex(nextIndex)
          loadVideo(newPlaylist[nextIndex])
        } else {
          setCurrentIndex(0)
        }
      } else {
        // Adjust currentIndex if necessary (if we removed a video before the current one)
        const removedIndex = prevPlaylist.findIndex(video => video.id === videoId)
        if (removedIndex < currentIndex) {
          setCurrentIndex(currentIndex - 1)
        }
      }
      return newPlaylist
    })
  }

  const handlePlaylistChange = (event: React.ChangeEvent<HTMLSelectElement>, autoPlay = false) => {
    const playlistName = event.target.value
    setSelectedPlaylist(playlistName)

    if (!playlistName) {
      setPlaylist([])
      setCurrentIndex(0)
      return
    }

    const files = playlists[playlistName]

    if (!files || files.length === 0) {
      alert(`No MP4 files found in the ${playlistName} playlist.`)
      return
    }

    const videos: Video[] = files.map((file: { name: string; path: string; url: string; title: string }, index: number) => ({
      id: `${playlistName}_video_${index}`,
      title: file.title,
      artist: 'Unknown Artist',
      src: file.url, // Use the HTTP URL served by Vite
      path: file.path,
      duration: 0
    }))

    // Shuffle the playlist only if auto-shuffle is enabled
    let finalVideos = settings.autoShufflePlaylists ? shuffleArray(videos) : videos

    // If there's a currently playing video, prepend it to the playlist as position 0
    if (playerState.currentVideo) {
      // Check if the current video is already in the new playlist
      const currentVideoExists = finalVideos.some(video => video.id === playerState.currentVideo!.id)

      if (!currentVideoExists) {
        // Prepend the current video to the playlist
        finalVideos = [playerState.currentVideo, ...finalVideos]
      } else {
        // If it exists, move it to the front
        const currentVideoIndex = finalVideos.findIndex(video => video.id === playerState.currentVideo!.id)
        if (currentVideoIndex > 0) {
          const currentVideo = finalVideos.splice(currentVideoIndex, 1)[0]
          finalVideos = [currentVideo, ...finalVideos]
        }
      }
    }

    setPlaylist(finalVideos)
    setCurrentIndex(0) // Current video is at index 0, next video to play is at index 1

    // Only autoplay on startup, not when user manually selects
    if (autoPlay && finalVideos.length > 0) {
      loadVideo(finalVideos[0])
    }
  }

  useEffect(() => {
    // Auto-select "Obie Days" playlist on startup and autoplay
    if (playlists['Obie Days']) {
      const event = { target: { value: 'Obie Days' } } as React.ChangeEvent<HTMLSelectElement>
      handlePlaylistChange(event, true) // true for autoplay
    }
  }, []) // Empty dependency array to run only on mount

  const loadVideo = (video: Video) => {
    if (playerRef.current) {
      playerRef.current.playVideo(video)
    }
    if (fullscreenWindowOpen) {
      controlFullscreenPlayer('play', video)
    }
    // Preload next video to avoid loading screen when skipping
    const nextIndex = (playlist.indexOf(video) + 1) % Math.max(playlist.length, 1)
    const nextVideo = playlist[nextIndex]
    if (nextVideo) {
      if (settings.enableFullscreenPlayer) {
        controlFullscreenPlayer('preload', nextVideo)
      } else {
        playerRef.current?.preloadVideo?.(nextVideo)
      }
    }
  }

  const handleVideoEnd = () => {
    // Play next video in playlist
    const nextIndex = (currentIndex + 1) % playlist.length
    setCurrentIndex(nextIndex)
    if (playlist[nextIndex]) {
      loadVideo(playlist[nextIndex])
    }
  }

  // Settings handlers
  const updateSetting = (key: keyof typeof settings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }))

    // Special handling for fullscreen player toggle
    if (key === 'enableFullscreenPlayer') {
      if (value && playerState.currentVideo) {
        // Open fullscreen window when enabled
        createFullscreenWindow(playerState.currentVideo)
      } else if (!value) {
        // Close fullscreen window when disabled
        closeFullscreenWindow()
      }
    }
  }

  // Fullscreen window management - BROWSER COMPATIBLE VERSION
  const createFullscreenWindow = (video: Video) => {
    // Browser-compatible fullscreen implementation
    try {
      // Create a new window/tab for fullscreen playback
      const fullscreenWindow = window.open(
        `/fullscreen.html?video=${encodeURIComponent(JSON.stringify(video))}`,
        'djamms-fullscreen',
        'width=800,height=600,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no'
      )

      if (fullscreenWindow) {
        setFullscreenWindowOpen(true)

        // Store reference to fullscreen window for communication
        ;(window as any).fullscreenWindow = fullscreenWindow

        // Track if we've initialized playback for this fullscreen session
        let playerInitialized = false

        // Listen for messages from fullscreen window
        const messageHandler = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return

          const { type, data } = event.data

          switch (type) {
            case 'FULLSCREEN_READY':
              // Send initial state to fullscreen window
              fullscreenWindow.postMessage({
                type: 'INIT_STATE',
                data: {
                  video: playerState.currentVideo,
                  isPlaying: playerState.isPlaying,
                  currentTime: playerState.currentTime,
                  duration: playerState.duration,
                  volume: 0.7,
                  enableAudioNormalization: settings.normalizeAudioLevels
                  ,
                  fadeDuration: settings.fadeDuration
                }
              }, window.location.origin)
              break

            case 'STATE_CHANGE':
              // Check if the fullscreen player is now ready and playing
              if (data.isPlaying && !playerInitialized) {
                playerInitialized = true
                // Call skip function once to initialize playback in the window
                handleVideoEnd()
              }
              break
          }
        }

        window.addEventListener('message', messageHandler)

        // Clean up when fullscreen window closes
        const checkClosed = setInterval(() => {
          if (fullscreenWindow.closed) {
            clearInterval(checkClosed)
            setFullscreenWindowOpen(false)
            window.removeEventListener('message', messageHandler)
          }
        }, 1000)
      }
    } catch (error) {
      console.error('Failed to create fullscreen window:', error)
      alert('Failed to open dedicated player window. Please check your popup blocker settings.')
    }
  }

  const closeFullscreenWindow = () => {
    const fullscreenWindow = (window as any).fullscreenWindow
    if (fullscreenWindow && !fullscreenWindow.closed) {
      fullscreenWindow.close()
    }
    setFullscreenWindowOpen(false)
  }

  const controlFullscreenPlayer = (action: string, data?: any) => {
    const fullscreenWindow = (window as any).fullscreenWindow
    if (fullscreenWindow && !fullscreenWindow.closed) {
      fullscreenWindow.postMessage({
        type: 'CONTROL',
        action,
        data
      }, window.location.origin)
    }
  }

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('djamms-settings')
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings))
      } catch (error) {
        console.warn('Could not parse saved settings:', error)
      }
    }
  }, [])

  // Save settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('djamms-settings', JSON.stringify(settings))
  }, [settings])

  // Handle fullscreen player creation/closure when settings change
  useEffect(() => {
    if (settings.enableFullscreenPlayer && playerState.currentVideo) {
      // Create fullscreen window
      createFullscreenWindow(playerState.currentVideo)
    } else if (!settings.enableFullscreenPlayer) {
      // Close fullscreen window when disabled
      closeFullscreenWindow()
    }
  }, [settings.enableFullscreenPlayer, playerState.currentVideo])

  // Sync playback state with fullscreen window
  useEffect(() => {
    if (fullscreenWindowOpen && playerState.currentVideo) {
      controlFullscreenPlayer('updateState', {
        video: playerState.currentVideo,
        isPlaying: playerState.isPlaying,
        currentTime: playerState.currentTime,
        duration: playerState.duration
      })
    }
  }, [playerState, fullscreenWindowOpen])

  // Sync settings (fade duration) to fullscreen window when it changes
  useEffect(() => {
    if (fullscreenWindowOpen) {
      controlFullscreenPlayer('updateSettings', { fadeDuration: settings.fadeDuration })
    }
  }, [settings.fadeDuration, fullscreenWindowOpen])

  return (
    <div className="container">
      {/* Top Section: Now Playing Frame + Player */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        <NowPlayingPanel
          currentVideo={playerState.currentVideo}
          currentTime={playerState.currentTime}
          duration={playerState.duration}
          isPlaying={playerState.isPlaying}
          selectedPlaylist={selectedPlaylist}
          playlist={playlist}
          currentIndex={currentIndex}
          playlists={playlists}
          onPlaylistChange={handlePlaylistChange}
          onPlayPause={() => {
            if (playerState.isPlaying) {
              // Pause logic
              if (settings.enableFullscreenPlayer) {
                // Control fullscreen player
                controlFullscreenPlayer('pause')
                // Update local state immediately for UI
                setPlayerState(prev => ({ ...prev, isPlaying: false }))
              } else {
                // Control main player
                playerRef.current?.pauseVideo();
              }
            } else {
              // Play/Resume logic
              if (settings.enableFullscreenPlayer) {
                // Control fullscreen player
                controlFullscreenPlayer('resume')
                // Update local state immediately for UI
                setPlayerState(prev => ({ ...prev, isPlaying: true }))
              } else {
                // Control main player
                if (playerRef.current?.resumeVideo) {
                  playerRef.current.resumeVideo();
                } else {
                  // Fallback
                  playerRef.current?.playVideo(playlist[currentIndex]);
                }
              }
            }
          }}
          onSkip={handleVideoEnd}
          onShuffle={shufflePlaylist}
        />

        {/* Player - only show if not in fullscreen mode */}
        {!settings.enableFullscreenPlayer && (
          <VideoPlayer
            ref={playerRef}
            width={800}
            height={600}
            showControls={false}
            showProgress={false}
            showNowPlaying={false}
            autoPlay={false}
            volume={0.7}
            fadeDuration={settings.fadeDuration}
            onVideoEnd={handleVideoEnd}
            onSkip={handleVideoEnd}
            onStateChange={setPlayerState}
            enableAudioNormalization={settings.normalizeAudioLevels}
          />
        )}
      </div>

      {/* Tab Navigation */}
      <TabNavigation
        activeTab={activeTab}
        tabs={[
          { id: 'playlist', label: 'Playlist', icon: '📋' },
          { id: 'settings', label: 'Settings', icon: '⚙️' }
        ]}
        onTabChange={setActiveTab}
      />

      {/* Tab Content */}
      {activeTab === 'playlist' && (
        <PlaylistTab
          playlist={playlist}
          currentIndex={currentIndex}
          currentVideo={playerState.currentVideo}
          onPlayVideo={(index) => {
            const selectedVideo = playlist[index]
            if (selectedVideo) {
              loadVideo(selectedVideo)
              setCurrentIndex(index)
            }
          }}
          onRemoveFromQueue={removeFromQueue}
        />
      )}

      {activeTab === 'settings' && (
        <SettingsTab
          settings={settings}
          onUpdateSetting={updateSetting}
        />
      )}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)