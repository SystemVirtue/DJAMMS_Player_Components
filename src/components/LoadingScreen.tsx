// components/LoadingScreen.tsx
import React from 'react';

interface LoadingScreenProps {
  visible: boolean;
  message?: string;
  className?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  visible,
  message = 'Loading...',
  className = ''
}) => {
  if (!visible) return null;

  return (
    <div
      className={`loading-screen ${className}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.5s ease'
      }}
    >
      <div style={{ textAlign: 'center', color: 'white' }}>
        <div
          className="spinner"
          style={{
            width: '40px',
            height: '40px',
            border: '4px solid rgba(255, 255, 255, 0.3)',
            borderTop: '4px solid white',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }}
        />
        <div style={{ fontSize: '18px' }}>{message}</div>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};