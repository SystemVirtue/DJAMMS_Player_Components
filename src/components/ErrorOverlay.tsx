// components/ErrorOverlay.tsx
import React from 'react';

interface ErrorOverlayProps {
  visible: boolean;
  error: string | null;
  onRetry?: () => void;
  className?: string;
}

export const ErrorOverlay: React.FC<ErrorOverlayProps> = ({
  visible,
  error,
  onRetry,
  className = ''
}) => {
  if (!visible || !error) return null;

  return (
    <div
      className={`error-overlay ${className}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.5s ease'
      }}
    >
      <div style={{ textAlign: 'center', color: 'white', maxWidth: '400px', padding: '20px' }}>
        <div
          style={{
            fontSize: '48px',
            marginBottom: '20px',
            color: '#ff6b6b'
          }}
        >
          ⚠️
        </div>
        <div style={{ fontSize: '18px', marginBottom: '20px', fontWeight: 'bold' }}>
          Playback Error
        </div>
        <div style={{ fontSize: '14px', marginBottom: '30px', lineHeight: '1.5' }}>
          {error}
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              padding: '10px 20px',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  );
};