# DJAMMS Player React Component

A reusable React component that provides the full DJAMMS video player functionality, including crossfading, skip functionality, keyboard controls, and queue management.

## Overview

This React component is a complete migration of the original DJAMMS Electron video player, designed to work in both Electron applications and web environments. It maintains all the original functionality while providing a clean, modern React API.

## Features

- **Crossfading**: Smooth 500ms transitions between videos using dual video elements
- **Skip Functionality**: Skip current video with fade-out animation (2 seconds when playing, immediate when paused)
- **Keyboard Controls**: Full keyboard shortcut support (S/→ skip, ↑/↓ volume, M mute, Space play/pause, N/P next/previous)
- **Queue Integration**: Automatic queue management with next/previous controls via IPC
- **IPC Abstraction**: Environment-agnostic IPC layer for Electron/web compatibility
- **TypeScript**: Full TypeScript support with comprehensive type definitions
- **Customizable**: Configurable dimensions, controls visibility, and styling
- **Error Handling**: Robust error handling with retry mechanisms
- **Loading States**: Visual feedback for loading and buffering states
- **Fullscreen Player**: Dedicated fullscreen window support for multi-display setups

## Migration Context

This component was migrated from the original DJAMMS Electron application to provide:

- **Reusability**: Can be used in any React application (Electron or web)
- **Maintainability**: Clean separation of concerns with custom hooks
- **Type Safety**: Full TypeScript coverage for better development experience
- **Modularity**: Individual hooks and components can be used separately
- **Cross-Platform**: Works in both Electron renderer processes and web browsers

### Original Features Preserved

- Dual video element system for seamless crossfading
- Progressive loading and buffering
- Keyboard shortcut handling
- Volume and mute controls
- Queue navigation
- Error recovery and retry logic
- IPC communication with main process

## Installation

```bash
npm install djamms-player-react
# or
yarn add djamms-player-react
```

## Basic Usage

```tsx
import React from 'react';
import { DJAMMSPlayer } from 'djamms-player-react';

function App() {
  return (
    <div className="app">
      <DJAMMSPlayer
        width={800}
        height={600}
        autoPlay={true}
        volume={0.7}
        onVideoEnd={() => console.log('Video ended')}
        onError={(error) => console.error('Player error:', error)}
      />
    </div>
  );
}

export default App;
```

## Props API

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `width` | `number` | `800` | Player width in pixels |
| `height` | `number` | `600` | Player height in pixels |
| `className` | `string` | `''` | Additional CSS class for styling |
| `showControls` | `boolean` | `true` | Show player control buttons |
| `showProgress` | `boolean` | `true` | Show progress bar with time display |
| `showNowPlaying` | `boolean` | `true` | Show now playing overlay |
| `autoPlay` | `boolean` | `false` | Auto-play videos when loaded |
| `volume` | `number` | `0.7` | Initial volume (0-1) |
| `onVideoEnd` | `() => void` | - | Callback when video ends |
| `onError` | `(error: string) => void` | - | Error callback with error message |

## Keyboard Controls

| Key | Action | Description |
|-----|--------|-------------|
| **S** or **→** | Skip | Skip current video with fade-out |
| **↑** | Volume Up | Increase volume by 10% |
| **↓** | Volume Down | Decrease volume by 10% |
| **M** | Toggle Mute | Mute/unmute audio |
| **Space** | Play/Pause | Toggle playback state |
| **N** | Next Video | Load next video in queue |
| **P** | Previous Video | Load previous video in queue |

## Advanced Usage Examples

### Electron Integration

```tsx
import React, { useEffect } from 'react';
import { DJAMMSPlayer } from 'djamms-player-react';

function ElectronPlayer() {
  useEffect(() => {
    // Listen for IPC events from main process
    const handleVideoLoad = (event, videoData) => {
      console.log('Loading video:', videoData);
      // The component will handle video loading via IPC
    };

    if (window.electronAPI) {
      window.electronAPI.on('load-video', handleVideoLoad);
      return () => window.electronAPI.off('load-video', handleVideoLoad);
    }
  }, []);

  return (
    <DJAMMSPlayer
      width={1024}
      height={768}
      showControls={true}
      showProgress={true}
      showNowPlaying={true}
      onVideoEnd={() => {
        // Request next video from queue
        if (window.electronAPI) {
          window.electronAPI.send('video-ended');
        }
      }}
    />
  );
}
```

### Custom Player with Individual Hooks

