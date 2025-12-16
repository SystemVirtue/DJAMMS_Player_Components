# DJAMMS Unified Admin UI Implementation Guide

## 🎯 **Overview**

This guide provides step-by-step instructions for Cursor AI to implement a **unified admin interface** that works identically in both Electron (local desktop) and web browser (remote access) environments, while maintaining all existing functionality and real-time synchronization.

## 📋 **Context & Requirements**

### **Current Architecture**
- **Electron Admin**: `src/pages/AdminConsole.tsx` (435 lines, basic functionality)
- **Web Admin**: `src/web/admin/src/App.tsx` (2100+ lines, full-featured)
- **Shared Components**: NowPlaying, ComingUpTicker, SearchInterface, thumbnails
- **Communication**: Electron uses IPC, Web uses Supabase

### **Goal**
Create a single `UnifiedAdmin` component that:
- ✅ Works identically in Electron and web environments
- ✅ Automatically detects environment and uses appropriate APIs
- ✅ Maintains all existing functionality
- ✅ Provides real-time synchronization
- ✅ Eliminates code duplication

### **Key Challenges**
- Environment detection (Electron vs Web)
- Unified API abstraction (IPC vs Supabase)
- Real-time synchronization
- Platform-specific features
- Maintained backwards compatibility

---

## 🚀 **Implementation Steps**

### **Phase 1: Create Unified API Abstraction Layer**

#### **Step 1.1: Create UnifiedAPI Service**
```typescript
// File: src/services/UnifiedAPI.ts
// Create new file with unified communication abstraction

import { insertCommand, subscribeToPlayerState, getPlayerState, getAllLocalVideos } from '@shared/supabase-client';
import type { SupabasePlayerState, QueueVideoItem, Video } from '../types';

export class UnifiedAPI {
  private isElectron: boolean;
  private playerId: string;

  constructor() {
    this.isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
    this.playerId = this.getPlayerId();
  }

  // Unified playlist loading
  async getPlaylists(): Promise<{ playlists: Record<string, Video[]>; playlistsDirectory: string }> {
    if (this.isElectron) {
      return await (window as any).electronAPI.getPlaylists();
    } else {
      return await this.getPlaylistsFromSupabase();
    }
  }

  // Unified command sending
  async sendCommand(command: string, data?: any): Promise<any> {
    if (this.isElectron) {
      return await (window as any).electronAPI.sendCommand(command, data);
    } else {
      return await insertCommand(command, data, 'web-admin', this.playerId);
    }
  }

  // Unified player state access
  async getPlayerState(): Promise<SupabasePlayerState | null> {
    if (this.isElectron) {
      return await (window as any).electronAPI.getPlayerState();
    } else {
      return await getPlayerState(this.playerId);
    }
  }

  // Unified real-time subscription
  subscribeToPlayerState(callback: (state: SupabasePlayerState) => void): () => void {
    if (this.isElectron) {
      const handler = (_event: any, state: SupabasePlayerState) => callback(state);
      (window as any).electronAPI.on('player-state-update', handler);
      return () => (window as any).electronAPI.off('player-state-update', handler);
    } else {
      return subscribeToPlayerState(this.playerId, callback);
    }
  }

  // Helper methods
  private async getPlaylistsFromSupabase(): Promise<{ playlists: Record<string, Video[]>; playlistsDirectory: string }> {
    const videos = await getAllLocalVideos(this.playerId, null);
    const playlists: Record<string, Video[]> = {};

    videos.forEach(video => {
      const playlist = (video.metadata as any)?.playlist || 'Unknown';
      if (!playlists[playlist]) playlists[playlist] = [];
      playlists[playlist].push(video as Video);
    });

    return { playlists, playlistsDirectory: '' };
  }

  private getPlayerId(): string {
    // Priority: URL param > localStorage > default
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('playerId') ||
           localStorage.getItem('djamms_player_id') ||
           'DJAMMS_DEMO';
  }

  get isElectronMode(): boolean {
    return this.isElectron;
  }

  get currentPlayerId(): string {
    return this.playerId;
  }
}

// Export singleton
export const unifiedAPI = new UnifiedAPI();
```

