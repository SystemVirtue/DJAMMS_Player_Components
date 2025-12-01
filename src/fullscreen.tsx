// fullscreen.tsx - BROWSER COMPATIBLE VERSION
import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { FullscreenPlayer } from './components'
import { Video } from './types'

function FullscreenApp() {
  const [video, setVideo] = useState<Video | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.7)
  const [enableAudioNormalization, setEnableAudioNormalization] = useState(false)
  const [preloadVideo, setPreloadVideo] = useState<Video | null>(null)
  const [fadeDuration, setFadeDuration] = useState<number>(2.0)

  useEffect(() => {
    // Get initial video data from URL parameters
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

    // Listen for messages from main window
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
            case 'preload':
              // Parent requests preload of next video
              try {
                setPreloadVideo(data)
              } catch (error) {
                console.warn('Failed to set preload video', error)
              }
              break
            case 'updateSettings':
              // Parent updated settings (e.g., fade duration)
              try {
                if (data && typeof data.fadeDuration === 'number') {
                  setFadeDuration(data.fadeDuration)
                }
              } catch (error) {
                console.warn('Failed to apply settings update', error)
              }
              break
            case 'updateState':
              setVideo(data.video)
              setIsPlaying(data.isPlaying)
              setCurrentTime(data.currentTime)
              setDuration(data.duration)
              break
          }
          break
      }
    }

    window.addEventListener('message', messageHandler)

    // Signal ready to main window
    window.parent.postMessage({ type: 'FULLSCREEN_READY' }, window.location.origin)

    return () => {
      window.removeEventListener('message', messageHandler)
    }
  }, [])

  const handleVideoEnd = () => {
    // Notify main window that video ended
    window.parent.postMessage({ type: 'VIDEO_END' }, window.location.origin)
  }

  const handleStateChange = (state: { currentVideo: Video | null, currentTime: number, duration: number, isPlaying: boolean }) => {
    // Sync state back to main window
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