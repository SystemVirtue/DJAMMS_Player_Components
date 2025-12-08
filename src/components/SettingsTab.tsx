// components/SettingsTab.tsx
import React, { useState, useCallback } from 'react';
import { 
  isValidPlayerIdFormat, 
  claimPlayerId, 
  validatePlayerId,
  MIN_PLAYER_ID_LENGTH 
} from '../utils/playerUtils';
import { CrossfadeMode } from '../types';

interface Settings {
  autoShufflePlaylists: boolean;
  normalizeAudioLevels: boolean;
  enableFullscreenPlayer: boolean;
  fadeDuration: number;
  crossfadeMode: CrossfadeMode;
}

interface SettingsTabProps {
  settings: Settings;
  onUpdateSetting: (key: keyof Settings, value: any) => void;
  playerId: string;
  onPlayerIdChange: (newId: string) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  onUpdateSetting,
  playerId,
  onPlayerIdChange
}) => {
  const [isEditingPlayerId, setIsEditingPlayerId] = useState(false);
  const [newPlayerId, setNewPlayerId] = useState('');
  const [playerIdError, setPlayerIdError] = useState<string | null>(null);
  const [isChangingPlayerId, setIsChangingPlayerId] = useState(false);

  const handleStartEdit = useCallback(() => {
    setNewPlayerId('');
    setPlayerIdError(null);
    setIsEditingPlayerId(true);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setIsEditingPlayerId(false);
    setNewPlayerId('');
    setPlayerIdError(null);
  }, []);

  const handleChangePlayerId = useCallback(async () => {
    const clean = newPlayerId.trim().toUpperCase();
    
    // Validate format
    if (!isValidPlayerIdFormat(clean)) {
      setPlayerIdError(`Player ID must be at least ${MIN_PLAYER_ID_LENGTH} characters`);
      return;
    }

    // Same as current?
    if (clean === playerId) {
      setPlayerIdError('This is already your current Player ID');
      return;
    }

    setIsChangingPlayerId(true);
    setPlayerIdError(null);

    try {
      // First check if the ID already exists
      const exists = await validatePlayerId(clean);
      
      if (exists) {
        // ID exists - just switch to it (assume user owns it or it's shared)
        onPlayerIdChange(clean);
        setIsEditingPlayerId(false);
        setNewPlayerId('');
      } else {
        // ID doesn't exist - try to claim it
        const result = await claimPlayerId(clean);
        if (result.success) {
          onPlayerIdChange(clean);
          setIsEditingPlayerId(false);
          setNewPlayerId('');
        } else {
          setPlayerIdError(result.error || 'Failed to claim Player ID');
        }
      }
    } catch (err) {
      setPlayerIdError('Failed to change Player ID');
    } finally {
      setIsChangingPlayerId(false);
    }
  }, [newPlayerId, playerId, onPlayerIdChange]);

  return (
    <div className="settings-container">
      {/* Player Identity Section */}
      <div className="settings-section">
        <h3 className="settings-section-title">Player Identity</h3>

        {/* Current Player ID */}
        <div className="settings-item">
          <div className="settings-item-info">
            <div className="settings-item-label">Player ID</div>
            <div className="settings-item-description">
              Unique identifier for this player instance. Web Admin and Kiosk apps connect using this ID.
            </div>
          </div>
          {!isEditingPlayerId ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ 
                fontFamily: 'monospace',
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--yt-spec-call-to-action)',
                backgroundColor: 'rgba(62, 166, 255, 0.1)',
                padding: '6px 12px',
                borderRadius: '6px',
                letterSpacing: '0.5px'
              }}>
                {playerId}
              </span>
              <button
                onClick={handleStartEdit}
                style={{
                  padding: '6px 12px',
                  fontSize: '13px',
                  backgroundColor: 'var(--yt-spec-badge-chip-background)',
                  color: 'var(--yt-text-primary)',
                  border: '1px solid var(--yt-spec-10-percent-layer)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--yt-spec-10-percent-layer)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--yt-spec-badge-chip-background)'}
              >
                Change
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="text"
                  value={newPlayerId}
                  onChange={(e) => {
                    setNewPlayerId(e.target.value.toUpperCase());
                    setPlayerIdError(null);
                  }}
                  placeholder="Enter new Player ID"
                  disabled={isChangingPlayerId}
                  style={{
                    padding: '8px 12px',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    backgroundColor: 'var(--yt-spec-badge-chip-background)',
                    color: 'var(--yt-text-primary)',
                    border: playerIdError 
                      ? '1px solid var(--yt-spec-brand-button-background)' 
                      : '1px solid var(--yt-spec-10-percent-layer)',
                    borderRadius: '6px',
                    outline: 'none',
                    width: '200px',
                    textTransform: 'uppercase'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isChangingPlayerId) {
                      handleChangePlayerId();
                    } else if (e.key === 'Escape') {
                      handleCancelEdit();
                    }
                  }}
                  autoFocus
                />
                <button
                  onClick={handleChangePlayerId}
                  disabled={isChangingPlayerId || !newPlayerId.trim()}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    backgroundColor: isChangingPlayerId ? 'var(--yt-spec-badge-chip-background)' : 'var(--yt-spec-call-to-action)',
                    color: isChangingPlayerId ? 'var(--yt-text-secondary)' : 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: isChangingPlayerId ? 'not-allowed' : 'pointer',
                    fontWeight: 500
                  }}
                >
                  {isChangingPlayerId ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={isChangingPlayerId}
                  style={{
                    padding: '8px 12px',
                    fontSize: '13px',
                    backgroundColor: 'transparent',
                    color: 'var(--yt-text-secondary)',
                    border: '1px solid var(--yt-spec-10-percent-layer)',
                    borderRadius: '6px',
                    cursor: isChangingPlayerId ? 'not-allowed' : 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
              {playerIdError && (
                <span style={{ 
                  fontSize: '12px', 
                  color: 'var(--yt-spec-brand-button-background)',
                  marginLeft: '4px'
                }}>
                  {playerIdError}
                </span>
              )}
              <span style={{ 
                fontSize: '11px', 
                color: 'var(--yt-text-secondary)',
                marginLeft: '4px'
              }}>
                Min {MIN_PLAYER_ID_LENGTH} characters. Will create if not exists.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Playback Section */}
      <div className="settings-section">
        <h3 className="settings-section-title">Playback</h3>

        {/* Crossfade Mode */}
        <div className="settings-item">
          <div className="settings-item-info">
            <div className="settings-item-label">Crossfade Mode</div>
            <div className="settings-item-description">
              {settings.crossfadeMode === 'manual' 
                ? 'Videos play to completion, then next starts (clean cut)'
                : 'Next video overlaps with current for smooth transitions'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => onUpdateSetting('crossfadeMode', 'manual')}
              style={{
                padding: '6px 14px',
                fontSize: '13px',
                backgroundColor: settings.crossfadeMode === 'manual' 
                  ? 'var(--yt-spec-call-to-action)' 
                  : 'var(--yt-spec-badge-chip-background)',
                color: settings.crossfadeMode === 'manual' 
                  ? 'white' 
                  : 'var(--yt-text-secondary)',
                border: settings.crossfadeMode === 'manual'
                  ? 'none'
                  : '1px solid var(--yt-spec-10-percent-layer)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: settings.crossfadeMode === 'manual' ? 600 : 400,
                transition: 'all 0.2s'
              }}
            >
              Manual
            </button>
            <button
              onClick={() => onUpdateSetting('crossfadeMode', 'seamless')}
              style={{
                padding: '6px 14px',
                fontSize: '13px',
                backgroundColor: settings.crossfadeMode === 'seamless' 
                  ? 'var(--yt-spec-call-to-action)' 
                  : 'var(--yt-spec-badge-chip-background)',
                color: settings.crossfadeMode === 'seamless' 
                  ? 'white' 
                  : 'var(--yt-text-secondary)',
                border: settings.crossfadeMode === 'seamless'
                  ? 'none'
                  : '1px solid var(--yt-spec-10-percent-layer)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: settings.crossfadeMode === 'seamless' ? 600 : 400,
                transition: 'all 0.2s'
              }}
            >
              Seamless
            </button>
          </div>
        </div>

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
            <div className="settings-item-label">
              {settings.crossfadeMode === 'seamless' ? 'Crossfade Overlap' : 'Skip Fade Duration'}
            </div>
            <div className="settings-item-description">
              {settings.crossfadeMode === 'seamless' 
                ? 'How many seconds before video ends to start the next'
                : 'Duration of fade-out when skipping tracks'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="range"
              className="settings-slider"
              min={0.5}
              max={5.0}
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