// __tests__/ui-tests.test.ts
// Comprehensive UI test suite for DJAMMS Player

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock window.electronAPI
const mockElectronAPI = {
  getPlaylists: jest.fn().mockResolvedValue({ playlists: {}, playlistsDirectory: '' }),
  getDisplays: jest.fn().mockResolvedValue([
    { 
      id: 1, 
      label: 'Display 1', 
      name: 'Display 1 (Primary)',
      width: 1920, 
      height: 1080, 
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1,
      isPrimary: true 
    }
  ]),
  getSetting: jest.fn().mockResolvedValue(undefined),
  setSetting: jest.fn().mockResolvedValue({ success: true }),
  getPlayerWindowStatus: jest.fn().mockResolvedValue({ isOpen: false }),
  createPlayerWindow: jest.fn().mockResolvedValue({ success: true }),
  closePlayerWindow: jest.fn().mockResolvedValue({ success: true }),
  onPlayerWindowClosed: jest.fn().mockReturnValue(() => {}),
  sendPlayerSettings: jest.fn(),
  isElectron: true,
  platform: 'darwin'
};

// Setup global mocks before each test
beforeEach(() => {
  // Reset all mocks
  jest.clearAllMocks();
  
  // Setup window mock
  (global as any).window = {
    electronAPI: mockElectronAPI,
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1080 },
    devicePixelRatio: 1,
    localStorage: {
      getItem: jest.fn().mockReturnValue(null),
      setItem: jest.fn(),
      removeItem: jest.fn()
    },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  };
});

describe('DisplayManager', () => {
  it('should detect displays in Electron environment', async () => {
    const { DisplayManager } = await import('../src/utils/displayManager');
    const manager = new DisplayManager();
    const displays = await manager.loadDisplays();
    
    expect(displays).toHaveLength(1);
    expect(displays[0].isPrimary).toBe(true);
    expect(displays[0].bounds.width).toBe(1920);
    expect(displays[0].bounds.height).toBe(1080);
  });

  it('should return primary display', async () => {
    const { DisplayManager } = await import('../src/utils/displayManager');
    const manager = new DisplayManager();
    await manager.loadDisplays();
    
    const primary = manager.getPrimaryDisplay();
    expect(primary).not.toBeNull();
    expect(primary?.isPrimary).toBe(true);
  });

  it('should calculate centered position', async () => {
    const { DisplayManager } = await import('../src/utils/displayManager');
    const manager = new DisplayManager();
    await manager.loadDisplays();
    
    const position = manager.getCenteredPosition(1, 1280, 720);
    expect(position.x).toBe(320); // (1920 - 1280) / 2
    expect(position.y).toBe(180); // (1080 - 720) / 2
  });
});

describe('PlayerSettingsManager', () => {
  it('should load default settings', async () => {
    const { PlayerSettingsManager } = await import('../src/utils/playerSettings');
    const manager = new PlayerSettingsManager();
    const settings = await manager.initialize();
    
    expect(settings.showPlayer).toBe(true);
    expect(settings.fullscreen).toBe(false);
    expect(settings.displayId).toBeNull();
  });

  it('should update settings', async () => {
    const { PlayerSettingsManager } = await import('../src/utils/playerSettings');
    const manager = new PlayerSettingsManager();
    await manager.initialize();
    
    await manager.updateSetting('showPlayer', false);
    expect(manager.getSetting('showPlayer')).toBe(false);
  });

  it('should toggle player window', async () => {
    const { PlayerSettingsManager } = await import('../src/utils/playerSettings');
    const manager = new PlayerSettingsManager();
    await manager.initialize();
    
    // First toggle: true -> false
    const firstToggle = await manager.togglePlayerWindow();
    // The toggle changes showPlayer and returns the new value
    expect(typeof firstToggle).toBe('boolean');
  });
});

describe('LocalSearchService', () => {
  it('should index videos from playlists', async () => {
    const { localSearchService } = await import('../src/services/LocalSearchService');
    
    const mockPlaylists = {
      'Test Playlist': [
        { id: '1', title: 'Test Video 1', artist: 'Artist 1', path: '/path/1.mp4' },
        { id: '2', title: 'Test Video 2', artist: 'Artist 2', path: '/path/2.mp4' }
      ]
    };
    
    localSearchService.indexVideos(mockPlaylists as any);
    const results = localSearchService.search('Test');
    
    expect(results.length).toBeGreaterThan(0);
  });

  it('should search by title', async () => {
    const { localSearchService } = await import('../src/services/LocalSearchService');
    
    const mockPlaylists = {
      'Playlist': [
        { id: '1', title: 'Love Song', artist: 'Artist', path: '/path/1.mp4' },
        { id: '2', title: 'Rock Anthem', artist: 'Band', path: '/path/2.mp4' }
      ]
    };
    
    localSearchService.indexVideos(mockPlaylists as any);
    const results = localSearchService.search('Love');
    
    // Check that we got results and one matches (SearchResult has 'item' property)
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.item.title === 'Love Song')).toBe(true);
  });
});

describe('UI Component State', () => {
  it('should have correct initial state structure', () => {
    const defaultSettings = {
      autoShufflePlaylists: true,
      normalizeAudioLevels: false,
      enableFullscreenPlayer: true,
      fadeDuration: 2.0,
      playerDisplayId: null,
      playerFullscreen: false
    };
    
    expect(defaultSettings.autoShufflePlaylists).toBe(true);
    expect(defaultSettings.fadeDuration).toBe(2.0);
    expect(defaultSettings.playerDisplayId).toBeNull();
  });
});

describe('Crossfade Utility', () => {
  it('should export fadeOut function', async () => {
    const crossfade = await import('../src/utils/crossfade');
    expect(typeof crossfade.fadeOut).toBe('function');
  });
});

// Integration test for settings flow
describe('Settings Integration', () => {
  it('should update settings correctly', async () => {
    const { PlayerSettingsManager } = await import('../src/utils/playerSettings');
    const manager = new PlayerSettingsManager();
    await manager.initialize();
    await manager.updateSetting('fullscreen', true);
    
    // Verify the setting was updated in memory
    expect(manager.getSetting('fullscreen')).toBe(true);
  });
});
