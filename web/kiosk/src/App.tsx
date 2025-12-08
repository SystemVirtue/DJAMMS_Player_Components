// DJAMMS Kiosk - Public Search & Request Interface
// Styled with obie-v5 aesthetic

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  BackgroundPlaylist,
  DEFAULT_BACKGROUND_ASSETS,
  FallbackBackground,
  SearchInterface,
  JukeboxSearchMode,
  NowPlaying,
  ComingUpTicker,
  CreditsDisplay
} from './components';
import {
  supabase,
  getPlayerState,
  subscribeToPlayerState,
  isPlayerOnline,
  onConnectionChange
} from '@shared/supabase-client';
import ConnectPlayerModal, { usePlayer } from '@shared/ConnectPlayerModal';
import type { SupabasePlayerState, QueueVideoItem } from '@shared/types';

// Get UI mode from URL parameter: ?ui=classic or ?ui=jukebox (default: jukebox)
function getUIMode(): 'classic' | 'jukebox' {
  const params = new URLSearchParams(window.location.search);
  const ui = params.get('ui');
  return ui === 'classic' ? 'classic' : 'jukebox';
}

// Inner app component that has access to Player context
function KioskApp() {
  const { playerId } = usePlayer();
  
  const [playerState, setPlayerState] = useState<SupabasePlayerState | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [credits, setCredits] = useState(999); // Placeholder - future implementation
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  
  // Get UI mode from URL parameter (stable across renders)
  const uiMode = useMemo(() => getUIMode(), []);

  // Load initial player state
  useEffect(() => {
    const loadState = async () => {
      const state = await getPlayerState(playerId);
      if (state) {
        setPlayerState(state);
        setIsOnline(isPlayerOnline(state));
      }
    };
    loadState();
  }, [playerId]);

  // Subscribe to real-time player state updates
  useEffect(() => {
    const channel = subscribeToPlayerState(playerId, (state) => {
      setPlayerState(state);
      setIsOnline(isPlayerOnline(state));
    });

    // unsubscribe() returns a Promise but cleanup must be sync - ignore return value
    return () => { channel.unsubscribe(); };
  }, [playerId]);

  // Monitor Supabase Realtime connection status
  useEffect(() => {
    const unsubscribe = onConnectionChange((connected) => {
      console.log(`[Kiosk] Supabase Realtime ${connected ? '✅ connected' : '❌ disconnected'}`);
      setIsRealtimeConnected(connected);
    });
    return unsubscribe;
  }, []);

  // Handle successful song request
  const handleSongRequested = useCallback((video: QueueVideoItem) => {
    console.log('Song requested:', video.title);
    setShowSuccessToast(true);
    
    // Hide toast after 3 seconds
    setTimeout(() => {
      setShowSuccessToast(false);
    }, 3000);
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 relative">
      {/* Jukebox Mode - Full screen takeover */}
      {uiMode === 'jukebox' ? (
        <JukeboxSearchMode
          nowPlaying={playerState?.now_playing_video || null}
          credits={credits}
          onCreditsChange={setCredits}
          onSongQueued={handleSongRequested}
          isFreePlay={true}
          playerId={playerId}
        />
      ) : (
        <>
          {/* Classic Mode - Original layout */}
          {/* Background */}
          <BackgroundPlaylist assets={DEFAULT_BACKGROUND_ASSETS} />
          <FallbackBackground />

          {/* Now Playing Display - Top Left */}
          <NowPlaying 
            video={playerState?.now_playing_video || null}
            isOnline={isOnline}
          />

          {/* Credits Display - Top Right (Placeholder) */}
          <CreditsDisplay credits={credits} />

          {/* Main Content */}
          <main className="relative z-10 pt-24 pb-24 min-h-screen">
            <div className="max-w-6xl mx-auto">
              {/* Title */}
              <div className="text-center mb-8">
                <h1 
                  className="text-5xl font-bold text-white mb-2 flex items-center gap-4"
                  style={{ 
                    filter: 'drop-shadow(-5px -5px 10px rgba(0,0,0,0.8))'
                  }}
                >
                  <img src="/icon.png" alt="DJAMMS" style={{ height: '60px', width: 'auto' }} />
                  Jukebox
                </h1>
                <p className="text-amber-400 text-lg">
                  Search and request your favorite songs
                </p>
              </div>

              {/* Search Interface */}
              <div className="h-[calc(100vh-280px)]">
                <SearchInterface 
                  onSongRequested={handleSongRequested}
                  credits={credits}
                  playerId={playerId}
                />
              </div>
            </div>
          </main>

          {/* Coming Up Ticker - Bottom */}
          <ComingUpTicker
            priorityQueue={playerState?.priority_queue || []}
            activeQueue={playerState?.active_queue || []}
            maxActiveItems={3}
          />
        </>
      )}

      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 animate-fade-in">
          <div className="kiosk-card text-center px-12 py-8">
            <div className="text-6xl mb-4">🎵</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Song Requested!
            </h2>
            <p className="text-amber-400">
              Your song has been added to the queue
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Main App wrapped with ConnectPlayerModal
function App() {
  return (
    <ConnectPlayerModal
      title="Connect to DJAMMS Player"
      description="Enter the Player ID to connect to the jukebox"
      appName="DJAMMS Kiosk"
    >
      <KioskApp />
    </ConnectPlayerModal>
  );
}

export default App;
