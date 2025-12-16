// src/hooks/usePlayerState.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { Video } from '../types';

interface UsePlayerStateOptions {
  isElectron: boolean;
  playerIdInitialized: boolean;
  onStateChange?: (state: PlayerState) => void;
}

interface PlayerState {
  currentVideo: Video | null;
  isPlaying: boolean;
  queue: Video[];
  queueIndex: number;
  priorityQueue: Video[];
  volume: number;
  playbackTime: number;
  playbackDuration: number;
}

export const usePlayerState = (options: UsePlayerStateOptions) => {
  const { isElectron, playerIdInitialized, onStateChange } = options;

  const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState<Video[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [priorityQueue, setPriorityQueue] = useState<Video[]>([]);
  const [volume, setVolume] = useState(70);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);

  // Refs for IPC callbacks to avoid stale closures
  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);
  const priorityQueueRef = useRef(priorityQueue);

  // Keep refs in sync with state
  useEffect(() => {
    queueRef.current = queue;
    queueIndexRef.current = queueIndex;
    priorityQueueRef.current = priorityQueue;
  }, [queue, queueIndex, priorityQueue]);

  // Subscribe to main process queue state updates via IPC
  useEffect(() => {
    if (!isElectron) return;

    const api = (window as any).electronAPI;
    if (!api?.onQueueState) return;

    const unsubscribe = api.onQueueState((state: any) => {
      if (state) {
        if (state.queue) setQueue(state.queue);
        if (state.priorityQueue) setPriorityQueue(state.priorityQueue);
        if (typeof state.queueIndex === 'number') setQueueIndex(state.queueIndex);
        if (state.currentVideo || state.nowPlaying) {
          setCurrentVideo(state.currentVideo || state.nowPlaying);
        }
        if (typeof state.isPlaying === 'boolean') setIsPlaying(state.isPlaying);
        if (state.nowPlayingSource) {
          // Track if current video is from priority queue
          // This is handled by the main process orchestrator
        }
      }
    });

    return unsubscribe;
  }, [isElectron]);

  // Listen for playback state updates from Player Window
  useEffect(() => {
    if (!isElectron) return;

    const api = (window as any).electronAPI;
    const unsubscribePlaybackState = api.onPlaybackStateSync?.((state: any) => {
      if (state) {
        if (typeof state.isPlaying === 'boolean') setIsPlaying(state.isPlaying);
        if (typeof state.currentTime === 'number') setPlaybackTime(state.currentTime);
        if (typeof state.duration === 'number') setPlaybackDuration(state.duration);
      }
    });

    return () => {
      if (unsubscribePlaybackState) unsubscribePlaybackState();
    };
  }, [isElectron]);

  // Load saved queue state on mount
  useEffect(() => {
    if (!isElectron || !playerIdInitialized) return;

    const loadSavedState = async () => {
      try {
        const savedQueueState = await (window as any).electronAPI.getSetting('savedQueueState');
        if (savedQueueState && savedQueueState.activeQueue && savedQueueState.activeQueue.length > 0) {
          setQueue(savedQueueState.activeQueue);
          setQueueIndex(savedQueueState.queueIndex || 0);
          setPriorityQueue(savedQueueState.priorityQueue || []);
          if (savedQueueState.currentVideo) {
            setCurrentVideo(savedQueueState.currentVideo);
          }
        }
      } catch (error) {
        console.warn('[usePlayerState] Failed to load saved queue state:', error);
      }
    };

    loadSavedState();
  }, [isElectron, playerIdInitialized]);

  // Save queue state whenever it changes
  useEffect(() => {
    if (!isElectron || !playerIdInitialized) return;

    const saveQueueState = async () => {
      try {
        const queueState = {
          activeQueue: queue,
          priorityQueue: priorityQueue,
          queueIndex: queueIndex,
          currentVideo: currentVideo,
          isPlaying: isPlaying
        };
        await (window as any).electronAPI.setSetting('savedQueueState', queueState);
      } catch (error) {
        console.warn('[usePlayerState] Failed to save queue state:', error);
      }
    };

    const timeoutId = setTimeout(saveQueueState, 1000);
    return () => clearTimeout(timeoutId);
  }, [queue, priorityQueue, queueIndex, currentVideo, isPlaying, isElectron, playerIdInitialized]);

  // Notify parent of state changes
  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        currentVideo,
        isPlaying,
        queue,
        queueIndex,
        priorityQueue,
        volume,
        playbackTime,
        playbackDuration
      });
    }
  }, [currentVideo, isPlaying, queue, queueIndex, priorityQueue, volume, playbackTime, playbackDuration, onStateChange]);

  // Queue command helpers
  const sendQueueCommand = useCallback((command: { action: string; payload?: any }) => {
    if (!isElectron) return;
    (window as any).electronAPI.sendQueueCommand?.(command);
  }, [isElectron]);

  return {
    // State
    currentVideo,
    isPlaying,
    queue,
    queueIndex,
    priorityQueue,
    volume,
    playbackTime,
    playbackDuration,
    // Setters
    setCurrentVideo,
    setIsPlaying,
    setQueue,
    setQueueIndex,
    setPriorityQueue,
    setVolume,
    setPlaybackTime,
    setPlaybackDuration,
    // Refs (for IPC callbacks)
    queueRef,
    queueIndexRef,
    priorityQueueRef,
    // Helpers
    sendQueueCommand
  };
};

