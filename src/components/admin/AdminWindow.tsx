import React, { useState, useEffect } from 'react';
import { Sidebar, TabId } from '../Sidebar';
import { QueueManager } from './shared/QueueManager';
import { SearchInterface } from './shared/SearchInterface';
import { SettingsPanel } from './shared/SettingsPanel';
import { unifiedAPI } from '../../services/UnifiedAPI';
import type { SupabasePlayerState } from '../../types/supabase';
import type { Video } from '../../types';

// Admin Dashboard Components
const SystemStatusCard = ({ title, status, value, icon, color = 'blue' }: {
  title: string;
  status: string;
  value: string;
  icon: string;
  color?: string;
}) => (
  <div className={`bg-ytm-surface rounded-lg p-6 border border-ytm-divider hover:bg-ytm-surface-hover transition-colors`}>
    <div className="flex items-center justify-between mb-4">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
        color === 'green' ? 'bg-green-500/20 text-green-400' :
        color === 'red' ? 'bg-red-500/20 text-red-400' :
        color === 'yellow' ? 'bg-yellow-500/20 text-yellow-400' :
        'bg-blue-500/20 text-blue-400'
      }`}>
        <span className="material-symbols-rounded text-2xl">{icon}</span>
      </div>
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
        status === 'Online' ? 'bg-green-500/20 text-green-400' :
        status === 'Offline' ? 'bg-red-500/20 text-red-400' :
        status === 'Loading' ? 'bg-yellow-500/20 text-yellow-400' :
        'bg-blue-500/20 text-blue-400'
      }`}>
        {status}
      </span>
    </div>
    <h3 className="text-lg font-semibold text-ytm-text mb-2">{title}</h3>
    <p className="text-2xl font-bold text-ytm-text mb-1">{value}</p>
  </div>
);

