// DJAMMS Kiosk - Public Search & Request Interface
// Styled with obie-v5 aesthetic

import { useEffect, useState, useCallback, useMemo, useRef, createContext, useContext } from 'react';
import {
  BackgroundPlaylist,
  DEFAULT_BACKGROUND_ASSETS,
  FallbackBackground,
  SearchInterface,
  JukeboxSearchMode,
  JukeboxKiosk,
  ModernKiosk,
  SleekKiosk,
  ObieKiosk,
  NowPlaying,
  ComingUpTicker,
  CreditsDisplay
} from './components';
import {
  supabase,
  getPlayerState,
  subscribeToPlayerState,
  isPlayerOnline,
  onConnectionChange,
  getAllLocalVideos
} from '@shared/supabase-client';
import { thumbnailCache } from './services/thumbnailCache';
import { initializePingHandler, cleanupPingHandler } from '@shared/ping-handler';
import { getThumbnailsPath } from '@shared/settings';
import {
  getPlayerId,
  setPlayerId,
  clearPlayerId,
  validatePlayerId,
  isValidPlayerIdFormat,
  DEFAULT_PLAYER_ID,
  MIN_PLAYER_ID_LENGTH
} from '@shared/player-utils';
import type { SupabasePlayerState, QueueVideoItem } from '@shared/types';

// Player Context
interface PlayerContextValue {
  playerId: string;
  disconnect: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within KioskApp');
  }
  return context;
}

// Get UI mode from URL parameter: ?ui=classic or ?ui=jukebox (default: jukebox)
function getUIMode(): 'classic' | 'jukebox' {
  const params = new URLSearchParams(window.location.search);
  const ui = params.get('ui');
  return ui === 'classic' ? 'classic' : 'jukebox';
}

