// utils/crossfade.ts
export interface CrossfadeConfig {
  duration: number;
  onProgress?: (progress: number, activeVolume: number, inactiveVolume: number) => void;
  onComplete?: () => void;
}

export function crossfade(
  activeVideo: HTMLVideoElement,
  inactiveVideo: HTMLVideoElement,
  config: CrossfadeConfig
): Promise<void> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const startActiveVolume = activeVideo.volume;
    const startActiveOpacity = parseFloat(activeVideo.style.opacity) || 1;
    const startInactiveOpacity = parseFloat(inactiveVideo.style.opacity) || 0;

    const fadeStep = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / config.duration, 1);

      // Fade in inactive video opacity
      const inactiveOpacity = startInactiveOpacity + (progress * (1 - startInactiveOpacity));
      inactiveVideo.style.opacity = inactiveOpacity.toString();

      // Fade out active video opacity and volume
      const activeOpacity = startActiveOpacity * (1 - progress);
      const activeVolume = startActiveVolume * (1 - progress);

      activeVideo.style.opacity = activeOpacity.toString();
      activeVideo.volume = activeVolume;

      // Call progress callback
      if (config.onProgress) {
        config.onProgress(progress, activeVolume, inactiveVideo.volume);
      }

      if (progress < 1) {
        requestAnimationFrame(fadeStep);
      } else {
        // Complete
        if (config.onComplete) {
          config.onComplete();
        }
        resolve();
      }
    };

    requestAnimationFrame(fadeStep);
  });
}

export function fadeOut(
  video: HTMLVideoElement,
  duration: number,
  onProgress?: (progress: number, volume: number, opacity: number) => void,
  onComplete?: () => void
): Promise<void> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const startVolume = video.volume;
    const startOpacity = parseFloat(video.style.opacity) || 1;

    const fadeStep = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const currentVolume = startVolume * (1 - progress);
      const currentOpacity = startOpacity * (1 - progress);

      video.volume = currentVolume;
      video.style.opacity = currentOpacity.toString();

      if (onProgress) {
        onProgress(progress, currentVolume, currentOpacity);
      }

      if (progress < 1) {
        requestAnimationFrame(fadeStep);
      } else {
        if (onComplete) {
          onComplete();
        }
        resolve();
      }
    };

    requestAnimationFrame(fadeStep);
  });
}