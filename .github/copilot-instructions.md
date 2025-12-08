# DJAMMS Player - AI Coding Instructions

## Architecture Overview

**Multi-environment video player** with Electron desktop app, React UI, and Supabase real-time sync. Three deployment targets:
1. **Electron App** (`npm run dev`) - Main player with dual-window support (control + player windows)
2. **Web Admin** (`web/admin/`) - Remote control via Supabase commands  
3. **Web Kiosk** (`web/kiosk/`) - Song request interface

Each web app has separate `package.json` and runs independently.

### Core Architectural Patterns

**Dual-Mode Video Player System** (`src/hooks/useVideoPlayer.ts`): 
Two `<video>` elements (`videoA`/`videoB`) support dual playback modes:
- **Manual Mode** (default): Videos play to completion, then next starts immediately (clean cut)
- **Seamless Mode**: Next video starts X seconds before current ends (overlap crossfade)

Key implementation details:
- `activeVideoIndexRef` (0|1) tracks which element is active
- `transitionLockRef` prevents race conditions during transitions
- Single transition entry point via `transitionToNext(reason)` handles all video advancement
- `crossfadeModeRef` allows runtime mode switching via `setCrossfadeMode('manual'|'seamless')`
- Skip function (`skip()`) always fades out current video regardless of mode
- Early crossfade logic only activates in seamless mode

**Queue System** (`src/services/QueueService.ts`): Two queues with priority rotation:
- `priorityQueue` - One-time plays from Kiosk requests (NOT recycled)
- `activeQueue` - Continuous playlist rotation (recycled to end after playing)
- Priority items always play before active items
- Singleton pattern: use `QueueService.getInstance()` or `getQueueService()`

**Supabase Real-time Sync** (`src/services/SupabaseService.ts`): Singleton service handles:
- **Command listening** via Broadcast channels (`djamms-commands:{playerId}`)
- **State sync** to `player_state` table (debounced 1s)
- **Heartbeat** every 30s for online status
- Commands also polled every 2s as fallback; deduplicated via `processedCommandIds` Set (capped at 500)
- Register handlers: `supabase.onCommand('commandType', handler)`

**IPC Abstraction** (`src/utils/ipc.ts`): Three adapters for environment detection:
```typescript
ElectronIPCAdapter  // window.electronAPI present
WebIPCAdapter       // CustomEvent via window.dispatchEvent
NoOpIPCAdapter      // Silent when IPC disabled
```
Use `createIPCAdapter(enableIPC)` to auto-detect environment.

**Display Management**: Multi-display detection and player window positioning handled via Electron IPC in `electron/main.cjs`. Settings persist via `electron-store` in `djamms-config`.

## Developer Workflows

```bash
# Main development
npm run dev           # Vite dev server + Electron (waits for :3000)
npm run dev:vite      # Vite only on :3000 (for web testing)
npm run build         # Vite build → dist/ + Rollup library build
npm run type-check    # TypeScript validation (no emit)
npm test              # Jest tests (jsdom environment)

# Web apps (separate package.json in each)
npm run dev:admin     # Vite dev server for web/admin
npm run dev:kiosk     # Vite dev server for web/kiosk
npm run install:web   # Install deps for both web apps

# Electron builds
npm run build:electron      # All platforms
npm run build:electron:mac  # macOS DMG (arm64 + x64)
npm run build:electron:win  # Windows installer
```

**Local Video Serving**: `vite.config.js` middleware serves `.mp4` from `/Users/mikeclarkin/Music/DJAMMS/PLAYLISTS` via `/playlist/{name}/{file}`. In dev mode, even Electron uses this proxy (file:// blocked for security). Port 3000 is hard-required (`strictPort: true`) for Electron `wait-on`.

**Multi-Window Architecture**: Main window loads `index.html` → `PlayerWindow.tsx`. Player window loads `fullscreen.html` → `fullscreen.tsx`. State syncs via IPC `playback-state-update` and `playback-state-sync` channels. Player window auto-created on startup if `enableFullscreenPlayer` setting is `true`.

**Build System**: 
- Vite builds Electron renderer code to `dist/` with dual entry points (`index.html`, `fullscreen.html`)
- Rollup builds reusable React library to `dist/index.esm.js` (ESM) and `dist/index.cjs.js` (CJS)
- External deps (`react`, `react-dom`, `@supabase/supabase-js`) not bundled in library

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
  playlistDisplayName?: string;  // Clean name for UI (via getPlaylistDisplayName)
}
```

### YouTube Naming Conventions (`src/utils/playlistHelpers.ts`)
**Playlist folders**: May have YouTube ID prefix (e.g., `PLJ7vMjpVbhBWLWJpweVDki43Wlcqzsqdu.DJAMMS_Default`). Use `getPlaylistDisplayName(folderName)` to strip prefix for UI display.

**Video filenames**: Pattern is `[Artist] - [Title] -- [YouTube_ID].mp4`. Use `cleanVideoTitle(title)` to strip YouTube IDs for UI display.

### Path Resolution Order (in `useVideoPlayer.ts`)
1. `http://` or `https://` → use directly
2. `/playlist/` → prepend current origin (handles port changes)
3. Production Electron → prepend `file://`
4. Dev mode → extract playlist/filename from path, build `/playlist/` proxy URL

