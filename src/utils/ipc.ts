// utils/ipc.ts
import { IPCAdapter } from '../types';

export class ElectronIPCAdapter implements IPCAdapter {
  send(channel: string, data?: any): void {
    if (window.electronAPI && window.electronAPI.send) {
      window.electronAPI.send(channel, data);
    }
  }

  on(channel: string, callback: (data?: any) => void): void {
    if (window.electronAPI && window.electronAPI.on) {
      window.electronAPI.on(channel, callback);
    }
  }

  off(channel: string, callback: (data?: any) => void): void {
    if (window.electronAPI && window.electronAPI.off) {
      window.electronAPI.off(channel, callback);
    }
  }
}

export class WebIPCAdapter implements IPCAdapter {
  private listeners: Map<string, ((data?: any) => void)[]> = new Map();

  send(channel: string, data?: any): void {
    // No-op for web environment, or emit custom events
    console.log('[WebIPC]', channel, data);
    // Could dispatch custom events for web integration
    window.dispatchEvent(new CustomEvent(`djamms:${channel}`, { detail: data }));
  }

  on(channel: string, callback: (data?: any) => void): void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, []);
    }
    this.listeners.get(channel)!.push(callback);

    // Listen for custom events in web environment
    const eventHandler = (event: CustomEvent) => {
      callback(event.detail);
    };
    window.addEventListener(`djamms:${channel}`, eventHandler as EventListener);
  }

  off(channel: string, callback: (data?: any) => void): void {
    const channelListeners = this.listeners.get(channel);
    if (channelListeners) {
      const index = channelListeners.indexOf(callback);
      if (index > -1) {
        channelListeners.splice(index, 1);
      }
    }
  }
}

export class NoOpIPCAdapter implements IPCAdapter {
  send(channel: string, data?: any): void {
    // No-op
  }

  on(channel: string, callback: (data?: any) => void): void {
    // No-op
  }

  off(channel: string, callback: (data?: any) => void): void {
    // No-op
  }
}

export function createIPCAdapter(enableIPC: boolean = false): IPCAdapter {
  if (enableIPC && window.electronAPI) {
    return new ElectronIPCAdapter();
  } else if (enableIPC) {
    return new WebIPCAdapter();
  } else {
    return new NoOpIPCAdapter();
  }
}