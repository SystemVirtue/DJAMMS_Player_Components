import React, { useState } from 'react';
import { unifiedAPI } from '../../../services/UnifiedAPI';
import { usePlatformFeatures } from '../../../hooks/usePlatformFeatures';

interface SettingsPanelProps {
  onCommand: (command: string, data?: any) => Promise<void>;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onCommand }) => {
  const platform = usePlatformFeatures();
  const [settings, setSettings] = useState({
    autoShuffle: false,
    crossfadeEnabled: true,
    crossfadeDuration: 3,
    volume: 80
  });

  const handleSettingChange = async (setting: string, value: any) => {
    const newSettings = { ...settings, [setting]: value };
    setSettings(newSettings);
    await onCommand('setting_update', { setting, value });
  };

  const handlePlayerIdChange = (playerId: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('djamms_player_id', playerId);
      // Reload to reconnect with new player ID
      window.location.reload();
    }
  };

  return (
    <div className="settings-panel bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Settings</h2>

      <div className="space-y-6">
        {/* Universal Settings */}
        <div className="setting-group">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Playback</h3>
          <div className="space-y-4">
            <div className="flex items-center">
              <input
                id="autoShuffle"
                type="checkbox"
                checked={settings.autoShuffle}
                onChange={(e) => handleSettingChange('autoShuffle', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="autoShuffle" className="ml-2 block text-sm text-gray-900">
                Auto-shuffle playlists
              </label>
            </div>

            <div className="flex items-center">
              <input
                id="crossfadeEnabled"
                type="checkbox"
                checked={settings.crossfadeEnabled}
                onChange={(e) => handleSettingChange('crossfadeEnabled', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="crossfadeEnabled" className="ml-2 block text-sm text-gray-900">
                Enable crossfading
              </label>
            </div>

            <div>
              <label htmlFor="crossfadeDuration" className="block text-sm font-medium text-gray-700 mb-1">
                Crossfade Duration: {settings.crossfadeDuration}s
              </label>
              <input
                id="crossfadeDuration"
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={settings.crossfadeDuration}
                onChange={(e) => handleSettingChange('crossfadeDuration', parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <label htmlFor="volume" className="block text-sm font-medium text-gray-700 mb-1">
                Default Volume: {settings.volume}%
              </label>
              <input
                id="volume"
                type="range"
                min="0"
                max="100"
                value={settings.volume}
                onChange={(e) => handleSettingChange('volume', parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Electron-only Settings */}
        {platform.showSystemSettings && (
          <div className="setting-group">
            <h3 className="text-lg font-medium text-gray-900 mb-4">System</h3>
            <div className="space-y-3">
              <button
                onClick={() => onCommand('open_file_browser')}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              >
                Select Music Directory
              </button>
              <button
                onClick={() => onCommand('refresh_library')}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Refresh Music Library
              </button>
              <button
                onClick={() => onCommand('show_dev_tools')}
                className="w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
              >
                Open Developer Tools
              </button>
            </div>
          </div>
        )}

        {/* Web-only Settings */}
        {platform.showPlayerIdSelector && (
          <div className="setting-group">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Connection</h3>
            <div>
              <label htmlFor="playerId" className="block text-sm font-medium text-gray-700 mb-1">
                Player ID
              </label>
              <input
                id="playerId"
                type="text"
                value={unifiedAPI.currentPlayerId}
                onChange={(e) => handlePlayerIdChange(e.target.value)}
                placeholder="Enter Player ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-sm text-gray-500">
                Connect to a specific DJAMMS player instance
              </p>
            </div>
          </div>
        )}

        {/* Connection Status */}
        {platform.showConnectionStatus && (
          <div className="setting-group">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Status</h3>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                <span className="text-green-800 font-medium">Connected</span>
              </div>
              <p className="text-green-600 text-sm mt-1">
                Real-time sync active with player: {unifiedAPI.currentPlayerId}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
import React, { useState } from 'react';
import { unifiedAPI } from '../../../services/UnifiedAPI';
import { usePlatformFeatures } from '../../../hooks/usePlatformFeatures';

interface SettingsPanelProps {
  onCommand: (command: string, data?: any) => Promise<void>;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onCommand }) => {
  const platform = usePlatformFeatures();
  const [settings, setSettings] = useState({
    autoShuffle: false,
    crossfadeEnabled: true,
    crossfadeDuration: 3,
    volume: 80
  });

  const handleSettingChange = async (setting: string, value: any) => {
    const newSettings = { ...settings, [setting]: value };
    setSettings(newSettings);
    await onCommand('setting_update', { setting, value });
  };

  const handlePlayerIdChange = (playerId: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('djamms_player_id', playerId);
      // Reload to reconnect with new player ID
      window.location.reload();
    }
  };

  return (
    <div className="settings-panel bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Settings</h2>

      <div className="space-y-6">
        {/* Universal Settings */}
        <div className="setting-group">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Playback</h3>
          <div className="space-y-4">
            <div className="flex items-center">
              <input
                id="autoShuffle"
                type="checkbox"
                checked={settings.autoShuffle}
                onChange={(e) => handleSettingChange('autoShuffle', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="autoShuffle" className="ml-2 block text-sm text-gray-900">
                Auto-shuffle playlists
              </label>
            </div>

            <div className="flex items-center">
              <input
                id="crossfadeEnabled"
                type="checkbox"
                checked={settings.crossfadeEnabled}
                onChange={(e) => handleSettingChange('crossfadeEnabled', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="crossfadeEnabled" className="ml-2 block text-sm text-gray-900">
                Enable crossfading
              </label>
            </div>

            <div>
              <label htmlFor="crossfadeDuration" className="block text-sm font-medium text-gray-700 mb-1">
                Crossfade Duration: {settings.crossfadeDuration}s
              </label>
              <input
                id="crossfadeDuration"
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={settings.crossfadeDuration}
                onChange={(e) => handleSettingChange('crossfadeDuration', parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <label htmlFor="volume" className="block text-sm font-medium text-gray-700 mb-1">
                Default Volume: {settings.volume}%
              </label>
              <input
                id="volume"
                type="range"
                min="0"
                max="100"
                value={settings.volume}
                onChange={(e) => handleSettingChange('volume', parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Electron-only Settings */}
        {platform.showSystemSettings && (
          <div className="setting-group">
            <h3 className="text-lg font-medium text-gray-900 mb-4">System</h3>
            <div className="space-y-3">
              <button
                onClick={() => onCommand('open_file_browser')}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              >
                Select Music Directory
              </button>
              <button
                onClick={() => onCommand('refresh_library')}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Refresh Music Library
              </button>
              <button
                onClick={() => onCommand('show_dev_tools')}
                className="w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
              >
                Open Developer Tools
              </button>
            </div>
          </div>
        )}

        {/* Web-only Settings */}
        {platform.showPlayerIdSelector && (
          <div className="setting-group">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Connection</h3>
            <div>
              <label htmlFor="playerId" className="block text-sm font-medium text-gray-700 mb-1">
                Player ID
              </label>
              <input
                id="playerId"
                type="text"
                value={unifiedAPI.currentPlayerId}
                onChange={(e) => handlePlayerIdChange(e.target.value)}
                placeholder="Enter Player ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-sm text-gray-500">
                Connect to a specific DJAMMS player instance
              </p>
            </div>
          </div>
        )}

        {/* Connection Status */}
        {platform.showConnectionStatus && (
          <div className="setting-group">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Status</h3>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                <span className="text-green-800 font-medium">Connected</span>
              </div>
              <p className="text-green-600 text-sm mt-1">
                Real-time sync active with player: {unifiedAPI.currentPlayerId}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
import React, { useState } from 'react';
import { unifiedAPI } from '../../../services/UnifiedAPI';
import { usePlatformFeatures } from '../../../hooks/usePlatformFeatures';

interface SettingsPanelProps {
  onCommand: (command: string, data?: any) => Promise<void>;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onCommand }) => {
  const platform = usePlatformFeatures();
  const [settings, setSettings] = useState({
    autoShuffle: false,
    crossfadeEnabled: true,
    crossfadeDuration: 3,
    volume: 80
  });

  const handleSettingChange = async (setting: string, value: any) => {
    const newSettings = { ...settings, [setting]: value };
    setSettings(newSettings);
    await onCommand('setting_update', { setting, value });
  };

  const handlePlayerIdChange = (playerId: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('djamms_player_id', playerId);
      // Reload to reconnect with new player ID
      window.location.reload();
    }
  };

  return (
    <div className="settings-panel bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Settings</h2>

      <div className="space-y-6">
        {/* Universal Settings */}
        <div className="setting-group">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Playback</h3>
          <div className="space-y-4">
            <div className="flex items-center">
              <input
                id="autoShuffle"
                type="checkbox"
                checked={settings.autoShuffle}
                onChange={(e) => handleSettingChange('autoShuffle', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="autoShuffle" className="ml-2 block text-sm text-gray-900">
                Auto-shuffle playlists
              </label>
            </div>

            <div className="flex items-center">
              <input
                id="crossfadeEnabled"
                type="checkbox"
                checked={settings.crossfadeEnabled}
                onChange={(e) => handleSettingChange('crossfadeEnabled', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="crossfadeEnabled" className="ml-2 block text-sm text-gray-900">
                Enable crossfading
              </label>
            </div>

            <div>
              <label htmlFor="crossfadeDuration" className="block text-sm font-medium text-gray-700 mb-1">
                Crossfade Duration: {settings.crossfadeDuration}s
              </label>
              <input
                id="crossfadeDuration"
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={settings.crossfadeDuration}
                onChange={(e) => handleSettingChange('crossfadeDuration', parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <label htmlFor="volume" className="block text-sm font-medium text-gray-700 mb-1">
                Default Volume: {settings.volume}%
              </label>
              <input
                id="volume"
                type="range"
                min="0"
                max="100"
                value={settings.volume}
                onChange={(e) => handleSettingChange('volume', parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Electron-only Settings */}
        {platform.showSystemSettings && (
          <div className="setting-group">
            <h3 className="text-lg font-medium text-gray-900 mb-4">System</h3>
            <div className="space-y-3">
              <button
                onClick={() => onCommand('open_file_browser')}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              >
                Select Music Directory
              </button>
              <button
                onClick={() => onCommand('refresh_library')}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Refresh Music Library
              </button>
              <button
                onClick={() => onCommand('show_dev_tools')}
                className="w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
              >
                Open Developer Tools
              </button>
            </div>
          </div>
        )}

        {/* Web-only Settings */}
        {platform.showPlayerIdSelector && (
          <div className="setting-group">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Connection</h3>
            <div>
              <label htmlFor="playerId" className="block text-sm font-medium text-gray-700 mb-1">
                Player ID
              </label>
              <input
                id="playerId"
                type="text"
                value={unifiedAPI.currentPlayerId}
                onChange={(e) => handlePlayerIdChange(e.target.value)}
                placeholder="Enter Player ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-sm text-gray-500">
                Connect to a specific DJAMMS player instance
              </p>
            </div>
          </div>
        )}

        {/* Connection Status */}
        {platform.showConnectionStatus && (
          <div className="setting-group">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Status</h3>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                <span className="text-green-800 font-medium">Connected</span>
              </div>
              <p className="text-green-600 text-sm mt-1">
                Real-time sync active with player: {unifiedAPI.currentPlayerId}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