### Supabase Command Registration
```typescript
const supabase = getSupabaseService();
supabase.onCommand('play', async (cmd) => {
  const payload = supabase.getCommandPayload<PlayCommandPayload>(cmd);
  // Handle command...
});
```

### Crossfade Modes and Timing

**CrossfadeMode Types** (`src/types/index.ts`):
```typescript
type CrossfadeMode = 'manual' | 'seamless';
type TransitionReason = 'natural_end' | 'early_crossfade' | 'user_skip' | 'manual_next' | 'error';
```

**Manual Mode** (default):
- Videos play to natural completion
- Next video starts immediately (no overlap)
- Skip button fades out current video over `crossfadeDuration` seconds

**Seamless Mode**:
- Early crossfade triggers `crossfadeDuration` seconds before video ends
- Next video fades in while current fades out (overlap)
- Great for DJ-style continuous playback

**Settings UI**: `src/components/CrossfadeSettings.tsx` provides mode toggle and duration slider (0.5-5s range).

## Key Files

| File | Purpose |
|------|---------|
| `src/hooks/useVideoPlayer.ts` | Dual-mode video player with lock mechanism, crossfade |
| `src/hooks/useSkip.ts` | Simplified skip wrapper (logic now in useVideoPlayer) |
| `src/components/CrossfadeSettings.tsx` | UI for crossfade mode/duration settings |
| `src/services/QueueService.ts` | Priority/active queue rotation logic |
| `src/services/SupabaseService.ts` | Real-time sync, command handling, heartbeat |
| `src/pages/PlayerWindow.tsx` | Main UI orchestration |
| `electron/main.cjs` | Window management, IPC handlers, file system access |
| `src/config/supabase.ts` | Supabase URL, keys, timing constants |
| `src/utils/playlistHelpers.ts` | YouTube ID stripping, title cleaning |
| `vite.config.js` | Local video proxy, dual entry points, playlists scanning |

## Critical Implementation Details

- **Single Transition Entry Point**: All video advancement goes through `transitionToNext(reason)` with lock protection
- **Transition Lock**: `transitionLockRef` prevents race conditions between skip, natural end, and early crossfade
- **Autoplay Policy**: Play promises catch blocked play, fall back to muted→unmute after 100ms
- **Command Deduplication**: `processedCommandIds` Set (capped at 500) prevents double execution from Broadcast + polling
- **State Sync Deduplication**: `lastSyncKey` JSON comparison skips identical updates
- **Electron Store**: `electron-store` persists settings in `djamms-config` (volume, crossfadeMode, window bounds)
- **Singleton Pattern**: All services use singleton pattern—always call `getInstance()` or getter functions
- **activeVideoIndexRef**: Tracks active video (0 or 1); use `getActiveVideo()`/`getInactiveVideo()` helpers

## Gotchas

- **Player Window**: Auto-created on startup if `enableFullscreenPlayer` setting true. Syncs via `playback-state-sync` IPC
- **Playlist Naming**: Folders may have YouTube ID prefix (`PLxxxx.PlaylistName`); use `playlistDisplayName` for UI
- **Port Handling**: Don't hardcode `:3000`—use `window.location.origin` for dev server URLs
- **Singleton Services**: `getSupabaseService()` and `getQueueService()` return singleton instances
- **Web Apps**: Each in `web/` has own `package.json`, separate Vite instance, shared Tailwind config
- **Testing**: Jest configured with jsdom, ts-jest ESM preset. Coverage thresholds at 50% for all metrics
- **Skip vs Transition**: `skip()` always fades out; `transitionToNext()` is the unified entry point
- **Mode Switching**: Can switch crossfade mode at runtime via `setCrossfadeMode()` without interrupting playback

## Reference Documents

For detailed implementation guides and architecture comparisons, see:
- `Downloads/Queue Manager - Revision & Upgrade Docs/queue_manager_upgrade_plan.md` - Full upgrade plan
- `Downloads/Queue Manager - Revision & Upgrade Docs/integration_guide.md` - Integration examples
- `Downloads/Queue Manager - Revision & Upgrade Docs/architecture_comparison.html` - Before/after visual comparison
