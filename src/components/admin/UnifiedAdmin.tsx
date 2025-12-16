import React, { useState, useEffect } from 'react';
import { unifiedAPI } from '../../services/UnifiedAPI';
import { usePlatformFeatures } from '../../hooks/usePlatformFeatures';
import { QueueManager } from './shared/QueueManager';
import { SearchInterface } from './shared/SearchInterface';
import { SettingsPanel } from './shared/SettingsPanel';
import type { SupabasePlayerState } from '../../types/supabase';
import type { Video } from '../../types';

type TabId = 'queue' | 'search' | 'settings';

export const UnifiedAdmin: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('queue');
  const [playerState, setPlayerState] = useState<SupabasePlayerState | null>(null);
  const [playlists, setPlaylists] = useState<Record<string, Video[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const platform = usePlatformFeatures();

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [playlistData, stateData] = await Promise.all([
          unifiedAPI.getPlaylists(),
          unifiedAPI.getPlayerState()
        ]);

        setPlaylists(playlistData.playlists);
        setPlayerState(stateData);
      } catch (err) {
        console.error('Failed to load admin data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubscribe = unifiedAPI.subscribeToPlayerState((state) => {
      setPlayerState(state);
    });

    return unsubscribe;
  }, []);

  const handleCommand = async (command: string, data?: any) => {
    try {
      await unifiedAPI.sendCommand(command, data);
    } catch (err) {
      console.error('Command failed:', err);
      setError(`Command failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (isLoading) {
    return (
      <div className="unified-admin-loading min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading Admin Console...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="unified-admin-error min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-6">
          <div className="text-center">
            <div className="text-red-500 text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Connection Error</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="unified-admin min-h-screen bg-gray-100">
      <header className="admin-header bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900">DJAMMS Admin Console</h1>
              {platform.showConnectionStatus && (
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">
                    Player: {unifiedAPI.currentPlayerId}
                  </span>
                </div>
              )}
            </div>

            <nav className="flex space-x-1">
              <button
                onClick={() => setActiveTab('queue')}
                className={`px-4 py-2 rounded-t-md font-medium transition-colors ${
                  activeTab === 'queue'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Queue
              </button>
              <button
                onClick={() => setActiveTab('search')}
                className={`px-4 py-2 rounded-t-md font-medium transition-colors ${
                  activeTab === 'search'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Search
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-4 py-2 rounded-t-md font-medium transition-colors ${
                  activeTab === 'settings'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Settings
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'queue' && (
          <QueueManager
            playerState={playerState}
            onCommand={handleCommand}
          />
        )}
        {activeTab === 'search' && (
          <SearchInterface
            playlists={playlists}
            onCommand={handleCommand}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsPanel
            onCommand={handleCommand}
          />
        )}
      </main>
    </div>
  );
};
