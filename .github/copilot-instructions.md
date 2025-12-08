# DJAMMS Player - AI Coding Instructions

## Architecture Overview

**Multi-environment video player** with Electron desktop app, React UI, and Supabase real-time sync. Three deployment targets:
1. **Electron App** (`npm run dev`) - Main player with dual-window support (control + player windows)
2. **Web Admin** (`web/admin/`) - Remote control via Supabase commands
3. **Web Kiosk** (`web/kiosk/`) - Song request interface

### Core Architectural Patterns

**Dual Video Element System** (`src/hooks/useVideoPlayer.ts`): Two `<video>` elements (`videoA`/`videoB`) enable seamless crossfading. `activeVideoRefRef`/`inactiveVideoRefRef` are refs-to-refs that swap after each crossfade—use these, never direct element references. Crossfade only occurs on user-initiated skip (2s fade-out); videos auto-advance naturally without crossfade.

**Queue System** (`src/services/QueueService.ts`): Two queues with priority rotation:
- `priorityQueue` - One-time plays from Kiosk requests (NOT recycled)
- `activeQueue` - Continuous playlist rotation (recycled to end after playing)
- Priority items always play before active items; active items move to queue end after playing

**Supabase Real-time Sync** (`src/services/SupabaseService.ts`): Singleton service handles:
- **Command listening** via Broadcast channels (`djamms-commands:{playerId}`)
- **State sync** to `player_state` table (debounced 1s)
- **Heartbeat** every 30s for online status
- Commands also polled every 2s as fallback; deduplicated via `processedCommandIds` Set (capped at 500)

**IPC Abstraction** (`src/utils/ipc.ts`): Three adapters for environment detection:
```typescript
ElectronIPCAdapter  // window.electronAPI present
WebIPCAdapter       // CustomEvent fallback
NoOpIPCAdapter      // Silent when IPC disabled
```

## Developer Workflows

```bash
npm run dev           # Vite + Electron (wait-on port 3000)
npm run dev:vite      # Vite only on :3000
npm run build         # Vite + Rollup → dist/
npm run type-check    # TypeScript validation

# Web apps (separate package.json each)
npm run dev:admin     # web/admin dev server (:5176)
npm run dev:kiosk     # web/kiosk dev server (:5175)
npm run build:admin   # Build admin app
npm run build:kiosk   # Build kiosk app
```

**Local Video Serving**: `vite.config.js` middleware serves `.mp4` from `/Users/mikeclarkin/Music/DJAMMS/PLAYLISTS` via `/playlist/{name}/{file}`. In dev mode, even Electron uses this proxy (file:// blocked for security). Production Electron uses `file://` URLs.

**Multi-Window Architecture**: Main window loads `index.html` → `PlayerWindow` page. Player window loads `fullscreen.html`. State syncs via IPC `playback-state-update` channel.

## Code Conventions

### Video Object Fields
```typescript
interface Video {
  id: string;
  title: string;
  artist: string | null;  // null if filename doesn't match "[ID] | Artist - Title.mp4"
  src: string;            // Primary path field
  path?: string;          // Alternative
  file_path?: string;     // Alternative
  playlist: string;       // Original folder name (may have YouTube ID prefix)
  playlistDisplayName?: string;  // Clean name for UI (strips YouTube ID prefix)
}
```

### Path Resolution Order (in `useVideoPlayer.ts`)
1. `http://` or `https://` → use directly
2. `/playlist/` → prepend current origin (handles port changes)
3. Production Electron → prepend `file://`
4. Dev mode → extract from path, build proxy URL

### Supabase Command Registration
```typescript
const supabase = getSupabaseService();
supabase.onCommand('play', async (cmd) => {
  const payload = supabase.getCommandPayload<PlayCommandPayload>(cmd);
  // Handle command...
});
```

### Crossfade Timing
- `fadeDuration` prop (default 0.5s) controls CSS transition + `requestAnimationFrame` audio fade
- Early crossfade triggers at `duration - fadeDuration` via `timeupdate` event (only for auto-advancement)
- `earlyCrossfadeTriggeredRef` prevents double-triggering
- User skip uses separate fade-out logic (2s when playing, immediate when paused)

### Video Title Cleaning (`utils/playlistHelpers.ts`)
```typescript
// BULLETPROOF: Detects YouTube ID prefix by checking spaces at positions 11 and 13
// Format: "[11-char YouTube_ID] [separator] [Artist] - [Title].mp4"
// Strips first 14 characters if pattern matches
function cleanVideoTitle(title: string): string {
  if (title.length >= 14 && title.charAt(11) === ' ' && title.charAt(13) === ' ') {
    return title.substring(14);
  }
  // Fallback cleanup...
}
```

## Key Files

| File | Purpose |
|------|---------|
| `src/hooks/useVideoPlayer.ts` | Dual-video crossfade, path resolution, autoplay workarounds |
| `src/services/QueueService.ts` | Priority/active queue rotation logic |
| `src/services/SupabaseService.ts` | Real-time sync, command handling, heartbeat |
| `src/pages/PlayerWindow.tsx` | Main UI orchestration |
| `electron/main.mjs` | Window management, IPC handlers, file system access |
| `src/config/supabase.ts` | Supabase URL, keys, timing constants |
| `vite.config.js` | Vite config with playlist serving middleware |
| `utils/playlistHelpers.ts` | Video title/artist parsing, playlist display name cleaning |

## Critical Implementation Details

- **Autoplay Policy**: `directPlay()` catches blocked play, falls back to muted→unmute after 100ms
- **Dual-Play Safeguard**: 500ms interval checks if both videos playing outside crossfade, fades out incorrect one
- **Command Deduplication**: `processedCommandIds` Set (capped at 500) prevents double execution from Broadcast + polling
- **State Sync Deduplication**: `lastSyncKey` JSON comparison skips identical updates
- **Early Crossfade**: Triggers next video when `remainingTime <= fadeDuration` via `timeupdate` event
- **Electron Store**: `electron-store` persists settings in `djamms-config` (volume, window bounds, display preferences)
- **Video Loading**: Debounced play requests prevent duplicate loads; `isLoadingRef` for sync state

## Gotchas

- **Player Window**: Auto-created on startup if `enableFullscreenPlayer` setting true. Syncs via `playback-state-sync` IPC
- **Playlist Naming**: Folders may have YouTube ID prefix (`PLxxxx.PlaylistName`); use `playlistDisplayName` for UI
- **Port Handling**: Don't hardcode `:3000`—use `window.location.origin` for dev server URLs
- **Singleton Services**: `getSupabaseService()` and `getQueueService()` return singleton instances
- **Crossfade vs Direct Play**: Auto-advancement uses direct play (no crossfade); only user skip fades
- **Video End Events**: Debounced 500ms to prevent rapid-fire triggers from failed loads
