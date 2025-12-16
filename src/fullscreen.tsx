// fullscreen.tsx - THE ONLY PLAYER - handles all audio/video playback
import React, { useState, useEffect, useRef, useMemo } from 'react'
import ReactDOM from 'react-dom/client'
import { FullscreenPlayer } from './components'
import { FullscreenPlayerRef } from './components/FullscreenPlayer'
import { Video } from './types'
import { useSupabase } from './hooks/useSupabase'
import { getSupabaseService } from './services/SupabaseService'
import { QueueVideoItem } from './types/supabase'

// Overlay settings type
interface OverlaySettings {
  showNowPlaying: boolean;
  nowPlayingSize: number;
  nowPlayingX: number;
  nowPlayingY: number;
  nowPlayingOpacity: number;
  showComingUp: boolean;
  comingUpSize: number;
  comingUpX: number;
  comingUpY: number;
  comingUpOpacity: number;
  showWatermark: boolean;
  watermarkImage: string;
  watermarkSize: number;
  watermarkX: number;
  watermarkY: number;
  watermarkOpacity: number;
}

function FullscreenApp() {
  const [video, setVideo] = useState<Video | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.7)
  const [enableAudioNormalization, setEnableAudioNormalization] = useState(false)
  const [preloadVideo, setPreloadVideo] = useState<Video | null>(null)
  const [fadeDuration, setFadeDuration] = useState<number>(2.0)
  const [seekToPosition, setSeekToPosition] = useState<number | null>(null)
  
  // Overlay settings - defaults match PlayerWindow
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>({
    showNowPlaying: true,
    nowPlayingSize: 100,
    nowPlayingX: 5,
    nowPlayingY: 85,
    nowPlayingOpacity: 100,
    showComingUp: true,
    comingUpSize: 100,
    comingUpX: 5,
    comingUpY: 95,
    comingUpOpacity: 100,
    showWatermark: true,
    watermarkImage: './Obie_neon_no_BG.png',
    watermarkSize: 100,
    watermarkX: 90,
    watermarkY: 10,
    watermarkOpacity: 80
  })
  
  // Track queues for Supabase sync
  const [activeQueue, setActiveQueue] = useState<Video[]>([])
  const [priorityQueue, setPriorityQueue] = useState<Video[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  
  // Ref to track current duration for debug seek
  const durationRef = useRef<number>(0)
  
  // Ref to access FullscreenPlayer's skipWithFade method
  const fullscreenPlayerRef = useRef<FullscreenPlayerRef>(null)

  // Check if we're in Electron
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI
  
  // Supabase integration - listens for remote commands
  // NOTE: Skip is NOT handled here - PlayerWindow manages the queue and sends
  // play commands via IPC. Handling skip here would cause double-skip.
  // NOTE: Play/Pause/Resume are handled by PlayerWindow to avoid duplicate command execution
  // Fullscreen window only receives video data via IPC from PlayerWindow
  const { isInitialized: supabaseReady } = useSupabase({
    autoInit: true
    // Intentionally NOT registering play/pause/resume/volume/seek handlers here
    // These are handled by PlayerWindow to prevent duplicate command execution
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
          // Log video details including source URL
          console.log('🚨 [FullscreenApp] ========== RECEIVED PLAY COMMAND ==========');
          console.log('🚨 [FullscreenApp] Video title:', data?.title);
          console.log('🚨 [FullscreenApp] Video src:', data?.src);
          console.log('🚨 [FullscreenApp] Video path:', data?.path);
          console.log('🚨 [FullscreenApp] Video ID:', data?.id);
          console.log('🚨 [FullscreenApp] Full video object:', JSON.stringify(data, null, 2));
          console.log('🚨 [FullscreenApp] ===========================================');
          
          // Ensure src is set correctly (prioritize src over path)
          if (data && !data.src && data.path) {
            console.warn('[FullscreenApp] Video has path but no src, using path as src');
            data.src = data.path;
          }
          
          setVideo(data)
          setIsPlaying(true)
          break
        case 'pause':
          setIsPlaying(false)
          break
        case 'resume':
          setIsPlaying(true)
          break
        case 'skip':
          // User-initiated skip - fade out current video, then trigger next
          // The skipWithFade will call onVideoEnd when fade completes
          console.log('[FullscreenApp] Skip command - fading out current video')
          if (fullscreenPlayerRef.current) {
            fullscreenPlayerRef.current.skipWithFade()
          } else {
            // Fallback: if ref not available, just trigger video end immediately
            console.warn('[FullscreenApp] Skip: No player ref, triggering video end directly')
            handleVideoEnd()
          }
          break
        case 'setVolume':
          if (typeof data === 'number') {
            setVolume(data)
          }
          break
        case 'seekTo':
          // Seek to specific position (in seconds)
          if (typeof data === 'number' && data >= 0) {
            console.log(`[FullscreenApp] Seek command received - seeking to ${data.toFixed(1)}s`);
            setSeekToPosition(data);
          } else {
            console.warn('[FullscreenApp] Invalid seek position:', data);
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
            if (typeof data.queueIndex === 'number') setQueueIndex(data.queueIndex)
          }
          break
        case 'updateOverlaySettings':
          // Receive overlay settings from main window
          if (data) {
            console.log('[FullscreenApp] Received overlay settings:', data)
            setOverlaySettings(prev => ({
              ...prev,
              ...data
            }))
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
        case 'debugSkipToEnd':
          // Debug feature: seek to 15 seconds before end of video to test crossfade
          const currentDuration = durationRef.current
          console.log(`[FullscreenApp] Debug skip to end: durationRef.current = ${currentDuration}`)
          if (currentDuration <= 0) {
            console.log('[FullscreenApp] Debug skip to end: duration not available yet, ignoring')
            break
          }
          if (currentDuration > 15) {
            const seekPosition = currentDuration - 15
            console.log(`[FullscreenApp] Debug skip to end: seeking to ${seekPosition.toFixed(1)}s (duration: ${currentDuration.toFixed(1)}s)`)
            setSeekToPosition(seekPosition)
          } else {
            // Short video - seek to 2 seconds before end, but never to 0 (would restart)
            const seekPosition = Math.max(1, currentDuration - 2)
            console.log(`[FullscreenApp] Debug skip to end: video short, seeking to ${seekPosition.toFixed(1)}s`)
            setSeekToPosition(seekPosition)
          }
          break
      }
    }

    // Electron IPC listener for control-player messages
    let unsubscribeIPC: (() => void) | null = null
    if (isElectron && (window as any).electronAPI?.onControlPlayer) {
      console.log('[FullscreenApp] Setting up Electron IPC listener')
      unsubscribeIPC = (window as any).electronAPI.onControlPlayer((action: string, data?: any) => {
        if (action === 'resize') {
          // Handle window resize for windowed mode
          const mode = data?.mode || 'fullscreen'
          console.log('[FullscreenApp] Resize event:', mode)
          // Video players will automatically resize to fit window
          // Force a re-layout
          window.dispatchEvent(new Event('resize'))
        } else {
          
          handleControl(action, data)
        }
      })
    }
    
    // Handle window resize events (for windowed mode)
    const handleWindowResize = () => {
      // Video players should automatically resize to fit window
      // This ensures proper sizing when window is resized
      const videoElements = document.querySelectorAll('video')
      videoElements.forEach(video => {
        // Video elements with object-fit: contain will automatically resize
        // Just ensure they're visible
        if (video.style.display === 'none') {
          video.style.display = 'block'
        }
      })
    }
    
    window.addEventListener('resize', handleWindowResize)

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

    // Debug keyboard shortcut: Shift+\ (|) to seek to (duration - 15 seconds)
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      // Check for Shift+\ (which produces '|' on most keyboards)
      // Key code is 'Backslash' and shift key is pressed, or key is '|'
      if (e.key === '|' || (e.key === '\\' && e.shiftKey) || (e.code === 'Backslash' && e.shiftKey)) {
        e.preventDefault()
        const currentDuration = durationRef.current || duration
        if (currentDuration > 0) {
          // Seek to 15 seconds before end, but ensure we're at least 2 seconds from the end
          // (useVideoPlayer will enforce a 2-second buffer to prevent immediate end events)
          const MIN_BUFFER = 2.0
          const seekPosition = Math.max(0, Math.min(currentDuration - 15, currentDuration - MIN_BUFFER))
          console.log(`[FullscreenApp] 🐛 DEBUG: Shift+\\ pressed - seeking to ${seekPosition.toFixed(1)}s (duration: ${currentDuration.toFixed(1)}s, buffer: ${MIN_BUFFER}s)`)
          setSeekToPosition(seekPosition)
        } else {
          console.warn('[FullscreenApp] 🐛 DEBUG: Shift+\\ pressed but video duration not available yet')
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    // Signal ready to main window
    window.parent.postMessage({ type: 'FULLSCREEN_READY' }, window.location.origin)

    return () => {
      window.removeEventListener('message', messageHandler)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleWindowResize)
      if (unsubscribeIPC) unsubscribeIPC()
    }
  }, [isElectron, duration])

  // Sync playback state to Supabase when key values change
  // NOTE: Queue data is synced by PlayerWindow (source of truth) - don't sync here to avoid overwrites
  useEffect(() => {
    if (supabaseReady) {
      syncState({
        status: isPlaying ? 'playing' : (video ? 'paused' : 'idle'),
        isPlaying,
        currentVideo: video,
        currentPosition: currentTime,
        volume
        // activeQueue and priorityQueue intentionally omitted - PlayerWindow is source of truth
      })
    }
  }, [supabaseReady, isPlaying, video, volume, syncState])

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
  
  // Keep durationRef in sync with duration state
  useEffect(() => {
    if (duration > 0) {
      durationRef.current = duration
    }
  }, [duration])

  // Handle state changes - sync back to Main Window for UI display
  const handleStateChange = (state: { currentVideo: Video | null, currentTime: number, duration: number, isPlaying: boolean }) => {
    // Track duration in ref for debug skip feature
    if (state.duration > 0) {
      durationRef.current = state.duration
    }
    
    // Note: Don't sync to Supabase here - PlayerWindow handles Supabase sync
    // This prevents partial updates that overwrite queue data
    
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
  
  // Clear seek position after seek completes
  const handleSeekComplete = () => {
    setSeekToPosition(null)
  }

  // Calculate upcoming videos: priority queue first, then next 3 from active queue
  const upcomingVideos = useMemo(() => {
    const upcoming: Video[] = []
    
    // Add all priority queue videos first
    upcoming.push(...priorityQueue)
    
    // Then add next 3 videos from active queue (after current index)
    if (activeQueue.length > 0) {
      for (let i = 1; i <= 3; i++) {
        const nextIdx = (queueIndex + i) % activeQueue.length
        // Don't add if we've looped back to current or already have enough
        if (upcoming.length < 6 && activeQueue[nextIdx]) {
          upcoming.push(activeQueue[nextIdx])
        }
      }
    }
    
    return upcoming
  }, [priorityQueue, activeQueue, queueIndex])

  return (
    <FullscreenPlayer
      ref={fullscreenPlayerRef}
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
      seekToPosition={seekToPosition}
      onSeekComplete={handleSeekComplete}
      overlaySettings={overlaySettings}
      upcomingVideos={upcomingVideos}
      priorityQueue={priorityQueue}
      activeQueue={activeQueue}
      queueIndex={queueIndex}
    />
  )
}

ReactDOM.createRoot(document.getElementById('fullscreen-root')!).render(
  <React.StrictMode>
    <FullscreenApp />
  </React.StrictMode>,
)