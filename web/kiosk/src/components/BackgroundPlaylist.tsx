// BackgroundPlaylist.tsx - Looping background assets for Kiosk
// Ported from obie-v5

import { useEffect, useState } from 'react';

interface BackgroundAsset {
  id: string;
  type: 'image' | 'video';
  src: string;
  duration?: number; // in seconds, for images
}

interface BackgroundPlaylistProps {
  assets: BackgroundAsset[];
  fillScreen?: boolean;
  fadeDuration?: number; // in seconds
}

export function BackgroundPlaylist({
  assets,
  fillScreen = true,
  fadeDuration = 1
}: BackgroundPlaylistProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const currentAsset = assets[currentIndex];

  useEffect(() => {
    if (!currentAsset) return;

    const duration = currentAsset.type === 'image'
      ? (currentAsset.duration || 20) * 1000
      : 0; // Videos will handle their own timing

    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsTransitioning(true);
        setTimeout(() => {
          setCurrentIndex((prev) => (prev + 1) % assets.length);
          setIsTransitioning(false);
        }, fadeDuration * 1000);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [currentIndex, currentAsset, assets.length, fadeDuration]);

  const handleVideoEnd = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % assets.length);
      setIsTransitioning(false);
    }, fadeDuration * 1000);
  };

  if (!currentAsset) return null;

  const baseClasses = fillScreen
    ? "fixed inset-0 w-full h-full object-cover"
    : "w-full h-full object-cover";

  const transitionStyle = {
    opacity: isTransitioning ? 0 : 1,
    transition: `opacity ${fadeDuration}s ease-in-out`,
    zIndex: -1
  };

  return (
    <div className={`fixed inset-0 pointer-events-none z-0`}>
      {currentAsset.type === 'image' ? (
        <img
          src={currentAsset.src}
          alt=""
          className={baseClasses}
          style={transitionStyle}
        />
      ) : (
        <video
          key={currentAsset.id}
          src={currentAsset.src}
          className={baseClasses}
          style={transitionStyle}
          autoPlay
          muted
          playsInline
          onEnded={handleVideoEnd}
          onError={(e) => {
            console.error('Video failed to load:', currentAsset.src, e);
            // Skip to next asset on error
            handleVideoEnd();
          }}
        />
      )}
    </div>
  );
}

// Default background assets configuration
// These match the obie-v5 kiosk background assets
export const DEFAULT_BACKGROUND_ASSETS: BackgroundAsset[] = [
  {
    id: 'obie-neon1',
    type: 'image',
    src: '/assets/background/Obie_NEON1.png',
    duration: 20
  },
  {
    id: 'obie-shield-crest-animation',
    type: 'video',
    src: '/assets/background/Obie_Shield_Crest_Animation.mp4'
  },
  {
    id: 'obie-carla-v1',
    type: 'video',
    src: '/assets/background/Obie - Carla v1.mp4'
  },
  {
    id: 'obie-neon2',
    type: 'image',
    src: '/assets/background/Obie_NEON2.png',
    duration: 20
  },
  {
    id: 'obie-shield-crest-animation2',
    type: 'video',
    src: '/assets/background/Obie_Shield_Crest_Animation2.mp4'
  }
];

// Fallback gradient background if no assets load
export function FallbackBackground() {
  return (
    <div 
      className="fixed inset-0 z-0"
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }}
    />
  );
}
