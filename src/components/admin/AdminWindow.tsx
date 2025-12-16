import React, { useState, useEffect } from 'react';
import { Sidebar, TabId } from '../Sidebar';
import { QueueManager } from './shared/QueueManager';
import { SearchInterface } from './shared/SearchInterface';
import { SettingsPanel } from './shared/SettingsPanel';
import { unifiedAPI } from '../../services/UnifiedAPI';
import type { SupabasePlayerState } from '../../types/supabase';
import type { Video } from '../../types';

export const AdminWindow: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('queue');
  const [currentPlaylist, setCurrentPlaylist] = useState<string>('');

  // Admin-specific state
  const [playerState, setPlayerState] = useState<SupabasePlayerState | null>(null);
  const [playlists, setPlaylists] = useState<Record<string, Video[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        // Set first playlist as current if available
        const playlistNames = Object.keys(playlistData.playlists);
        if (playlistNames.length > 0) {
          setCurrentPlaylist(playlistNames[0]);
        }
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

  const handlePlaylistSelect = (playlistName: string) => {
    setCurrentPlaylist(playlistName);
  };

  const renderTabContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ytm-accent mx-auto mb-4"></div>
            <p className="text-ytm-text-secondary text-lg">Loading Admin Console...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="max-w-md w-full bg-ytm-surface rounded-lg shadow p-6">
            <div className="text-center">
              <div className="text-red-500 text-5xl mb-4">⚠️</div>
              <h2 className="text-xl font-semibold text-ytm-text mb-2">Connection Error</h2>
              <p className="text-ytm-text-secondary mb-4">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2 bg-ytm-accent text-ytm-text rounded hover:bg-red-600 transition-colors"
              >
                Retry Connection
              </button>
            </div>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'queue':
        return (
          <div className="tab-content active">
            <QueueManager
              playerState={playerState}
              onCommand={handleCommand}
            />
          </div>
        );
      case 'search':
      case 'browse':
        return (
          <div className="tab-content active">
            <SearchInterface
              playlists={playlists}
              onCommand={handleCommand}
            />
          </div>
        );
      case 'settings':
        return (
          <div className="tab-content active">
            <div className="settings-container">
              <SettingsPanel onCommand={handleCommand} />
            </div>
          </div>
        );
      case 'tools':
        return (
          <div className="tab-content active">
            <div className="tools-container">
              <h1 className="text-2xl font-semibold text-ytm-text mb-6">Admin Tools</h1>
              <p className="text-ytm-text-secondary mb-8">
                Administrative tools and utilities for managing the DJAMMS system.
              </p>

              <div className="tools-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: '16px',
                marginTop: '24px'
              }}>
                {/* System Status Tool */}
                <div className="tool-card">
                  <div className="text-4xl mb-4">🔍</div>
                  <h3 className="text-lg font-semibold text-ytm-text mb-2">System Status</h3>
                  <p className="text-ytm-text-secondary text-sm">
                    View system health, connections, and performance metrics.
                  </p>
                </div>

                {/* Database Management Tool */}
                <div className="tool-card">
                  <div className="text-4xl mb-4">💾</div>
                  <h3 className="text-lg font-semibold text-ytm-text mb-2">Database Tools</h3>
                  <p className="text-ytm-text-secondary text-sm">
                    Manage database connections, run migrations, and view logs.
                  </p>
                </div>

                {/* Cache Management Tool */}
                <div className="tool-card">
                  <div className="text-4xl mb-4">🗂️</div>
                  <h3 className="text-lg font-semibold text-ytm-text mb-2">Cache Management</h3>
                  <p className="text-ytm-text-secondary text-sm">
                    Clear caches, refresh data, and optimize performance.
                  </p>
                </div>

                {/* Logs Viewer Tool */}
                <div className="tool-card">
                  <div className="text-4xl mb-4">📋</div>
                  <h3 className="text-lg font-semibold text-ytm-text mb-2">System Logs</h3>
                  <p className="text-ytm-text-secondary text-sm">
                    View application logs, error reports, and debug information.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return (
          <div className="tab-content active">
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-6xl mb-4">🎵</div>
                <h2 className="text-2xl font-semibold text-ytm-text mb-2">DJAMMS Admin Console</h2>
                <p className="text-ytm-text-secondary">Select a tab from the sidebar to get started.</p>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="app">
      {/* Left Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Expand Sidebar' : 'Hide Sidebar'}
        >
          {sidebarCollapsed ? (
            <span className="material-symbols-rounded">chevron_right</span>
          ) : (
            <span className="sidebar-toggle-text">Hide Sidebar</span>
          )}
        </button>

        <nav className="sidebar-nav">
          <div className="nav-section">
            {[
              { id: 'queue' as TabId, label: 'Queue', icon: 'queue_music' },
              { id: 'search' as TabId, label: 'Search', icon: 'search' },
              { id: 'browse' as TabId, label: 'Browse', icon: 'library_music' },
              { id: 'settings' as TabId, label: 'Settings', icon: 'settings' },
              { id: 'tools' as TabId, label: 'Tools', icon: 'build' }
            ].map(item => (
              <button
                key={item.id}
                className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => setActiveTab(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <span className="material-symbols-rounded">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Playlists Section */}
        <div className="playlist-section">
          <div className="playlist-header">
            <span className="playlist-header-label">PLAYLISTS</span>
          </div>
          <div className="playlist-list">
            {Object.keys(playlists).length === 0 ? (
              <div className="playlist-item" style={{ cursor: 'default' }}>
                <span className="playlist-icon material-symbols-rounded">folder</span>
                <span className="playlist-name text-ytm-text-secondary">
                  No playlists found
                </span>
              </div>
            ) : (
              Object.entries(playlists).map(([name, videos]) => (
                <div
                  key={name}
                  className={`playlist-item ${currentPlaylist === name ? 'selected' : ''}`}
                  onClick={() => handlePlaylistSelect(name)}
                  title={sidebarCollapsed ? name : undefined}
                >
                  <span className="playlist-icon material-symbols-rounded">queue_music</span>
                  <span className="playlist-name">{name}</span>
                  <span className="playlist-count">{videos.length}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="content-area">
        {renderTabContent()}
      </div>
    </div>
  );
};