#### **Step 1.2: Create Platform Detection Hook**
```typescript
// File: src/hooks/usePlatformFeatures.ts
// Create new file for platform-specific feature detection

import { useMemo } from 'react';

export interface PlatformFeatures {
  // Core features (available everywhere)
  canUseRealtimeSync: boolean;

  // Electron-only features
  canUseLocalFiles: boolean;
  canAccessSystemMenus: boolean;
  canCreateMultipleWindows: boolean;
  canUseFullscreenOnDisplays: boolean;

  // Web-only features
  canUseServiceWorkers: boolean;
  canInstallAsPWA: boolean;
  requiresPlayerIdSelection: boolean;

  // UI adaptation flags
  showLocalFileBrowser: boolean;
  showPlayerIdSelector: boolean;
  showSystemSettings: boolean;
  showConnectionStatus: boolean;
}

export const usePlatformFeatures = (): PlatformFeatures => {
  return useMemo(() => {
    const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
    const isWeb = !isElectron;

    return {
      // Core features
      canUseRealtimeSync: true,

      // Electron features
      canUseLocalFiles: isElectron,
      canAccessSystemMenus: isElectron,
      canCreateMultipleWindows: isElectron,
      canUseFullscreenOnDisplays: isElectron,

      // Web features
      canUseServiceWorkers: isWeb && 'serviceWorker' in navigator,
      canInstallAsPWA: isWeb,
      requiresPlayerIdSelection: isWeb,

      // UI flags
      showLocalFileBrowser: isElectron,
      showPlayerIdSelector: isWeb,
      showSystemSettings: isElectron,
      showConnectionStatus: isWeb,
    };
  }, []);
};
```

### **Phase 2: Create Shared Admin Components**

#### **Step 2.1: Extract Core Admin Components**
```typescript
// File: src/components/admin/shared/QueueManager.tsx
// Extract from existing web admin, make environment-agnostic

import React from 'react';
import { unifiedAPI } from '../../../services/UnifiedAPI';
import { usePlatformFeatures } from '../../../hooks/usePlatformFeatures';

interface QueueManagerProps {
  playerState: SupabasePlayerState | null;
  onCommand: (command: string, data?: any) => Promise<void>;
}

export const QueueManager: React.FC<QueueManagerProps> = ({
  playerState,
  onCommand
}) => {
  const { showSystemSettings } = usePlatformFeatures();

  const handleSkip = async (index: number) => {
    await onCommand('skip', { index });
  };

  const handleClearQueue = async () => {
    await onCommand('queue_clear');
  };

  return (
    <div className="queue-manager">
      <div className="queue-header">
        <h2>Queue Management</h2>
        <button onClick={handleClearQueue}>Clear Queue</button>
      </div>

      {/* Now Playing Section */}
      {playerState?.nowPlaying && (
        <div className="now-playing">
          <h3>Now Playing</h3>
          <div className="track-info">
            <span className="title">{playerState.nowPlaying.title}</span>
            <span className="artist">{playerState.nowPlaying.artist}</span>
          </div>
        </div>
      )}

      {/* Active Queue */}
      <div className="active-queue">
        <h3>Up Next</h3>
        <div className="queue-list">
          {playerState?.activeQueue?.slice(1).map((item, index) => (
            <div key={item.id} className="queue-item">
              <span className="position">{index + 1}</span>
              <span className="title">{item.title}</span>
              <button onClick={() => handleSkip(index + 1)}>Skip</button>
            </div>
          ))}
        </div>
      </div>

      {/* Priority Queue */}
      {playerState?.priorityQueue?.length > 0 && (
        <div className="priority-queue">
          <h3>Priority Queue</h3>
          <div className="priority-list">
            {playerState.priorityQueue.map((item, index) => (
              <div key={item.id} className="priority-item">
                <span className="priority-badge">P{index + 1}</span>
                <span className="title">{item.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
```