```tsx
import React, { useRef } from 'react';
import {
  useVideoPlayer,
  useSkip,
  useKeyboardControls,
  useQueueManager
} from 'djamms-player-react';

function CustomPlayer() {
  const videoRef1 = useRef<HTMLVideoElement>(null);
  const videoRef2 = useRef<HTMLVideoElement>(null);

  const {
    currentVideo,
    isPlaying,
    isLoading,
    error,
    currentTime,
    duration,
    playVideo,
    pauseVideo,
    setVolume,
    toggleMute,
    seekTo,
    retry
  } = useVideoPlayer({
    videoRefs: [videoRef1, videoRef2],
    initialVolume: 0.8,
    onVideoEnd: () => console.log('Video ended'),
    onError: (err) => console.error('Player error:', err)
  });

  const { skip } = useSkip({
    videoRefs: [videoRef1, videoRef2],
    isPlaying,
    onSkip: () => console.log('Video skipped')
  });

  const { nextVideo, previousVideo } = useQueueManager();

  useKeyboardControls({
    onAction: (action) => {
      switch (action) {
        case 'skip':
          skip();
          break;
        case 'next':
          nextVideo();
          break;
        case 'previous':
          previousVideo();
          break;
        case 'playPause':
          if (isPlaying) pauseVideo();
          else if (currentVideo) playVideo(currentVideo);
          break;
        case 'volumeUp':
          setVolume(Math.min(1, (currentVolume || 0) + 0.1));
          break;
        case 'volumeDown':
          setVolume(Math.max(0, (currentVolume || 0) - 0.1));
          break;
        case 'mute':
          toggleMute();
          break;
      }
    }
  });

  return (
    <div className="custom-player">
      <video ref={videoRef1} />
      <video ref={videoRef2} />

      {isLoading && <div className="loading">Loading...</div>}
      {error && <div className="error">{error}</div>}

      <div className="controls">
        <button onClick={previousVideo}>⏮️</button>
        <button onClick={() => isPlaying ? pauseVideo() : currentVideo && playVideo(currentVideo)}>
          {isPlaying ? '⏸️' : '▶️'}
        </button>
        <button onClick={skip}>⏭️</button>
        <button onClick={nextVideo}>⏭️</button>
      </div>

      <div className="progress">
        <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
        <input
          type="range"
          min="0"
          max={duration || 0}
          value={currentTime}
          onChange={(e) => seekTo(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

### Web Environment Usage

```tsx
import React from 'react';
import { DJAMMSPlayer } from 'djamms-player-react';

function WebPlayer() {
  // In web environment, IPC features are disabled
  // Videos must be loaded programmatically
  const [videos, setVideos] = useState([]);

  const handleVideoSelect = (video) => {
    // Load video directly (no IPC in web environment)
    if (window.playerAPI) {
      window.playerAPI.loadVideo(video);
    }
  };

  return (
    <div>
      <div className="video-list">
        {videos.map(video => (
          <button key={video.id} onClick={() => handleVideoSelect(video)}>
            {video.title}
          </button>
        ))}
      </div>

      <DJAMMSPlayer
        width={800}
        height={600}
        showControls={true}
        showProgress={true}
        showNowPlaying={true}
        // IPC-dependent features like queue navigation will be disabled in web
      />
    </div>
  );
}
```

## Fullscreen Player

The DJAMMS Player React component includes built-in support for fullscreen playback on multiple displays, perfect for professional video installations and multi-monitor setups.

### Features

- **Multi-Display Support**: Automatically detects available displays and allows selection
- **Dedicated Fullscreen Window**: Creates a separate fullscreen window optimized for video playback
- **Synchronized Controls**: Fullscreen player responds to all main window controls (play/pause, skip, volume)
- **Real-time Sync**: Playback state, current video, and progress are synchronized between windows
- **Professional UI**: Clean fullscreen interface with video info overlay and time display

### Usage

```tsx
import React, { useState } from 'react';
import { NowPlayingPanel, VideoPlayer, TabNavigation, PlaylistTab, SettingsTab } from 'djamms-player-react';

function MultiDisplayPlayer() {
  const [settings, setSettings] = useState({
    enableFullscreenPlayer: false,
    normalizeAudioLevels: false
  });
  const [selectedDisplay, setSelectedDisplay] = useState<number | null>(null);
  const [availableDisplays, setAvailableDisplays] = useState([]);

  // Detect displays on component mount
  useEffect(() => {
    if ('getScreenDetails' in window) {
      (window as any).getScreenDetails().then(details => {
        setAvailableDisplays(details.screens || []);
      });
    }
  }, []);

  const handleDisplaySelect = (displayId: number) => {
    setSelectedDisplay(displayId);
    // When fullscreen is enabled and display is selected,
    // fullscreen window will automatically open with current video
  };

  return (
    <div className="multi-display-app">
      {/* Main Control Interface */}
      <NowPlayingPanel
        currentVideo={currentVideo}
        // ... other props
      />

      {/* Embedded player (hidden when fullscreen enabled) */}
      {!settings.enableFullscreenPlayer && (
        <VideoPlayer
          ref={playerRef}
          width={800}
          height={600}
          // ... other props
        />
      )}

      {/* Settings Tab with Display Selection */}
      <SettingsTab
        settings={settings}
        availableDisplays={availableDisplays}
        selectedDisplay={selectedDisplay}
        onUpdateSetting={(key, value) => setSettings(prev => ({ ...prev, [key]: value }))}
        onSelectDisplay={handleDisplaySelect}
      />
    </div>
  );
}
```

### Electron Integration for Fullscreen

For Electron applications, the fullscreen functionality requires additional main process setup:

```javascript
// main.js (Electron main process)
const { BrowserWindow, screen } = require('electron');

