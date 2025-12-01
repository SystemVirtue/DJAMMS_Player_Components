// types/electron.d.ts
declare global {
  interface Window {
    electronAPI?: {
      send: (channel: string, data?: any) => void;
      on: (channel: string, callback: (data?: any) => void) => void;
      off: (channel: string, callback: (data?: any) => void) => void;
      createFullscreenWindow?: (displayId: number, videoData: any) => void;
      closeFullscreenWindow?: () => void;
      updateFullscreenVideo?: (videoData: any) => void;
      controlFullscreenPlayer?: (action: string, data?: any) => void;
    };
  }
}

export {};