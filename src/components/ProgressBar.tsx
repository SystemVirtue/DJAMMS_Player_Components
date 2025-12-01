// components/ProgressBar.tsx
import React, { useRef, useEffect } from 'react';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  onSeek?: (time: number) => void;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  currentTime,
  duration,
  onSeek,
  className = ''
}) => {
  const progressRef = useRef<HTMLDivElement>(null);

  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek || !progressRef.current) return;

    const rect = progressRef.current.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;

    onSeek(Math.max(0, Math.min(newTime, duration)));
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`progress-bar ${className}`}
      style={{
        width: '100%',
        height: '20px',
        background: 'rgba(255, 255, 255, 0.2)',
        borderRadius: '10px',
        cursor: onSeek ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden'
      }}
      onClick={handleClick}
      ref={progressRef}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: '#007bff',
          borderRadius: '10px',
          transition: 'width 0.1s ease'
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'white',
          fontSize: '12px',
          fontWeight: 'bold',
          textShadow: '1px 1px 2px rgba(0, 0, 0, 0.8)',
          pointerEvents: 'none'
        }}
      >
        {formatTime(currentTime)} / {formatTime(duration)}
      </div>
    </div>
  );
};