#### **Step 2.2: Create Search Interface Component**
```typescript
// File: src/components/admin/shared/SearchInterface.tsx
// Extract and unify search functionality

import React, { useState, useEffect } from 'react';
import { unifiedAPI } from '../../../services/UnifiedAPI';
import { VideoResultCard } from '../../shared/VideoResultCard';

interface SearchInterfaceProps {
  playlists: Record<string, Video[]>;
  onCommand: (command: string, data?: any) => Promise<void>;
}

export const SearchInterface: React.FC<SearchInterfaceProps> = ({
  playlists,
  onCommand
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Video[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const performSearch = async () => {
      if (!searchQuery.trim()) {
        // Browse mode - show all videos
        const allVideos = Object.values(playlists).flat();
        setSearchResults(allVideos);
        return;
      }

      setIsSearching(true);
      try {
        // Use unified API for search
        const results = await unifiedAPI.searchVideos(searchQuery);
        setSearchResults(results);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(performSearch, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, playlists]);

  const handleAddToQueue = async (video: Video) => {
    await onCommand('queue_add', {
      video: {
        id: video.id,
        title: video.title,
        artist: video.artist,
        path: video.src || video.path,
        duration: video.duration
      }
    });
  };

  return (
    <div className="search-interface">
      <div className="search-header">
        <input
          type="text"
          placeholder="Search music..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        {isSearching && <span>Searching...</span>}
      </div>

      <div className="search-results">
        {searchResults.map(video => (
          <VideoResultCard
            key={video.id}
            video={video}
            onAddToQueue={() => handleAddToQueue(video)}
          />
        ))}
      </div>
    </div>
  );
};
```

#### **Step 2.3: Create Settings Panel**
```typescript
// File: src/components/admin/shared/SettingsPanel.tsx
// Unified settings with platform-specific options

import React from 'react';
import { unifiedAPI } from '../../../services/UnifiedAPI';
import { usePlatformFeatures } from '../../../hooks/usePlatformFeatures';

interface SettingsPanelProps {
  onCommand: (command: string, data?: any) => Promise<void>;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onCommand }) => {
  const platform = usePlatformFeatures();

  const handleSettingChange = async (setting: string, value: any) => {
    await onCommand('setting_update', { setting, value });
  };

  return (
    <div className="settings-panel">
      <h2>Settings</h2>

      {/* Universal Settings */}
      <div className="setting-group">
        <h3>Playback</h3>
        <label>
          <input
            type="checkbox"
            onChange={(e) => handleSettingChange('autoShuffle', e.target.checked)}
          />
          Auto-shuffle playlists
        </label>
      </div>

      {/* Electron-only Settings */}
      {platform.showSystemSettings && (
        <div className="setting-group">
          <h3>System</h3>
          <button onClick={() => onCommand('open_file_browser')}>
            Select Music Directory
          </button>
          <button onClick={() => onCommand('refresh_library')}>
            Refresh Music Library
          </button>
        </div>
      )}

      {/* Web-only Settings */}
      {platform.showPlayerIdSelector && (
        <div className="setting-group">
          <h3>Connection</h3>
          <label>
            Player ID:
            <input
              type="text"
              value={unifiedAPI.currentPlayerId}
              onChange={(e) => {
                localStorage.setItem('djamms_player_id', e.target.value);
                window.location.reload(); // Reload to reconnect
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
};
```

### **Phase 3: Create Main UnifiedAdmin Component**

