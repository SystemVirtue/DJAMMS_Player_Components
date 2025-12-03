// fullscreen.tsx - THE ONLY PLAYER - handles all audio/video playback
import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom/client'
import { FullscreenPlayer } from './components'
import { Video } from './types'
import { useSupabase } from './hooks/useSupabase'
import { getSupabaseService } from './services/SupabaseService'
import { QueueVideoItem } from './types/supabase'

function FullscreenApp() {
  const [video, setVideo] = useState<Video | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.7)
  const [enableAudioNormalization, setEnableAudioNormalization] = useState(false)
  const [preloadVideo, setPreloadVideo] = useState<Video | null>(null)
  const [fadeDuration, setFadeDuration] = useState<number>(2.0)
  
  // Track queues for Supabase sync
  const [activeQueue, setActiveQueue] = useState<Video[]>([])
  const [priorityQueue, setPriorityQueue] = useState<Video[]>([])

  // Check if we're in Electron
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI
  
  // Supabase integration - listens for remote commands
  const { isInitialized: supabaseReady, syncState } = useSupabase({
    autoInit: true,
    // Remote play command (from Admin Console)
    onPlay: (queueVideo?: QueueVideoItem) => {
      if (queueVideo) {
        const videoToPlay: Video = {
          id: queueVideo.id,
          title: queueVideo.title,
          artist: queueVideo.artist,
          src: queueVideo.src,
          path: queueVideo.path,
          duration: queueVideo.duration,
          playlist: queueVideo.playlist,
          playlistDisplayName: queueVideo.playlistDisplayName
        }
        setVideo(videoToPlay)
      }
      setIsPlaying(true)
    },
    // Remote pause command
    onPause: () => setIsPlaying(false),
    // Remote resume command  
    onResume: () => setIsPlaying(true),
    // Remote skip command - request next from main window
    onSkip: () => {
      if (isElectron) {
        (window as any).electronAPI.onVideoEnded()
      }
      window.parent.postMessage({ type: 'VIDEO_END' }, window.location.origin)
    },
    // Remote volume command
    onSetVolume: (vol: number) => setVolume(vol),
    // Remote seek command
    onSeekTo: (position: number) => setCurrentTime(position)
  })

  useEffect(() => {
    // Load saved settings on startup
    const loadSettings = async () => {
      if (isElectron) {
        try {
          const savedVolume = await (window as any).electronAPI.getSetting('volume')
          if (savedVolume !== undefined) setVolume(savedVolume)
          
          const savedNormalize = await (window as any).electronAPI.getSetting('normalizeAudioLevels')
          if (savedNormalize !== undefined) setEnableAudioNormalization(savedNormalize)
          
          const savedFadeDuration = await (window as any).electronAPI.getSetting('fadeDuration')
          if (savedFadeDuration !== undefined) setFadeDuration(savedFadeDuration)
        } catch (error) {
          console.error('Failed to load settings:', error)
        }
      }
    }
    loadSettings()

    // Get initial video data from URL parameters (for web mode)
    const urlParams = new URLSearchParams(window.location.search)
    const videoParam = urlParams.get('video')
    if (videoParam) {
      try {
        const initialVideo = JSON.parse(decodeURIComponent(videoParam))
        setVideo(initialVideo)
      } catch (error) {
        console.error('Failed to parse initial video data:', error)
      }
    }

    // Handle control messages from Main Window
    const handleControl = (action: string, data?: any) => {
      console.log('[FullscreenApp] Received control:', action, data)
      switch (action) {
        case 'play':
          setVideo(data)
          setIsPlaying(true)
          break
        case 'pause':
          setIsPlaying(false)
          break
        case 'resume':
          setIsPlaying(true)
          break
        case 'setVolume':
          if (typeof data === 'number') {
            setVolume(data)
          }
          break
        case 'preload':
          try {
            setPreloadVideo(data)
          } catch (error) {
            console.warn('Failed to set preload video', error)
          }
          break
        case 'updateSettings':
          try {
            if (data) {
              if (typeof data.fadeDuration === 'number') setFadeDuration(data.fadeDuration)
              if (typeof data.enableAudioNormalization === 'boolean') setEnableAudioNormalization(data.enableAudioNormalization)
              if (typeof data.volume === 'number') setVolume(data.volume)
            }
          } catch (error) {
            console.warn('Failed to apply settings update', error)
          }
          break
        case 'updateState':
          if (data) {
            if (data.video) setVideo(data.video)
            if (typeof data.isPlaying === 'boolean') setIsPlaying(data.isPlaying)
            if (typeof data.currentTime === 'number') setCurrentTime(data.currentTime)
            if (typeof data.duration === 'number') setDuration(data.duration)
          }
          break
        case 'updateQueue':
          // Receive queue updates from main window for Supabase sync
          if (data) {
            if (Array.isArray(data.activeQueue)) setActiveQueue(data.activeQueue)
            if (Array.isArray(data.priorityQueue)) setPriorityQueue(data.priorityQueue)
          }
          break
        case 'indexPlaylists':
          // Index local playlists to Supabase for Admin Console / Kiosk search
          if (data && typeof data === 'object') {
            const supabaseService = getSupabaseService()
            if (supabaseService.initialized) {
              supabaseService.indexLocalVideos(data as Record<string, Video[]>)
            }
          }
          break
      }
    }

    // Electron IPC listener for control-player messages
    let unsubscribeIPC: (() => void) | null = null
    if (isElectron && (window as any).electronAPI?.onControlPlayer) {
      console.log('[FullscreenApp] Setting up Electron IPC listener')
      unsubscribeIPC = (window as any).electronAPI.onControlPlayer((action: string, data?: any) => {
        handleControl(action, data)
      })
    }

    // Browser postMessage listener (fallback for non-Electron environments)
    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return

      const { type, action, data } = event.data

      switch (type) {
        case 'INIT_STATE':
          setVideo(data.video)
          setIsPlaying(data.isPlaying)
          setCurrentTime(data.currentTime)
          setDuration(data.duration)
          setVolume(data.volume || 0.7)
          setEnableAudioNormalization(data.enableAudioNormalization || false)
          if (data.fadeDuration) setFadeDuration(data.fadeDuration)
          break

        case 'CONTROL':
          handleControl(action, data)
          break
      }
    }

    window.addEventListener('message', messageHandler)

    // Signal ready to main window
    window.parent.postMessage({ type: 'FULLSCREEN_READY' }, window.location.origin)

    return () => {
      window.removeEventListener('message', messageHandler)
      if (unsubscribeIPC) unsubscribeIPC()
    }
  }, [isElectron])

  // Sync state to Supabase when key values change
  useEffect(() => {
    if (supabaseReady) {
      syncState({
        status: isPlaying ? 'playing' : (video ? 'paused' : 'idle'),
        isPlaying,
        currentVideo: video,
        currentPosition: currentTime,
        volume,
        activeQueue,
        priorityQueue
      })
    }
  }, [supabaseReady, isPlaying, video, volume, activeQueue, priorityQueue, syncState])

  // Handle video end - notify Main Window to play next track
  const handleVideoEnd = () => {
    console.log('[FullscreenApp] Video ended, requesting next')
    
    // Sync idle state to Supabase
    if (supabaseReady) {
      syncState({ status: 'idle', isPlaying: false, currentVideo: null })
    }
    
    // Notify main window via IPC (for Electron)
    if (isElectron) {
      (window as any).electronAPI.onVideoEnded()
    }
    // Also notify via postMessage (for web/iframe mode)
    window.parent.postMessage({ type: 'VIDEO_END' }, window.location.origin)
  }

  // Handle state changes - sync back to Main Window for UI display
  const handleStateChange = (state: { currentVideo: Video | null, currentTime: number, duration: number, isPlaying: boolean }) => {
    // Sync to Supabase (debounced internally)
    if (supabaseReady) {
      syncState({
        currentVideo: state.currentVideo,
        currentPosition: state.currentTime,
        isPlaying: state.isPlaying,
        status: state.isPlaying ? 'playing' : (state.currentVideo ? 'paused' : 'idle')
      })
    }
    
    // Send state to Main Window via IPC
    if (isElectron) {
      (window as any).electronAPI.sendPlaybackState(state)
    }
    // Also notify via postMessage (for web/iframe mode)
    window.parent.postMessage({
      type: 'STATE_CHANGE',
      data: state
    }, window.location.origin)
  }

  return (
    <FullscreenPlayer
      video={video}
      isPlaying={isPlaying}
      currentTime={currentTime}
      duration={duration}
      volume={volume}
      onVideoEnd={handleVideoEnd}
      onStateChange={handleStateChange}
      enableAudioNormalization={enableAudioNormalization}
      preloadVideo={preloadVideo}
      fadeDuration={fadeDuration}
    />
  )
}

ReactDOM.createRoot(document.getElementById('fullscreen-root')!).render(
  <React.StrictMode>
    <FullscreenApp />
  </React.StrictMode>,
)