// hooks/useQueueManager.ts
import { useCallback } from 'react';
import { createIPCAdapter } from '../utils/ipc';

export function useQueueManager() {
  const ipcAdapter = createIPCAdapter(true);

  const nextVideo = useCallback(() => {
    ipcAdapter.send('load-next-video');
  }, [ipcAdapter]);

  const previousVideo = useCallback(() => {
    ipcAdapter.send('load-previous-video');
  }, [ipcAdapter]);

  return {
    nextVideo,
    previousVideo
  };
}