let mainWindow;
let fullscreenWindow;

function createFullscreenWindow(displayId, videoData) {
  const displays = screen.getAllDisplays();
  const targetDisplay = displays.find(d => d.id === displayId) || displays[0];

  fullscreenWindow = new BrowserWindow({
    width: targetDisplay.size.width,
    height: targetDisplay.size.height,
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    fullscreen: true,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  fullscreenWindow.loadURL(`file://${__dirname}/fullscreen.html`);

  // Send video data to fullscreen window
  fullscreenWindow.webContents.on('did-finish-load', () => {
    fullscreenWindow.webContents.send('load-video', videoData);
  });
}

// IPC handlers
ipcMain.handle('create-fullscreen-window', (event, displayId, videoData) => {
  createFullscreenWindow(displayId, videoData);
});

ipcMain.handle('close-fullscreen-window', () => {
  if (fullscreenWindow) {
    fullscreenWindow.close();
    fullscreenWindow = null;
  }
});

ipcMain.handle('control-fullscreen-player', (event, action, data) => {
  if (fullscreenWindow) {
    fullscreenWindow.webContents.send('control-player', { action, data });
  }
});
```

### Fullscreen Player API

The fullscreen player supports the same control actions as the main player:

```javascript
// Available control actions
window.electronAPI.controlFullscreenPlayer('play', videoData);     // Start playing a video
window.electronAPI.controlFullscreenPlayer('pause');               // Pause playback
window.electronAPI.controlFullscreenPlayer('resume');              // Resume playback
window.electronAPI.controlFullscreenPlayer('updateState', state);  // Sync state from main player
```

### Display Detection

The component automatically detects available displays using the Screen Details API:

```javascript
// Get available displays
const screenDetails = await (window as any).getScreenDetails();
const displays = screenDetails.screens || [];

// Each display object contains:
// - id: Unique display identifier
// - label: Human-readable display name
// - width/height: Display resolution
// - bounds: Display position and size
```

### Best Practices

1. **Display Selection**: Always allow users to choose their preferred display for fullscreen playback
2. **State Synchronization**: Keep main and fullscreen players synchronized for seamless control
3. **Error Handling**: Handle cases where selected display becomes unavailable
4. **Performance**: Fullscreen windows are resource-intensive; close when not needed
5. **User Experience**: Provide clear visual feedback when fullscreen mode is active

## Playlist Management

The DJAMMS Player includes intelligent playlist management with automatic reordering for optimal user experience.

### Smart Playlist Ordering

- **Current Song First**: The currently playing song always appears at the top of the playlist view
- **Continuous Playback Flow**: Songs following the current track appear next in order
- **Wrap-around Display**: Songs from the beginning of the playlist appear after the current sequence
- **Shuffle with Current Video**: Shuffle preserves the currently playing video at the top position
- **Dynamic Reordering**: Playlist automatically reorders when videos change during playback or when manually selecting different videos
- **Playlist Changes**: When switching playlists, the current playing video is automatically prepended as position #0
- **Seamless Continuity**: Audio playback continues uninterrupted when changing playlists

### Example Playlist Ordering

For a playlist with 40 songs where song #36 is currently playing:

```
36. Current Song Title (NOW PLAYING) ▶️ 🗑️
37. Next Song Title ▶️ 🗑️
38. Another Song Title ▶️ 🗑️
...
40. Last Song Title ▶️ 🗑️
1. First Song Title ▶️ 🗑️
2. Second Song Title ▶️ 🗑️
...
35. Song Before Current ▶️ 🗑️
```

### Visual Indicators

- **Current Song Highlight**: Blue background and "(NOW PLAYING)" label
- **Original Position Numbers**: Display shows original playlist position (1, 2, 3...) for reference
- **Action Buttons**: Play (▶️) and Remove (🗑️) buttons for each song

### Functionality Preserved

- **Direct Playback**: Click any song's play button to jump directly to it
- **Queue Management**: Remove songs from playlist using the delete button
- **Index-based Actions**: All actions work with original playlist indices for proper functionality

### Custom Styling

```tsx
import React from 'react';
import { DJAMMSPlayer } from 'djamms-player-react';
import './custom-player.css';

function StyledPlayer() {
  return (
    <DJAMMSPlayer
      className="custom-djamms-player"
      width={1200}
      height={800}
      showControls={true}
      showProgress={true}
      showNowPlaying={true}
    />
  );
}

// custom-player.css
.custom-djamms-player {
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.custom-djamms-player video {
  border-radius: 12px;
}

/* Custom control styling */
.custom-djamms-player button {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  color: white;
  padding: 8px 12px;
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
}

.custom-djamms-player button:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.05);
}
```

## Architecture

### Component Structure

```
DJAMMSPlayer
├── VideoElement (x2) - Dual video system for crossfading
├── NowPlayingOverlay - Current video info display
├── LoadingScreen - Loading state overlay
├── ErrorOverlay - Error display with retry
├── ProgressBar - Seekable progress indicator
└── Control buttons - Play/pause, skip, next/previous
```

### Hook Architecture

- **`useVideoPlayer`**: Core video playback logic, crossfading, state management
- **`useSkip`**: Skip functionality with fade-out animation
- **`useKeyboardControls`**: Keyboard shortcut handling
- **`useQueueManager`**: Queue navigation via IPC

### IPC Abstraction

The component uses an IPC abstraction layer that automatically detects the environment:

- **Electron**: Uses `window.electronAPI` for IPC communication
- **Web**: Gracefully degrades, disabling IPC-dependent features

## TypeScript Support

Full TypeScript support with exported types:

```tsx
import type {
  Video,
  PlayerState,
  QueueState,
  DJAMMSPlayerProps
} from 'djamms-player-react';

// Extend Video interface for custom fields
interface CustomVideo extends Video {
  customField: string;
  metadata: {
    genre: string;
    year: number;
  };
}

// Use in components
const MyPlayer: React.FC = () => {
  const handleVideoEnd = () => {
    // TypeScript knows this is () => void
  };

  const handleError = (error: string) => {
    // TypeScript knows error is a string
  };

  return (
    <DJAMMSPlayer
      width={800}
      height={600}
      onVideoEnd={handleVideoEnd}
      onError={handleError}
    />
  );
};
```

## Video Object Format

The component expects video objects with the following structure:

```typescript
interface Video {
  id: string;
  title: string;
  artist?: string;
  src?: string;        // Direct URL or file path
  path?: string;       // Alternative path field
  file_path?: string;  // Alternative path field
  duration?: number;   // Duration in seconds
  thumbnail?: string;  // Thumbnail URL
  // Additional metadata fields...
}
```

## Error Handling

The component includes comprehensive error handling:

- **Network errors**: Automatic retry with exponential backoff
- **Playback errors**: Fallback to muted playback for autoplay policies
- **Loading errors**: Visual error display with retry option
- **IPC errors**: Graceful degradation in web environments

## Performance Considerations

- **Dual video system**: Enables seamless crossfading without interruption
- **RequestAnimationFrame**: Smooth animations for fade transitions
- **Lazy loading**: Videos are loaded only when needed
- **Memory management**: Proper cleanup of event listeners and timeouts

## Browser Compatibility

- **Chrome/Edge**: Full feature support
- **Firefox**: Full feature support
- **Safari**: Full feature support (with some autoplay restrictions)
- **Mobile browsers**: Limited support due to autoplay policies

## Development

### Building

```bash
npm run build
```

Creates both ESM (`dist/index.esm.js`) and CommonJS (`dist/index.js`) builds with source maps.

### Development Server

```bash
npm run dev
```

Starts the Rollup development server with hot reloading.

### Testing

```bash
npm test
```

Runs the Jest test suite.

### Type Checking

```bash
npm run type-check
```

Runs TypeScript compiler for type checking only.

## Migration Notes

### From Original DJAMMS Player

- **Class-based to Hooks**: Converted from `PlayerWindow` class to React hooks
- **IPC Layer**: Added abstraction layer for cross-environment compatibility
- **State Management**: Moved from direct DOM manipulation to React state
- **Event Handling**: Converted to React event system with proper cleanup

### Breaking Changes

- **API**: Now uses React props instead of direct method calls
- **Styling**: CSS classes instead of direct style manipulation
- **Events**: React callbacks instead of DOM events
- **Initialization**: Component-based instead of manual initialization

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Ensure TypeScript compilation passes
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Changelog

### v1.0.0
- Initial release with full DJAMMS player functionality
- React component migration complete
- TypeScript support added
- IPC abstraction layer implemented
- Crossfading, skip, and keyboard controls preserved