#### **Step 3.1: Main Unified Admin Component**
```typescript
// File: src/components/admin/UnifiedAdmin.tsx
// Main unified admin component

import React, { useState, useEffect } from 'react';
import { unifiedAPI } from '../../services/UnifiedAPI';
import { usePlatformFeatures } from '../../hooks/usePlatformFeatures';
import { QueueManager } from './shared/QueueManager';
import { SearchInterface } from './shared/SearchInterface';
import { SettingsPanel } from './shared/SettingsPanel';
import type { SupabasePlayerState, Video } from '../../types';

type TabId = 'queue' | 'search' | 'settings';

export const UnifiedAdmin: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('queue');
  const [playerState, setPlayerState] = useState<SupabasePlayerState | null>(null);
  const [playlists, setPlaylists] = useState<Record<string, Video[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const platform = usePlatformFeatures();

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [playlistData, stateData] = await Promise.all([
          unifiedAPI.getPlaylists(),
          unifiedAPI.getPlayerState()
        ]);

        setPlaylists(playlistData.playlists);
        setPlayerState(stateData);
      } catch (err) {
        console.error('Failed to load admin data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubscribe = unifiedAPI.subscribeToPlayerState((state) => {
      setPlayerState(state);
    });

    return unsubscribe;
  }, []);

  const handleCommand = async (command: string, data?: any) => {
    try {
      await unifiedAPI.sendCommand(command, data);
    } catch (err) {
      console.error('Command failed:', err);
      setError(`Command failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (isLoading) {
    return (
      <div className="admin-loading">
        <div className="loading-spinner"></div>
        <p>Loading Admin Console...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-error">
        <h2>Error Loading Admin Console</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="unified-admin">
      <header className="admin-header">
        <div className="header-left">
          <h1>DJAMMS Admin Console</h1>
          {platform.showConnectionStatus && (
            <div className="connection-status">
              Player: {unifiedAPI.currentPlayerId}
            </div>
          )}
        </div>

        <nav className="admin-tabs">
          <button
            className={activeTab === 'queue' ? 'active' : ''}
            onClick={() => setActiveTab('queue')}
          >
            Queue
          </button>
          <button
            className={activeTab === 'search' ? 'active' : ''}
            onClick={() => setActiveTab('search')}
          >
            Search
          </button>
          <button
            className={activeTab === 'settings' ? 'active' : ''}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </nav>
      </header>

      <main className="admin-content">
        {activeTab === 'queue' && (
          <QueueManager
            playerState={playerState}
            onCommand={handleCommand}
          />
        )}
        {activeTab === 'search' && (
          <SearchInterface
            playlists={playlists}
            onCommand={handleCommand}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsPanel
            onCommand={handleCommand}
          />
        )}
      </main>
    </div>
  );
};
```

### **Phase 4: Update Entry Points**

#### **Step 4.1: Update Electron Entry Point**
```typescript
// File: src/pages/AdminConsole.tsx
// Replace existing content with unified component

import React from 'react';
import { UnifiedAdmin } from '../components/admin/UnifiedAdmin';

export const AdminConsole: React.FC = () => {
  // Environment-specific initialization if needed
  return <UnifiedAdmin />;
};
```

#### **Step 4.2: Update Web Entry Point**
```typescript
// File: src/web/admin/src/App.tsx
// Replace complex web admin with simple wrapper

import React from 'react';
import { ConnectPlayerModal, usePlayer } from '@shared/ConnectPlayerModal';
import { UnifiedAdmin } from '../../../components/admin/UnifiedAdmin';

const AdminApp: React.FC = () => {
  return <UnifiedAdmin />;
};

export default function App() {
  return (
    <ConnectPlayerModal title="DJAMMS Admin Console">
      <AdminApp />
    </ConnectPlayerModal>
  );
}
```

### **Phase 5: Update Build Configuration**

#### **Step 5.1: Update Main Vite Config**
```javascript
// File: vite.config.js
// Add platform definition for Electron

export default defineConfig({
  // ... existing config
  define: {
    __PLATFORM__: JSON.stringify('electron')
  }
});
```

#### **Step 5.2: Update Web Admin Vite Config**
```javascript
// File: src/web/admin/vite.config.ts
// Update to import from shared location

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, '../../../web/shared'),
      '@components': path.resolve(__dirname, '../../../src/components'),
    }
  },
  define: {
    __PLATFORM__: JSON.stringify('web')
  }
});
```

### **Phase 6: Add Missing UnifiedAPI Methods**

#### **Step 6.1: Extend UnifiedAPI**
```typescript
// File: src/services/UnifiedAPI.ts
// Add missing methods used by components

export class UnifiedAPI {
  // ... existing methods

  // Add search functionality
  async searchVideos(query: string): Promise<Video[]> {
    if (this.isElectron) {
      // Use Electron's local search
      return await (window as any).electronAPI.searchVideos(query);
    } else {
      // Use Supabase search
      const results = await searchLocalVideos(query, this.playerId, 100);
      return results as Video[];
    }
  }