const ActivityFeed = ({ activities }: { activities: Array<{ time: string; action: string; user: string }> }) => (
  <div className="bg-ytm-surface rounded-lg p-6 border border-ytm-divider">
    <h3 className="text-lg font-semibold text-ytm-text mb-4 flex items-center">
      <span className="material-symbols-rounded mr-2">history</span>
      Recent Activity
    </h3>
    <div className="space-y-3">
      {activities.map((activity, index) => (
        <div key={index} className="flex items-start space-x-3 py-2">
          <div className="w-2 h-2 bg-ytm-accent rounded-full mt-2 flex-shrink-0"></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ytm-text-secondary">
              <span className="font-medium text-ytm-text">{activity.user}</span>
              {' '}{activity.action}
            </p>
            <p className="text-xs text-ytm-text-secondary mt-1">{activity.time}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const QuickActions = ({ onAction }: { onAction: (action: string) => void }) => (
  <div className="bg-ytm-surface rounded-lg p-6 border border-ytm-divider">
    <h3 className="text-lg font-semibold text-ytm-text mb-4 flex items-center">
      <span className="material-symbols-rounded mr-2">bolt</span>
      Quick Actions
    </h3>
    <div className="grid grid-cols-2 gap-3">
      {[
        { icon: 'play_arrow', label: 'Play/Pause', action: 'toggle_playback' },
        { icon: 'skip_next', label: 'Skip Track', action: 'skip' },
        { icon: 'shuffle', label: 'Shuffle', action: 'shuffle' },
        { icon: 'clear_all', label: 'Clear Queue', action: 'clear_queue' },
        { icon: 'volume_up', label: 'Volume Up', action: 'volume_up' },
        { icon: 'volume_down', label: 'Volume Down', action: 'volume_down' }
      ].map((item) => (
        <button
          key={item.action}
          onClick={() => onAction(item.action)}
          className="flex flex-col items-center justify-center p-4 bg-ytm-surface-hover hover:bg-ytm-surface rounded-lg border border-ytm-divider transition-colors group"
        >
          <span className="material-symbols-rounded text-2xl mb-2 group-hover:text-ytm-accent transition-colors">{item.icon}</span>
          <span className="text-sm font-medium text-ytm-text-secondary group-hover:text-ytm-text transition-colors">{item.label}</span>
        </button>
      ))}
    </div>
  </div>
);

export const AdminWindow: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('queue');
  const [currentPlaylist, setCurrentPlaylist] = useState<string>('');

  // Admin-specific state
  const [playerState, setPlayerState] = useState<SupabasePlayerState | null>(null);
  const [playlists, setPlaylists] = useState<Record<string, Video[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mock data for dashboard
  const activities = [
    { time: '2 minutes ago', action: 'added 3 songs to queue', user: 'Admin' },
    { time: '5 minutes ago', action: 'changed playlist to "Electronic"', user: 'Admin' },
    { time: '12 minutes ago', action: 'adjusted volume to 75%', user: 'Admin' },
    { time: '18 minutes ago', action: 'enabled shuffle mode', user: 'Admin' },
    { time: '25 minutes ago', action: 'connected to player DJAMMS_DEMO', user: 'System' }
  ];

  const handleQuickAction = async (action: string) => {
    try {
      switch (action) {
        case 'toggle_playback':
          await unifiedAPI.sendCommand('toggle_playback');
          break;
        case 'skip':
          await unifiedAPI.sendCommand('skip');
          break;
        case 'shuffle':
          await unifiedAPI.sendCommand('shuffle');
          break;
        case 'clear_queue':
          await unifiedAPI.sendCommand('queue_clear');
          break;
        case 'volume_up':
          await unifiedAPI.sendCommand('volume_set', { volume: Math.min(100, (playerState?.volume || 0.8) * 100 + 10) / 100 });
          break;
        case 'volume_down':
          await unifiedAPI.sendCommand('volume_set', { volume: Math.max(0, (playerState?.volume || 0.8) * 100 - 10) / 100 });
          break;
      }
    } catch (err) {
      console.error('Quick action failed:', err);
    }
  };

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
    <div className="app min-h-screen bg-ytm-bg">
      {/* Professional Header */}
      <header className="bg-ytm-surface border-b border-ytm-divider px-6 py-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-ytm-accent rounded-lg flex items-center justify-center">
                <span className="material-symbols-rounded text-white text-xl">music_note</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-ytm-text">DJAMMS Admin Console</h1>
                <p className="text-sm text-ytm-text-secondary">Professional Media Player Management</p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            {/* Connection Status */}
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-ytm-text-secondary">
                Connected to {unifiedAPI.currentPlayerId || 'Unknown Player'}
              </span>
            </div>

            {/* System Status Indicators */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1 text-sm">
                <span className="material-symbols-rounded text-green-400">wifi</span>
                <span className="text-ytm-text-secondary">Online</span>
              </div>
              <div className="flex items-center space-x-1 text-sm">
                <span className="material-symbols-rounded text-blue-400">sync</span>
                <span className="text-ytm-text-secondary">Synced</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Left Sidebar */}
        <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} bg-ytm-surface border-r border-ytm-divider`}>
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
                { id: 'queue' as TabId, label: 'Queue Management', icon: 'queue_music' },
                { id: 'search' as TabId, label: 'Search & Browse', icon: 'search' },
                { id: 'browse' as TabId, label: 'Library Browser', icon: 'library_music' },
                { id: 'settings' as TabId, label: 'System Settings', icon: 'settings' },
                { id: 'tools' as TabId, label: 'Admin Tools', icon: 'build' }
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
              <span className="playlist-header-label">MEDIA LIBRARY</span>
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
        <div className="flex-1 flex flex-col">
          {activeTab === 'queue' ? (
            <div className="flex-1 p-6">
              {renderTabContent()}
            </div>
          ) : activeTab === 'search' || activeTab === 'browse' ? (
            <div className="flex-1 p-6">
              {renderTabContent()}
            </div>
          ) : activeTab === 'settings' ? (
            <div className="flex-1 p-6">
              {renderTabContent()}
            </div>
          ) : activeTab === 'tools' ? (
            <div className="flex-1 p-6">
              <div className="max-w-7xl mx-auto">
                {/* Dashboard Overview */}
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-ytm-text mb-2">System Dashboard</h2>
                  <p className="text-ytm-text-secondary">Monitor and control your DJAMMS media player system</p>
                </div>

                {/* Status Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  <SystemStatusCard
                    title="Player Status"
                    status={playerState?.status || 'Unknown'}
                    value={playerState?.status === 'playing' ? 'Active' : playerState?.status === 'paused' ? 'Paused' : 'Stopped'}
                    icon="play_circle"
                    color={playerState?.status === 'playing' ? 'green' : 'yellow'}
                  />
                  <SystemStatusCard
                    title="Queue Length"
                    status="Active"
                    value={`${playerState?.queue?.length || 0} tracks`}
                    icon="queue_music"
                    color="blue"
                  />
                  <SystemStatusCard
                    title="Volume Level"
                    status="Normal"
                    value={`${Math.round((playerState?.volume || 0) * 100)}%`}
                    icon="volume_up"
                    color="blue"
                  />
                  <SystemStatusCard
                    title="Connection"
                    status={unifiedAPI.currentPlayerId ? 'Online' : 'Offline'}
                    value={unifiedAPI.currentPlayerId || 'Disconnected'}
                    icon="wifi"
                    color={unifiedAPI.currentPlayerId ? 'green' : 'red'}
                  />
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Quick Actions */}
                  <div className="lg:col-span-1">
                    <QuickActions onAction={handleQuickAction} />
                  </div>

                  {/* Activity Feed */}
                  <div className="lg:col-span-2">
                    <ActivityFeed activities={activities} />
                  </div>
                </div>

                {/* Advanced Tools Section */}
                <div className="mt-8">
                  <h3 className="text-xl font-semibold text-ytm-text mb-4">Advanced Administration</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      {
                        icon: 'database',
                        title: 'Database Management',
                        description: 'Manage media database, indexes, and cleanup operations',
                        action: 'db_management'
                      },
                      {
                        icon: 'backup',
                        title: 'System Backup',
                        description: 'Create backups of playlists, settings, and media library',
                        action: 'backup'
                      },
                      {
                        icon: 'analytics',
                        title: 'Performance Analytics',
                        description: 'View system performance metrics and usage statistics',
                        action: 'analytics'
                      },
                      {
                        icon: 'security',
                        title: 'Security Settings',
                        description: 'Configure access controls and security policies',
                        action: 'security'
                      },
                      {
                        icon: 'bug_report',
                        title: 'System Diagnostics',
                        description: 'Run diagnostic tests and generate system reports',
                        action: 'diagnostics'
                      },
                      {
                        icon: 'settings_system_daydream',
                        title: 'Advanced Configuration',
                        description: 'Fine-tune system parameters and advanced settings',
                        action: 'advanced_config'
                      }
                    ].map((tool) => (
                      <div
                        key={tool.action}
                        className="bg-ytm-surface rounded-lg p-6 border border-ytm-divider hover:bg-ytm-surface-hover transition-colors cursor-pointer group"
                        onClick={() => console.log(`Tool clicked: ${tool.action}`)}
                      >
                        <div className="flex items-center space-x-3 mb-3">
                          <div className="w-10 h-10 bg-ytm-accent/20 rounded-lg flex items-center justify-center group-hover:bg-ytm-accent/30 transition-colors">
                            <span className="material-symbols-rounded text-ytm-accent">{tool.icon}</span>
                          </div>
                          <h4 className="font-semibold text-ytm-text group-hover:text-ytm-accent transition-colors">{tool.title}</h4>
                        </div>
                        <p className="text-sm text-ytm-text-secondary leading-relaxed">{tool.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 p-6">
              {renderTabContent()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
