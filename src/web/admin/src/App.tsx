import React, { useState, useEffect } from 'react'
import { unifiedAPI } from '../../../services/UnifiedAPI'
import type { SupabasePlayerState } from '../../../types/supabase'
import type { Video } from '../../../types'

// Simple Web Admin Dashboard
export default function App() {
  const [playerState, setPlayerState] = useState<SupabasePlayerState | null>(null)
  const [playlists, setPlaylists] = useState<Record<string, Video[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const [playlistData, stateData] = await Promise.all([
          unifiedAPI.getPlaylists(),
          unifiedAPI.getPlayerState()
        ])

        setPlaylists(playlistData.playlists)
        setPlayerState(stateData)
      } catch (err) {
        console.error('Failed to load admin data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  useEffect(() => {
    const unsubscribe = unifiedAPI.subscribeToPlayerState((state) => {
      setPlayerState(state)
    })

    return unsubscribe
  }, [])

  const handleQuickAction = async (action: string) => {
    try {
      switch (action) {
        case 'toggle_playback':
          await unifiedAPI.sendCommand('toggle_playback')
          break
        case 'skip':
          await unifiedAPI.sendCommand('skip')
          break
        case 'shuffle':
          await unifiedAPI.sendCommand('shuffle')
          break
        case 'clear_queue':
          await unifiedAPI.sendCommand('queue_clear')
          break
        case 'volume_up':
          await unifiedAPI.sendCommand('volume_set', {
            volume: Math.min(100, (playerState?.volume || 0.8) * 100 + 10) / 100
          })
          break
        case 'volume_down':
          await unifiedAPI.sendCommand('volume_set', {
            volume: Math.max(0, (playerState?.volume || 0.8) * 100 - 10) / 100
          })
          break
      }
    } catch (err) {
      console.error('Quick action failed:', err)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-4"></div>
          <p className="text-gray-400 text-lg">Loading Admin Console...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="max-w-md w-full bg-gray-900 rounded-lg shadow p-6">
          <div className="text-center">
            <div className="text-red-500 text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-white mb-2">Connection Error</h2>
            <p className="text-gray-400 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Professional Header */}
      <header className="bg-gray-900 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
                <span className="material-symbols-rounded text-white text-xl">music_note</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">DJAMMS Admin Console</h1>
                <p className="text-sm text-gray-400">Professional Media Player Management</p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-400">
                Connected to {unifiedAPI.currentPlayerId || 'Unknown Player'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          {/* Dashboard Overview */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">System Dashboard</h2>
            <p className="text-gray-400">Monitor and control your DJAMMS media player system</p>
          </div>

          {/* Status Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  playerState?.status === 'playing' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                }`}>
                  <span className="material-symbols-rounded text-2xl">play_circle</span>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  playerState?.status === 'playing' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {playerState?.status || 'Unknown'}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Player Status</h3>
              <p className="text-2xl font-bold text-white mb-1">
                {playerState?.status === 'playing' ? 'Active' : playerState?.status === 'paused' ? 'Paused' : 'Stopped'}
              </p>
            </div>

            <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center">
                  <span className="material-symbols-rounded text-2xl">queue_music</span>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                  Active
                </span>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Queue Length</h3>
              <p className="text-2xl font-bold text-white mb-1">{playerState?.queue?.length || 0} tracks</p>
            </div>

            <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center">
                  <span className="material-symbols-rounded text-2xl">volume_up</span>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                  Normal
                </span>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Volume Level</h3>
              <p className="text-2xl font-bold text-white mb-1">{Math.round((playerState?.volume || 0) * 100)}%</p>
            </div>

            <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  unifiedAPI.currentPlayerId ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  <span className="material-symbols-rounded text-2xl">wifi</span>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  unifiedAPI.currentPlayerId ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {unifiedAPI.currentPlayerId ? 'Online' : 'Offline'}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Connection</h3>
              <p className="text-2xl font-bold text-white mb-1">{unifiedAPI.currentPlayerId || 'Disconnected'}</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-700 mb-8">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <span className="material-symbols-rounded mr-2">bolt</span>
              Quick Actions
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: 'play_arrow', label: 'Play/Pause' },
                { icon: 'skip_next', label: 'Skip Track' },
                { icon: 'shuffle', label: 'Shuffle' },
                { icon: 'clear_all', label: 'Clear Queue' },
                { icon: 'volume_up', label: 'Volume Up' },
                { icon: 'volume_down', label: 'Volume Down' }
              ].map((item, index) => (
                <button
                  key={index}
                  onClick={() => handleQuickAction(item.icon === 'play_arrow' ? 'toggle_playback' :
                                                   item.icon === 'skip_next' ? 'skip' :
                                                   item.icon === 'shuffle' ? 'shuffle' :
                                                   item.icon === 'clear_all' ? 'clear_queue' :
                                                   item.icon === 'volume_up' ? 'volume_up' : 'volume_down')}
                  className="flex flex-col items-center justify-center p-4 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-600 transition-colors group"
                >
                  <span className="material-symbols-rounded text-2xl mb-2 group-hover:text-red-400 transition-colors">{item.icon}</span>
                  <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Media Library */}
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Media Library</h3>
            <div className="space-y-2">
              {Object.keys(playlists).length === 0 ? (
                <div className="text-gray-400">No playlists found</div>
              ) : (
                Object.entries(playlists).map(([name, videos]) => (
                  <div key={name} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <span className="material-symbols-rounded text-gray-400">queue_music</span>
                      <span className="text-white font-medium">{name}</span>
                    </div>
                    <span className="text-gray-400 text-sm">{videos.length} tracks</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}