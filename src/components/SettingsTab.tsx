// components/SettingsTab.tsx
import React from 'react';

interface Settings {
  autoShufflePlaylists: boolean;
  normalizeAudioLevels: boolean;
  enableFullscreenPlayer: boolean;
  fadeDuration: number;
}

interface SettingsTabProps {
  settings: Settings;
  onUpdateSetting: (key: keyof Settings, value: any) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  onUpdateSetting
}) => {
  return (
    <div className="settings-container">
      {/* Playback Section */}
      <div className="settings-section">
        <h3 className="settings-section-title">Playback</h3>

        {/* Auto-shuffle Playlists */}
        <div className="settings-item">
          <div className="settings-item-info">
            <div className="settings-item-label">Auto-shuffle Playlists</div>
            <div className="settings-item-description">
              Automatically shuffle playlist order when loading
            </div>
          </div>
          <div
            className={`toggle-switch ${settings.autoShufflePlaylists ? 'active' : ''}`}
            onClick={() => onUpdateSetting('autoShufflePlaylists', !settings.autoShufflePlaylists)}
            role="switch"
            aria-checked={settings.autoShufflePlaylists}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onUpdateSetting('autoShufflePlaylists', !settings.autoShufflePlaylists);
              }
            }}
          />
        </div>

        {/* Fade Duration */}
        <div className="settings-item">
          <div className="settings-item-info">
            <div className="settings-item-label">Crossfade Duration</div>
            <div className="settings-item-description">
              Duration of audio/video crossfade between tracks
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="range"
              className="settings-slider"
              min={0.5}
              max={4.0}
              step={0.5}
              value={settings.fadeDuration}
              onChange={(e) => onUpdateSetting('fadeDuration', parseFloat(e.target.value))}
            />
            <span style={{ 
              minWidth: '40px', 
              textAlign: 'right',
              color: 'var(--yt-text-primary)',
              fontSize: '14px',
              fontWeight: 500
            }}>
              {settings.fadeDuration.toFixed(1)}s
            </span>
          </div>
        </div>
      </div>

      {/* Audio Section */}
      <div className="settings-section">
        <h3 className="settings-section-title">Audio</h3>

        {/* Normalise Audio Levels */}
        <div className="settings-item">
          <div className="settings-item-info">
            <div className="settings-item-label">Normalize Audio Levels</div>
            <div className="settings-item-description">
              Apply volume normalization for consistent audio levels across tracks
            </div>
          </div>
          <div
            className={`toggle-switch ${settings.normalizeAudioLevels ? 'active' : ''}`}
            onClick={() => onUpdateSetting('normalizeAudioLevels', !settings.normalizeAudioLevels)}
            role="switch"
            aria-checked={settings.normalizeAudioLevels}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onUpdateSetting('normalizeAudioLevels', !settings.normalizeAudioLevels);
              }
            }}
          />
        </div>
      </div>

      {/* Display Section */}
      <div className="settings-section">
        <h3 className="settings-section-title">Display</h3>

        {/* Dedicated Player Window */}
        <div className="settings-item">
          <div className="settings-item-info">
            <div className="settings-item-label">Fullscreen Player Mode</div>
            <div className="settings-item-description">
              Enable syncing to a fullscreen player window on a secondary display
            </div>
          </div>
          <div
            className={`toggle-switch ${settings.enableFullscreenPlayer ? 'active' : ''}`}
            onClick={() => onUpdateSetting('enableFullscreenPlayer', !settings.enableFullscreenPlayer)}
            role="switch"
            aria-checked={settings.enableFullscreenPlayer}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onUpdateSetting('enableFullscreenPlayer', !settings.enableFullscreenPlayer);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};