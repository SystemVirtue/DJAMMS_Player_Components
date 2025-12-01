// components/SettingsTab.tsx
import React from 'react';

interface Display {
  id?: number;
  label?: string;
}

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
    <div className="demo-section">
      <h2>Settings</h2>

      <div style={{ maxWidth: '600px' }}>
        {/* Auto-shuffle Playlists */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '15px',
          border: '1px solid #ddd',
          borderRadius: '8px',
          marginBottom: '15px',
          backgroundColor: '#f8f9fa'
        }}>
          <div>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '16px' }}>Auto-shuffle Playlists</h3>
            <p style={{ margin: '0', color: '#666', fontSize: '14px' }}>
              Automatically shuffle playlist order when loading
            </p>
          </div>
          <button
            onClick={() => onUpdateSetting('autoShufflePlaylists', !settings.autoShufflePlaylists)}
            style={{
              padding: '8px 16px',
              backgroundColor: settings.autoShufflePlaylists ? '#28a745' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            {settings.autoShufflePlaylists ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>

        {/* Normalise Audio Levels */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '15px',
          border: '1px solid #ddd',
          borderRadius: '8px',
          marginBottom: '15px',
          backgroundColor: '#f8f9fa'
        }}>
          <div>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '16px' }}>Normalise Audio Levels</h3>
            <p style={{ margin: '0', color: '#666', fontSize: '14px' }}>
              Apply volume normalization for consistent audio levels
            </p>
          </div>
          <button
            onClick={() => onUpdateSetting('normalizeAudioLevels', !settings.normalizeAudioLevels)}
            style={{
              padding: '8px 16px',
              backgroundColor: settings.normalizeAudioLevels ? '#28a745' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            {settings.normalizeAudioLevels ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>

        {/* Dedicated Player Window */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '15px',
          border: '1px solid #ddd',
          borderRadius: '8px',
          marginBottom: '15px',
          backgroundColor: '#f8f9fa'
        }}>
          <div>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '16px' }}>Dedicated Player Window</h3>
            <p style={{ margin: '0', color: '#666', fontSize: '14px' }}>
              Open a dedicated player window for manual positioning and fullscreen control
            </p>
          </div>
          <button
            onClick={() => onUpdateSetting('enableFullscreenPlayer', !settings.enableFullscreenPlayer)}
            style={{
              padding: '8px 16px',
              backgroundColor: settings.enableFullscreenPlayer ? '#28a745' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            {settings.enableFullscreenPlayer ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>

        {/* Fade Duration */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '15px',
          border: '1px solid #ddd',
          borderRadius: '8px',
          marginBottom: '15px',
          backgroundColor: '#f8f9fa'
        }}>
          <div style={{ flex: 1, marginRight: '20px' }}>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '16px' }}>Fade Duration</h3>
            <p style={{ margin: '0', color: '#666', fontSize: '14px' }}>
              Crossfade / fade duration in seconds
            </p>
            <div style={{ marginTop: '10px' }}>
              <input
                type="range"
                min={1.0}
                max={4.0}
                step={0.5}
                value={settings.fadeDuration}
                onChange={(e) => onUpdateSetting('fadeDuration', parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <div style={{ width: '90px', textAlign: 'right' }}>
            <strong style={{ fontSize: '14px' }}>{settings.fadeDuration.toFixed(1)}s</strong>
          </div>
        </div>
      </div>
    </div>
  );
};