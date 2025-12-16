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
    <div className="settings-panel bg-ytm-surface rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-ytm-text mb-6">Settings</h2>

      <div className="space-y-6">
        {/* Universal Settings */}
        <div className="setting-group">
          <h3 className="text-lg font-medium text-ytm-text mb-4">Playback</h3>
          <div className="space-y-4">
            <div className="flex items-center">
              <input
                id="autoShuffle"
                type="checkbox"
                checked={settings.autoShuffle}
                onChange={(e) => handleSettingChange('autoShuffle', e.target.checked)}
                className="h-4 w-4 text-ytm-accent focus:ring-ytm-accent border-ytm-divider rounded"
              />
              <label htmlFor="autoShuffle" className="ml-2 block text-sm text-ytm-text">
                Auto-shuffle playlists
              </label>
            </div>

            <div className="flex items-center">
              <input
                id="crossfadeEnabled"
                type="checkbox"
                checked={settings.crossfadeEnabled}
                onChange={(e) => handleSettingChange('crossfadeEnabled', e.target.checked)}
                className="h-4 w-4 text-ytm-accent focus:ring-ytm-accent border-ytm-divider rounded"
              />
              <label htmlFor="crossfadeEnabled" className="ml-2 block text-sm text-ytm-text">
                Enable crossfade
              </label>
            </div>

            {settings.crossfadeEnabled && (
              <div className="ml-6">
                <label className="block text-sm font-medium text-ytm-text mb-2">
                  Crossfade Duration: {settings.crossfadeDuration}s
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={settings.crossfadeDuration}
                  onChange={(e) => handleSettingChange('crossfadeDuration', parseInt(e.target.value))}
                  className="w-full h-2 bg-ytm-surface-hover rounded-lg appearance-none cursor-pointer"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-ytm-text mb-2">
                Volume: {settings.volume}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={settings.volume}
                onChange={(e) => handleSettingChange('volume', parseInt(e.target.value))}
                className="w-full h-2 bg-ytm-surface-hover rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Platform-specific Settings */}
        {platform.requiresPlayerIdSelection && (
          <div className="setting-group">
            <h3 className="text-lg font-medium text-ytm-text mb-4">Player Connection</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ytm-text mb-2">
                  Player ID
                </label>
                <input
                  type="text"
                  placeholder="Enter player ID"
                  defaultValue={unifiedAPI.currentPlayerId}
                  onBlur={(e) => handlePlayerIdChange(e.target.value)}
                  className="w-full px-3 py-2 border border-ytm-divider rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-ytm-accent focus:border-transparent bg-ytm-surface text-ytm-text"
                />
                <p className="text-xs text-ytm-text-secondary mt-1">
                  Connect to a specific DJAMMS player instance
                </p>
              </div>

              <div className="bg-ytm-surface-hover border border-ytm-divider rounded-lg p-4">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-ytm-text font-medium">Connected</span>
                </div>
                <p className="text-ytm-text-secondary text-sm mt-1">
                  Real-time sync active with player: {unifiedAPI.currentPlayerId}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Electron-only Settings */}
        {platform.canUseLocalFiles && (
          <div className="setting-group">
            <h3 className="text-lg font-medium text-ytm-text mb-4">Local Files</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ytm-text mb-2">
                  Music Library Path
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    placeholder="/path/to/music"
                    className="flex-1 px-3 py-2 border border-ytm-divider rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-ytm-accent focus:border-transparent bg-ytm-surface text-ytm-text"
                  />
                  <button className="px-4 py-2 bg-ytm-surface-hover text-ytm-text border border-ytm-divider rounded-md hover:bg-ytm-surface transition-colors">
                    Browse
                  </button>
                </div>
                <p className="text-xs text-ytm-text-secondary mt-1">
                  Select folder containing your music files
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};