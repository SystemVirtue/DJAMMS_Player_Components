// components/CrossfadeSettings.tsx
// User interface for selecting crossfade mode and duration
import React, { useState, useEffect } from 'react';
import { CrossfadeMode } from '../types';

interface CrossfadeSettingsProps {
  /** Current crossfade mode */
  initialMode?: CrossfadeMode;
  /** Current crossfade duration in seconds */
  initialDuration?: number;
  /** Callback when mode changes */
  onModeChange?: (mode: CrossfadeMode) => void;
  /** Callback when duration changes */
  onDurationChange?: (duration: number) => void;
  /** Compact mode for smaller spaces */
  compact?: boolean;
}

export const CrossfadeSettings: React.FC<CrossfadeSettingsProps> = ({
  initialMode = 'manual',
  initialDuration = 2.0,
  onModeChange,
  onDurationChange,
  compact = false
}) => {
  const [mode, setMode] = useState<CrossfadeMode>(initialMode);
  const [duration, setDuration] = useState(initialDuration);

  // Sync with external changes
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    setDuration(initialDuration);
  }, [initialDuration]);

  const handleModeChange = (newMode: CrossfadeMode) => {
    setMode(newMode);
    onModeChange?.(newMode);
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDuration = parseFloat(e.target.value);
    setDuration(newDuration);
    onDurationChange?.(newDuration);
  };

  if (compact) {
    return (
      <div className="crossfade-settings-compact" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Mode Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#aaa', fontSize: '14px', minWidth: '80px' }}>Mode:</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => handleModeChange('manual')}
              style={{
                padding: '6px 12px',
                background: mode === 'manual' ? '#ff1e56' : '#1f1f1f',
                color: mode === 'manual' ? '#fff' : '#aaa',
                border: '1px solid #333',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Manual
            </button>
            <button
              onClick={() => handleModeChange('seamless')}
              style={{
                padding: '6px 12px',
                background: mode === 'seamless' ? '#ff1e56' : '#1f1f1f',
                color: mode === 'seamless' ? '#fff' : '#aaa',
                border: '1px solid #333',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Seamless
            </button>
          </div>
        </div>

        {/* Duration Slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#aaa', fontSize: '14px', minWidth: '80px' }}>
            {mode === 'seamless' ? 'Overlap:' : 'Fade:'}
          </span>
          <input
            type="range"
            min="0.5"
            max="5"
            step="0.5"
            value={duration}
            onChange={handleDurationChange}
            style={{ flex: 1 }}
          />
          <span style={{ color: '#fff', fontSize: '14px', minWidth: '40px' }}>
            {duration.toFixed(1)}s
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="crossfade-settings" style={{ 
      padding: '16px', 
      background: '#121212', 
      borderRadius: '8px',
      color: '#fff'
    }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>
        Playback Settings
      </h3>
      
      {/* Crossfade Mode Selection */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#aaa', fontWeight: '500' }}>
          Crossfade Mode
        </h4>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Manual Mode Option */}
          <label 
            style={{ 
              display: 'flex', 
              alignItems: 'flex-start', 
              padding: '12px', 
              background: mode === 'manual' ? '#1f1f1f' : '#0f0f0f',
              border: mode === 'manual' ? '2px solid #ff1e56' : '2px solid transparent',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <input
              type="radio"
              name="crossfade-mode"
              value="manual"
              checked={mode === 'manual'}
              onChange={() => handleModeChange('manual')}
              style={{ marginRight: '12px', marginTop: '2px' }}
            />
            <div>
              <div style={{ fontWeight: '500', marginBottom: '4px' }}>Manual Mode</div>
              <div style={{ fontSize: '13px', color: '#aaa', lineHeight: '1.4' }}>
                Videos play to completion. Next video starts immediately with clean cut.
                Skip button fades out current video before switching.
              </div>
            </div>
          </label>

          {/* Seamless Mode Option */}
          <label 
            style={{ 
              display: 'flex', 
              alignItems: 'flex-start', 
              padding: '12px', 
              background: mode === 'seamless' ? '#1f1f1f' : '#0f0f0f',
              border: mode === 'seamless' ? '2px solid #ff1e56' : '2px solid transparent',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <input
              type="radio"
              name="crossfade-mode"
              value="seamless"
              checked={mode === 'seamless'}
              onChange={() => handleModeChange('seamless')}
              style={{ marginRight: '12px', marginTop: '2px' }}
            />
            <div>
              <div style={{ fontWeight: '500', marginBottom: '4px' }}>Seamless Mode</div>
              <div style={{ fontSize: '13px', color: '#aaa', lineHeight: '1.4' }}>
                Next video starts before current ends, creating smooth crossfade overlap.
                Great for continuous playback without silence gaps.
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Crossfade Duration */}
      <div>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#aaa', fontWeight: '500' }}>
          {mode === 'seamless' ? 'Crossfade Overlap Duration' : 'Skip Fade Duration'}
        </h4>
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#666' }}>
          {mode === 'seamless' 
            ? 'How many seconds before the current video ends to start the next video.'
            : 'How long the fade-out takes when you skip a video.'}
        </p>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            type="range"
            min="0.5"
            max="5"
            step="0.5"
            value={duration}
            onChange={handleDurationChange}
            style={{ 
              flex: 1, 
              height: '6px',
              background: '#333',
              borderRadius: '3px',
              appearance: 'none',
              cursor: 'pointer'
            }}
          />
          <span style={{ 
            minWidth: '60px', 
            textAlign: 'center',
            padding: '6px 12px',
            background: '#1f1f1f',
            borderRadius: '4px',
            fontWeight: '500'
          }}>
            {duration.toFixed(1)}s
          </span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', color: '#666' }}>
          <span>Quick (0.5s)</span>
          <span>Smooth (5s)</span>
        </div>
      </div>

      {/* Visual Preview */}
      <div style={{ marginTop: '20px', padding: '12px', background: '#0f0f0f', borderRadius: '8px' }}>
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px', fontWeight: '500' }}>
          PREVIEW
        </div>
        <div style={{ 
          position: 'relative', 
          height: '40px', 
          background: '#1f1f1f', 
          borderRadius: '4px',
          overflow: 'hidden'
        }}>
          {mode === 'seamless' ? (
            <>
              {/* Current video (fading out) */}
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${50 + (duration / 5) * 20}%`,
                background: 'linear-gradient(90deg, #ff1e56 0%, #ff1e56 60%, transparent 100%)',
                borderRadius: '4px 0 0 4px'
              }} />
              {/* Next video (fading in) */}
              <div style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: `${50 + (duration / 5) * 20}%`,
                background: 'linear-gradient(90deg, transparent 0%, #3b82f6 40%, #3b82f6 100%)',
                borderRadius: '0 4px 4px 0'
              }} />
              {/* Overlap indicator */}
              <div style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                top: '50%',
                marginTop: '-8px',
                fontSize: '10px',
                color: '#fff',
                background: 'rgba(0,0,0,0.7)',
                padding: '2px 6px',
                borderRadius: '3px'
              }}>
                {duration.toFixed(1)}s overlap
              </div>
            </>
          ) : (
            <>
              {/* Video A (ends) */}
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: '48%',
                background: '#ff1e56',
                borderRadius: '4px 0 0 4px'
              }} />
              {/* Gap indicator */}
              <div style={{
                position: 'absolute',
                left: '48%',
                width: '4%',
                top: 0,
                bottom: 0,
                background: '#333',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{ width: '2px', height: '100%', background: '#666' }} />
              </div>
              {/* Video B (starts) */}
              <div style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: '48%',
                background: '#3b82f6',
                borderRadius: '0 4px 4px 0'
              }} />
            </>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: '#666' }}>
          <span>Current Video</span>
          <span>Next Video</span>
        </div>
      </div>

      {/* Info Box */}
      <div style={{ 
        marginTop: '16px', 
        padding: '12px', 
        background: 'rgba(59, 130, 246, 0.1)', 
        border: '1px solid rgba(59, 130, 246, 0.3)',
        borderRadius: '6px',
        fontSize: '13px',
        color: '#aaa'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>💡</span>
          <span>
            {mode === 'seamless' 
              ? 'Seamless mode is perfect for continuous DJ sets where you want smooth transitions between tracks.'
              : 'Manual mode gives you precise control - each video plays completely before the next begins.'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CrossfadeSettings;
