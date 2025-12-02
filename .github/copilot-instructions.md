# DJAMMS Player React Component - AI Coding Instructions

## Architecture Overview

This is a **React component library** for a crossfading video player, designed for both Electron and web environments. It was migrated from a vanilla JS Electron app.

### Key Architectural Patterns

**Dual Video Element System**: The player uses two `<video>` elements (`videoA`/`videoB`) to achieve seamless crossfading. One plays while the other preloads the next video. See `useVideoPlayer.ts` for the crossfade logic using `requestAnimationFrame`.

**IPC Abstraction Layer** (`src/utils/ipc.ts`): Environment-agnostic communication layer:
- `ElectronIPCAdapter`: Uses `window.electronAPI` for Electron
- `WebIPCAdapter`: Uses `CustomEvent` for web environments
- `NoOpIPCAdapter`: Silent fallback when IPC is disabled

**VideoRefs Pattern**: Hooks receive refs via a `VideoRefs` interface with `activeVideo`/`inactiveVideo` refs that swap after each crossfade. Always use these refs, not direct video element references.

## Developer Workflows

```bash
npm run dev-server    # Vite dev server on port 3000 (serves local playlists)
npm run build         # Rollup build → dist/ (ESM + CJS + types)
npm run type-check    # TypeScript validation only
```

**Vite serves local video files**: The `vite.config.js` includes a custom middleware to serve `.mp4` files from `/Users/mikeclarkin/Music/DJAMMS/PLAYLISTS` via `/playlist/{name}/{file}` URLs.

## Code Conventions

### Component Props Pattern
Components use `forwardRef` with `useImperativeHandle` to expose methods:
```tsx
export const DJAMMSPlayer = forwardRef<DJAMMSPlayerRef, DJAMMSPlayerProps>((props, ref) => {
  useImperativeHandle(ref, () => ({
    playVideo, pauseVideo, resumeVideo, setVolume, seekTo, getActiveVideo, preloadVideo
  }), [/* deps */]);
});
```

### Video Path Resolution
Videos can have paths in `src`, `path`, or `file_path` fields. Resolution order in `useVideoPlayer.ts`:
1. HTTP/HTTPS URLs → use directly
2. `/playlist/` paths → prepend `http://localhost:3000`
3. `file://` paths → use directly
4. Local paths → prepend `file://`

### State Management
- No external state library; uses React hooks + refs
- Player state lives in `useVideoPlayer` hook
- UI components receive state via props from parent

### Crossfade Timing
- Default fade duration: 0.5 seconds (configurable via `fadeDuration` prop)
- Skip fade duration: 1 second (configurable via `fadeDurationMs` in `useSkip`)
- Use CSS `transition` on video opacity + `requestAnimationFrame` for audio fade

## Key Files

| File | Purpose |
|------|---------|
| `src/hooks/useVideoPlayer.ts` | Core playback logic, crossfade, volume normalization |
| `src/hooks/useSkip.ts` | Skip with fade-out animation |
| `src/utils/crossfade.ts` | Reusable `fadeOut` and `crossfade` functions |
| `src/utils/ipc.ts` | Environment-agnostic IPC adapters |
| `src/types/index.ts` | TypeScript interfaces (`Video`, `VideoRefs`, `PlayerState`) |

## Gotchas

- **Autoplay Policy**: Browser may block unmuted autoplay. Code falls back to muted play then unmutes after 100ms. See `directPlay()` in `useVideoPlayer.ts`.
- **Skip Timing**: `onSkip` callback fires BEFORE pausing the active video to allow crossfade path in subsequent `playVideo()` call.
- **Volume Normalization**: Optional Web Audio API analysis for loudness normalization—disabled by default (`enableAudioNormalization` prop).
- **Fullscreen Player**: Separate entry point (`fullscreen.html`) for multi-display setups; controlled via Electron IPC or props.
