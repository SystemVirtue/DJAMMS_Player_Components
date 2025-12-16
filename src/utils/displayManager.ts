// src/utils/displayManager.ts - Cross-platform Display Detection Manager
import { logger } from './logger';

export interface DisplayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayInfo {
  id: number;
  name: string;
  label: string;
  bounds: DisplayBounds;
  workArea: DisplayBounds;
  isPrimary: boolean;
  scaleFactor?: number;
}

export interface DisplayManagerOptions {
  onDisplaysChanged?: (displays: DisplayInfo[]) => void;
  onError?: (error: Error) => void;
}

/**
 * DisplayManager - Cross-platform display detection for Electron/Tauri/Web
 * Handles display enumeration, hot-plug detection, and display selection
 */
export class DisplayManager {
  private displays: DisplayInfo[] = [];
  private primaryDisplay: DisplayInfo | null = null;
  private onDisplaysChanged?: (displays: DisplayInfo[]) => void;
  private onError?: (error: Error) => void;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: DisplayManagerOptions = {}) {
    this.onDisplaysChanged = options.onDisplaysChanged;
    this.onError = options.onError;
  }

  /**
   * Initialize the display manager and load displays
   */
  async initialize(): Promise<DisplayInfo[]> {
    await this.loadDisplays();
    this.startHotPlugDetection();
    return this.displays;
  }

  /**
   * Load all connected displays
   */
  async loadDisplays(): Promise<DisplayInfo[]> {
    try {
      // Electron environment (via preload API)
      if (this.isElectron()) {
        const electronDisplays = await (window as any).electronAPI.getDisplays();
        this.displays = electronDisplays.map((d: any, index: number) => ({
          id: d.id,
          name: d.label || `Display ${index + 1}`,
          label: `${d.label || `Display ${index + 1}`}${d.isPrimary ? ' (Primary)' : ''}`,
          bounds: d.bounds,
          workArea: d.workArea || d.bounds,
          isPrimary: d.isPrimary,
          scaleFactor: d.scaleFactor
        }));
      }
      // Tauri environment
      else if (this.isTauri()) {
        const tauriDisplays = await (window as any).__TAURI__.invoke('get_displays');
        this.displays = tauriDisplays.map((d: any, index: number) => ({
          id: d.id || index,
          name: d.name || `Display ${index + 1}`,
          label: `${d.name || `Display ${index + 1}`}${d.isPrimary ? ' (Primary)' : ''}`,
          bounds: d.bounds,
          workArea: d.workArea || d.bounds,
          isPrimary: d.isPrimary || false
        }));
      }
      // Web fallback - use screen API if available
      else {
        this.displays = await this.getWebDisplays();
      }

      // Find primary display
      this.primaryDisplay = this.displays.find(d => d.isPrimary) || this.displays[0] || null;

      // Notify listeners
      this.onDisplaysChanged?.(this.displays);

      return this.displays;
    } catch (error) {
      console.warn('Display detection failed:', error);
      this.onError?.(error as Error);
      return this.fallbackDisplays();
    }
  }

  /**
   * Get displays using Web APIs (limited support)
   */
  private async getWebDisplays(): Promise<DisplayInfo[]> {
    // Try Window Management API (Chrome 100+)
    if ('getScreenDetails' in window) {
      try {
        const screenDetails = await (window as any).getScreenDetails();
        return screenDetails.screens.map((screen: any, index: number) => ({
          id: index,
          name: screen.label || `Display ${index + 1}`,
          label: `${screen.label || `Display ${index + 1}`}${screen.isPrimary ? ' (Primary)' : ''}`,
          bounds: {
            x: screen.left,
            y: screen.top,
            width: screen.width,
            height: screen.height
          },
          workArea: {
            x: screen.availLeft,
            y: screen.availTop,
            width: screen.availWidth,
            height: screen.availHeight
          },
          isPrimary: screen.isPrimary,
          scaleFactor: screen.devicePixelRatio
        }));
      } catch {
        // Permission denied or not supported
      }
    }

    // Fallback to basic screen info
    return this.fallbackDisplays();
  }

  /**
   * Fallback display info when detection fails
   */
  private fallbackDisplays(): DisplayInfo[] {
    const fallback: DisplayInfo = {
      id: 0,
      name: 'Default Display',
      label: 'Default Display (Primary)',
      bounds: {
        x: 0,
        y: 0,
        width: window.screen?.width || 1920,
        height: window.screen?.height || 1080
      },
      workArea: {
        x: 0,
        y: 0,
        width: window.screen?.availWidth || 1920,
        height: window.screen?.availHeight || 1080
      },
      isPrimary: true,
      scaleFactor: window.devicePixelRatio || 1
    };

    this.displays = [fallback];
    this.primaryDisplay = fallback;
    return this.displays;
  }

  /**
   * Start polling for display changes (hot-plug detection)
   */
  startHotPlugDetection(intervalMs: number = 5000): void {
    this.stopHotPlugDetection();
    
    let previousCount = this.displays.length;
    
    this.pollInterval = setInterval(async () => {
      await this.loadDisplays();
      
      // Only notify if display count changed
      if (this.displays.length !== previousCount) {
        previousCount = this.displays.length;
        logger.debug('Display configuration changed:', this.displays.length, 'displays');
      }
    }, intervalMs);
  }

  /**
   * Stop hot-plug detection polling
   */
  stopHotPlugDetection(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Get all displays
   */
  getDisplays(): DisplayInfo[] {
    return [...this.displays];
  }

  /**
   * Get the primary display
   */
  getPrimaryDisplay(): DisplayInfo | null {
    return this.primaryDisplay;
  }

  /**
   * Get a display by ID
   */
  getDisplayById(id: number): DisplayInfo | undefined {
    return this.displays.find(d => d.id === id);
  }

  /**
   * Get a display by index
   */
  getDisplayByIndex(index: number): DisplayInfo | undefined {
    return this.displays[index];
  }

  /**
   * Get secondary displays (non-primary)
   */
  getSecondaryDisplays(): DisplayInfo[] {
    return this.displays.filter(d => !d.isPrimary);
  }

  /**
   * Get the best display for the player window
   * Prefers secondary display, falls back to primary
   */
  getPreferredPlayerDisplay(): DisplayInfo | null {
    const secondary = this.getSecondaryDisplays();
    return secondary[0] || this.primaryDisplay;
  }

  /**
   * Calculate centered window position on a display
   */
  getCenteredPosition(displayId: number, windowWidth: number, windowHeight: number): { x: number; y: number } {
    const display = this.getDisplayById(displayId) || this.primaryDisplay;
    if (!display) {
      return { x: 0, y: 0 };
    }

    const workArea = display.workArea;
    return {
      x: workArea.x + Math.round((workArea.width - windowWidth) / 2),
      y: workArea.y + Math.round((workArea.height - windowHeight) / 2)
    };
  }

  /**
   * Get window dimensions as percentage of display
   */
  getWindowSize(displayId: number, widthPercent: number = 0.8, heightPercent: number = 0.8): { width: number; height: number } {
    const display = this.getDisplayById(displayId) || this.primaryDisplay;
    if (!display) {
      return { width: 1280, height: 720 };
    }

    return {
      width: Math.round(display.workArea.width * widthPercent),
      height: Math.round(display.workArea.height * heightPercent)
    };
  }

  /**
   * Check if running in Electron
   */
  private isElectron(): boolean {
    return typeof window !== 'undefined' && !!(window as any).electronAPI;
  }

  /**
   * Check if running in Tauri
   */
  private isTauri(): boolean {
    return typeof window !== 'undefined' && !!(window as any).__TAURI__;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopHotPlugDetection();
    this.displays = [];
    this.primaryDisplay = null;
  }
}

// Singleton instance for easy access
let displayManagerInstance: DisplayManager | null = null;

export function getDisplayManager(options?: DisplayManagerOptions): DisplayManager {
  if (!displayManagerInstance) {
    displayManagerInstance = new DisplayManager(options);
  }
  return displayManagerInstance;
}

export function destroyDisplayManager(): void {
  if (displayManagerInstance) {
    displayManagerInstance.destroy();
    displayManagerInstance = null;
  }
}
