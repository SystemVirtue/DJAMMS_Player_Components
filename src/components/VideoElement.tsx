// components/VideoElement.tsx
import React, { forwardRef } from 'react';

interface VideoElementProps {
  className?: string;
  style?: React.CSSProperties;
}

export const VideoElement = forwardRef<HTMLVideoElement, VideoElementProps>(
  ({ className, style }, ref) => {
    return (
      <video
        ref={ref}
        className={className}
        style={style}
        preload="auto"
        playsInline
        muted={false}
      />
    );
  }
);

VideoElement.displayName = 'VideoElement';