  // Add player state update subscription
  subscribeToPlayerState(callback: (state: any) => void): () => void {
    if (this.isElectron) {
      const handler = (_event: any, state: any) => callback(state);
      (window as any).electronAPI.on('player-state-update', handler);
      return () => (window as any).electronAPI.off('player-state-update', handler);
    } else {
      return subscribeToPlayerState(this.playerId, callback);
    }
  }
}
```

### **Phase 7: Update Package.json Scripts**

#### **Step 7.1: Add Unified Build Scripts**
```json
// File: package.json
{
  "scripts": {
    "build:unified": "npm run build:kiosk && npm run build:admin",
    "dev:admin:unified": "npm run dev --prefix src/web/admin",
    "serve:admin": "npm run build:admin && npx serve dist-admin -p 5176",
    "serve:kiosk": "npm run build:kiosk && npx serve dist-kiosk -p 5175"
  }
}
```

---

## 🧪 **Testing & Validation**

### **Test 1: Electron Environment**
```bash
# Test Electron build
npm run build:electron
npm run start

# Verify:
# - Admin console opens via #/admin route
# - All functionality works (queue, search, settings)
# - Real-time updates work
# - Local file access works
```

### **Test 2: Web Environment**
```bash
# Test web admin
npm run serve:admin

# Verify:
# - Web admin loads at http://localhost:5176
# - Player ID selection works
# - Real-time sync with player works
# - All admin functions work remotely
```

### **Test 3: Feature Parity**
```typescript
// Test checklist for both environments:
// ✅ Queue management (skip, clear, reorder)
// ✅ Search and browse functionality
// ✅ Settings management
// ✅ Real-time state synchronization
// ✅ Error handling
// ✅ Platform-specific features (local files in Electron, connection status in web)
```

---

## ⚠️ **Critical Implementation Notes**

### **Maintain Functionality Requirements**
1. **DO NOT BREAK** existing Electron admin console functionality
2. **PRESERVE** all web admin features and real-time sync
3. **MAINTAIN** backwards compatibility with existing APIs
4. **ENSURE** shared components work in both environments

### **Environment Detection**
- Use `__PLATFORM__` define for build-time detection
- Use `unifiedAPI.isElectronMode` for runtime checks
- Never assume environment - always check dynamically

### **API Compatibility**
- Electron IPC calls must remain unchanged
- Supabase integration must preserve existing functionality
- Real-time subscriptions must work identically

### **Error Handling**
- Graceful degradation if APIs unavailable
- Clear error messages for troubleshooting
- Fallback behavior when features don't work

### **Performance Considerations**
- Lazy load platform-specific components
- Debounce real-time updates appropriately
- Minimize bundle size increases

---

## 🎯 **Success Criteria**

- [ ] **UnifiedAdmin component** works in both Electron and web
- [ ] **Zero code duplication** between platforms
- [ ] **Identical functionality** across all environments
- [ ] **Real-time sync** works seamlessly
- [ ] **Backwards compatibility** maintained
- [ ] **Platform-specific features** work correctly
- [ ] **Build and deployment** work for all targets

---

## 🚨 **Rollback Plan**

If issues arise:
1. Keep original `src/pages/AdminConsole.tsx` as backup
2. Keep original `src/web/admin/src/App.tsx` as backup
3. Test each phase incrementally
4. Have git branches for each phase
5. Document any breaking changes

---

## 📝 **Implementation Checklist**

### **Phase 1: Core Infrastructure** ✅
- [ ] Create UnifiedAPI service
- [ ] Create usePlatformFeatures hook
- [ ] Test environment detection

### **Phase 2: Shared Components** ✅
- [ ] Extract QueueManager
- [ ] Extract SearchInterface
- [ ] Extract SettingsPanel
- [ ] Test component isolation

### **Phase 3: Main Component** ✅
- [ ] Create UnifiedAdmin component
- [ ] Implement tab navigation
- [ ] Add error handling

### **Phase 4: Entry Points** ✅
- [ ] Update Electron AdminConsole.tsx
- [ ] Update Web App.tsx
- [ ] Test both entry points

### **Phase 5: Build Config** ✅
- [ ] Update Vite configs
- [ ] Add platform defines
- [ ] Test builds

### **Phase 6: Integration** ✅
- [ ] Extend UnifiedAPI methods
- [ ] Add missing functionality
- [ ] Test API compatibility

### **Phase 7: Deployment** ✅
- [ ] Update package.json scripts
- [ ] Test all deployment targets
- [ ] Validate functionality

---

**Ready to implement!** Follow this guide step-by-step to create a unified admin interface that maintains all existing functionality while eliminating code duplication and providing seamless cross-platform operation.
