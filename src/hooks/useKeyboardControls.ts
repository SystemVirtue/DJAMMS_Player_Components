// hooks/useKeyboardControls.ts
import { useEffect } from 'react';

interface KeyboardControlsConfig {
  onAction: (action: string) => void;
  enabled?: boolean;
}

export function useKeyboardControls(config: KeyboardControlsConfig) {
  const { onAction, enabled = true } = config;

  const handleKeyDown = (e: KeyboardEvent) => {
    // Only handle if not in an input field
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (e.code) {
      // Space bar play/pause DISABLED - causes accidental triggers
      // case 'Space':
      //   e.preventDefault();
      //   onAction('playPause');
      //   break;
      case 'KeyS':
        e.preventDefault();
        console.log('[useKeyboardControls] KeyS pressed');
        onAction('skip');
        break;
      case 'ArrowRight':
        e.preventDefault();
        console.log('[useKeyboardControls] ArrowRight pressed');
        onAction('skip');
        break;
      case 'ArrowUp':
        e.preventDefault();
        onAction('volumeUp');
        break;
      case 'ArrowDown':
        e.preventDefault();
        onAction('volumeDown');
        break;
      case 'KeyM':
        e.preventDefault();
        onAction('mute');
        break;
      case 'KeyF':
        e.preventDefault();
        onAction('fullscreen');
        break;
      case 'KeyN':
        e.preventDefault();
        onAction('next');
        break;
      case 'KeyP':
        e.preventDefault();
        onAction('previous');
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, onAction]);
}