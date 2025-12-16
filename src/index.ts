// index.ts - Main library exports
export { DJAMMSPlayer } from './components/DJAMMSPlayer';
export type { DJAMMSPlayerRef } from './components/DJAMMSPlayer';
export type { Video, PlayerState, QueueState } from './types';

// Hooks
export { useVideoPlayer } from './hooks/useVideoPlayer';
export { useSkip } from './hooks/useSkip';
export { useKeyboardControls } from './hooks/useKeyboardControls';
export { useQueueManager } from './hooks/useQueueManager';

// Components
export * from './components';

// Services
export * from './services';

// Pages
export * from './pages';