// Connection Flow Component
function ConnectionFlow({ onConnected }: { onConnected: (playerId: string) => void }) {
  const [step, setStep] = useState<'one' | 'two' | 'three'>('one');
  const [storedPlayerId, setStoredPlayerId] = useState<string | null>(null);
  const [input, setInput] = useState(DEFAULT_PLAYER_ID);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'info' | 'success'>('info');
  const [connecting, setConnecting] = useState(false);
  const [showPopover, setShowPopover] = useState(false);
  const autoConnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // STEP THREE: Connect to Supabase
  const connectToPlayer = useCallback(async (playerIdToConnect: string) => {
    setConnecting(true);
    setMessage('Connecting...');
    setMessageType('info');

    const isValid = await validatePlayerId(playerIdToConnect);
    
    if (!isValid) {
      setMessage('Player ID not found. Make sure the Electron Player is running with this ID.');
      setMessageType('error');
      setConnecting(false);
      // Go back to STEP TWO
      setStep('two');
      setInput(playerIdToConnect);
      return;
    }

    // Success - store and connect
    setPlayerId(playerIdToConnect);
    setMessage('Connected!');
    setMessageType('success');
    setConnecting(false);
    
    // Notify parent
    setTimeout(() => {
      onConnected(playerIdToConnect);
    }, 500);
  }, [onConnected]);

  // Initialize - check localStorage
  useEffect(() => {
    const stored = getPlayerId();
    if (stored) {
      setStoredPlayerId(stored);
      setStep('one');
      setShowPopover(true);
      // Auto-close popover after 3 seconds
      autoConnectTimerRef.current = setTimeout(() => {
        setShowPopover(false);
        setStep('three');
        // Start connection
        connectToPlayer(stored);
      }, 3000);
      return () => {
        if (autoConnectTimerRef.current) {
          clearTimeout(autoConnectTimerRef.current);
          autoConnectTimerRef.current = null;
        }
      };
    } else {
      // No stored ID - go directly to STEP TWO
      setStep('two');
    }
  }, [connectToPlayer]);

  // Handle connect button (STEP TWO)
  const handleConnect = async () => {
    const clean = input.trim().toUpperCase();
    
    if (!isValidPlayerIdFormat(clean)) {
      setMessage(`Player ID must be at least ${MIN_PLAYER_ID_LENGTH} characters`);
      setMessageType('error');
      return;
    }

    setStep('three');
    await connectToPlayer(clean);
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !connecting && step === 'two') {
      handleConnect();
    }
  };

  // STEP ONE: Popover
  if (step === 'one' && showPopover && storedPlayerId) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          backgroundColor: '#1a1a2e',
          padding: '32px',
          borderRadius: '16px',
          textAlign: 'center',
          maxWidth: '400px',
          width: '90%',
          border: '1px solid #333',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
        }}>
          <p style={{
            fontSize: '20px',
            marginBottom: '24px',
            color: '#00bcd4'
          }}>
            Connecting to {storedPlayerId}
          </p>
          <button
            onClick={() => {
              // Stop the auto-connect timer
              if (autoConnectTimerRef.current) {
                clearTimeout(autoConnectTimerRef.current);
                autoConnectTimerRef.current = null;
              }
              setShowPopover(false);
              setStep('two');
              setInput(storedPlayerId);
            }}
            style={{
              fontSize: '16px',
              fontWeight: 'bold',
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: '#00bcd4',
              color: 'white',
              transition: 'all 0.2s'
            }}
          >
            Update Player ID
          </button>
        </div>
      </div>
    );
  }

  // STEP TWO: Enter Player ID
  if (step === 'two') {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          backgroundColor: '#1a1a2e',
          padding: '48px',
          borderRadius: '24px',
          textAlign: 'center',
          maxWidth: '600px',
          width: '90%',
          border: '1px solid #333',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
        }}>
          {/* Logo/Icon */}
          <div style={{
            width: '80px',
            height: '80px',
            background: 'linear-gradient(135deg, #00bcd4, #0077b6)',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            fontSize: '40px'
          }}>
            🎵
          </div>

          <h1 style={{
            fontSize: '36px',
            fontWeight: 'bold',
            marginBottom: '16px',
            color: '#00bcd4'
          }}>
            Connect to DJAMMS Player
          </h1>
          
          <p style={{
            fontSize: '18px',
            marginBottom: '32px',
            color: '#aaa'
          }}>
            Enter the Player ID to connect to the jukebox
            <br />
            <span style={{ fontSize: '14px', opacity: 0.7 }}>
              (minimum {MIN_PLAYER_ID_LENGTH} characters)
            </span>
          </p>
          
          {/* Input */}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder={DEFAULT_PLAYER_ID}
            disabled={connecting}
            maxLength={32}
            style={{
              width: '100%',
              fontSize: '32px',
              textAlign: 'center',
              backgroundColor: '#0d0d1a',
              border: '2px solid #333',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
              color: 'white',
              letterSpacing: '4px',
              fontFamily: 'monospace',
              outline: 'none',
              transition: 'border-color 0.2s',
              boxSizing: 'border-box'
            }}
            onFocus={(e) => e.target.style.borderColor = '#00bcd4'}
            onBlur={(e) => e.target.style.borderColor = '#333'}
            autoFocus
          />
          
          {/* Connect Button */}
          <button
            onClick={handleConnect}
            disabled={connecting || input.trim().length < MIN_PLAYER_ID_LENGTH}
            style={{
              width: '100%',
              fontSize: '24px',
              fontWeight: 'bold',
              padding: '20px 40px',
              borderRadius: '12px',
              border: 'none',
              cursor: connecting || input.trim().length < MIN_PLAYER_ID_LENGTH ? 'not-allowed' : 'pointer',
              backgroundColor: connecting || input.trim().length < MIN_PLAYER_ID_LENGTH ? '#333' : '#00bcd4',
              color: 'white',
              transition: 'all 0.2s',
              opacity: connecting || input.trim().length < MIN_PLAYER_ID_LENGTH ? 0.5 : 1
            }}
          >
            {connecting ? 'Connecting...' : 'Connect'}
          </button>
          
          {/* Message */}
          {message && (
            <p style={{
              marginTop: '24px',
              fontSize: '16px',
              color: messageType === 'error' ? '#ff6b6b' : 
                     messageType === 'success' ? '#4ecdc4' : '#888'
            }}>
              {message}
            </p>
          )}
        </div>
      </div>
    );
  }

  // STEP THREE: Connecting (show loading)
  if (step === 'three' && connecting) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}>
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{
            width: '64px',
            height: '64px',
            border: '4px solid #00bcd4',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p style={{ fontSize: '24px', opacity: 0.8 }}>Connecting...</p>
          {message && (
            <p style={{ fontSize: '16px', marginTop: '16px', color: messageType === 'error' ? '#ff6b6b' : '#888' }}>
              {message}
            </p>
          )}
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return null;
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

  // Log playerId on mount for debugging
  useEffect(() => {
    console.log('[KioskApp] 🎯 Kiosk initialized with playerId:', playerId);
    if (!playerId) {
      console.error('[KioskApp] ❌ CRITICAL: No playerId provided to Kiosk!');
    }
  }, [playerId]);

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
  // Use ref to store previous active_queue to avoid dependency issues
  const previousActiveQueueRef = useRef<QueueVideoItem[] | null>(null);
  
  useEffect(() => {
    const channel = subscribeToPlayerState(playerId, (state) => {
      console.log('[Kiosk] Received player state update:', {
        now_playing: state.now_playing_video?.title,
        queue_length: state.active_queue?.length || 0,
        priority_length: state.priority_queue?.length || 0
      });
      
      // Error handling: If active_queue is null, don't update it (preserve existing state)
      // This prevents the ComingUpTicker from being interrupted by null values
      if (state.active_queue === null) {
        console.warn('[Kiosk] ⚠️ Received update with active_queue=null, preserving existing state');
        // Create a new state object using previous active_queue or empty array
        const normalizedState = {
          ...state,
          active_queue: previousActiveQueueRef.current || []
        };
        setPlayerState(normalizedState);
        // Don't update the ref since we're preserving the old value
      } else {
        // Normalize undefined to empty array (supabase-client should handle this, but double-check)
        const normalizedState = {
          ...state,
          active_queue: state.active_queue || [],
          priority_queue: state.priority_queue || []
        };
        // Update ref with the new queue value
        previousActiveQueueRef.current = normalizedState.active_queue;
        setPlayerState(normalizedState);
      }
      
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

  // Initialize ping handler
  useEffect(() => {
    if (playerId) {
      initializePingHandler(playerId, 'web-kiosk');
      return () => {
        cleanupPingHandler();
      };
    }
  }, [playerId]);

  // Initialize thumbnail cache and start background download
  useEffect(() => {
    // Only initialize for web browsers (not Electron)
    if (typeof window !== 'undefined' && !(window as any).electronAPI && playerId) {
      const initializeThumbnailCache = async () => {
        try {
          console.log('[KioskApp] Initializing thumbnail cache...');
          await thumbnailCache.initialize();
          
          // Get all videos and start background download
          console.log('[KioskApp] Loading videos for thumbnail download...');
          const videos = await getAllLocalVideos(playerId, null, 0);
          
          if (videos && videos.length > 0) {
            console.log(`[KioskApp] Starting background download of ${videos.length} thumbnails...`);
            // Start download in background (non-blocking)
            thumbnailCache.downloadAllThumbnails(videos).catch(error => {
              console.error('[KioskApp] Error downloading thumbnails:', error);
            });
          } else {
            console.log('[KioskApp] No videos found for thumbnail download');
          }
        } catch (error) {
          console.error('[KioskApp] Error initializing thumbnail cache:', error);
        }
      };
      
      initializeThumbnailCache();
    }
  }, [playerId]);

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
      {/* Obie-v5 Kiosk Mode - Dark background with yellow accents */}
      {uiMode === 'jukebox' ? (
        <ObieKiosk
          nowPlaying={playerState?.now_playing_video || null}
          activeQueue={playerState?.active_queue || []}
          priorityQueue={playerState?.priority_queue || []}
          playerId={playerId}
          credits={credits}
          isFreePlay={true}
          onSongQueued={handleSongRequested}
        />
      ) : (
        <>
          {/* Classic Mode - Original layout */}
          {/* Fallback background (behind video) */}
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

// Main App with custom connection flow
function App() {
  const [playerId, setPlayerIdState] = useState<string | null>(null);
  const [showConnectionFlow, setShowConnectionFlow] = useState(true);

  const handleConnected = (connectedPlayerId: string) => {
    setPlayerIdState(connectedPlayerId);
    setShowConnectionFlow(false);
  };

  if (showConnectionFlow) {
    return <ConnectionFlow onConnected={handleConnected} />;
  }

  if (!playerId) {
    return null;
  }

  return (
    <PlayerContext.Provider value={{ playerId, disconnect: () => window.location.reload() }}>
      <KioskApp />
    </PlayerContext.Provider>
  );
}

export default App;
