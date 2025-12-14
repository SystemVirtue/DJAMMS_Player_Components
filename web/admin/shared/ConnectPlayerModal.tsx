/**
 * ConnectPlayerModal - Gate component for Web Apps (Kiosk/Admin)
 * 
 * Web apps can ONLY connect to EXISTING Player IDs.
 * The Electron Player must first claim/create the Player ID.
 * 
 * Flow:
 * 1. On load, check localStorage for stored Player ID
 * 2. If stored, validate it exists in Supabase 'players' table
 * 3. If valid, render children with PlayerContext
 * 4. If invalid/missing, show connection modal
 * 
 * The modal pre-fills with "DEMO_PLAYER" as default.
 */

import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import {
  getPlayerId,
  setPlayerId,
  clearPlayerId,
  validatePlayerId,
  isValidPlayerIdFormat,
  DEFAULT_PLAYER_ID,
  MIN_PLAYER_ID_LENGTH
} from './player-utils';

// ============== Player Context ==============

interface PlayerContextValue {
  playerId: string;
  disconnect: () => void;
}

export const PlayerContext = createContext<PlayerContextValue | null>(null);

/**
 * Hook to access the current Player ID
 * Must be used within ConnectPlayerModal
 */
export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within ConnectPlayerModal');
  }
  return context;
}

// ============== Modal Component ==============

interface ConnectPlayerModalProps {
  children: ReactNode;
  /** Title shown in the modal */
  title?: string;
  /** Description text */
  description?: string;
  /** App name shown in header after connection */
  appName?: string;
}

function ConnectPlayerModal({
  children,
  title = 'Connect to Player',
  description = 'Enter the Player ID to connect to',
  appName = 'DJAMMS'
}: ConnectPlayerModalProps) {
  const [playerId, setPlayerIdState] = useState<string | null>(null);
  const [input, setInput] = useState(DEFAULT_PLAYER_ID);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'info' | 'success'>('info');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  // Initialize - check for stored and valid Player ID
  useEffect(() => {
    const init = async () => {
      const stored = getPlayerId();
      
      if (!stored) {
        console.log('[ConnectPlayerModal] No stored Player ID');
        setLoading(false);
        return;
      }

      console.log('[ConnectPlayerModal] Validating stored ID:', stored);
      const isValid = await validatePlayerId(stored);
      
      if (!isValid) {
        console.log('[ConnectPlayerModal] Stored ID invalid or not found, clearing');
        clearPlayerId();
        setMessage('Previously connected Player no longer exists');
        setMessageType('info');
        setLoading(false);
        return;
      }

      console.log('[ConnectPlayerModal] Connected to Player:', stored);
      setPlayerIdState(stored);
      setLoading(false);
    };

    init();
  }, []);

  // Handle connect button
  const handleConnect = async () => {
    const clean = input.trim().toUpperCase();
    
    // Validate format
    if (!isValidPlayerIdFormat(clean)) {
      setMessage(`Player ID must be at least ${MIN_PLAYER_ID_LENGTH} characters`);
      setMessageType('error');
      return;
    }

    setConnecting(true);
    setMessage('Connecting...');
    setMessageType('info');

    // Validate ID exists in database
    const exists = await validatePlayerId(clean);
    
    if (!exists) {
      setMessage('Player ID not found. Make sure the Electron Player is running with this ID.');
      setMessageType('error');
      setConnecting(false);
      return;
    }

    // Success - store and connect
    setPlayerId(clean);
    setMessage('Connected!');
    setMessageType('success');
    
    // Short delay to show success, then reload to initialize subscriptions
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  // Handle disconnect
  const handleDisconnect = () => {
    clearPlayerId();
    setPlayerIdState(null);
    setInput(DEFAULT_PLAYER_ID);
    setMessage('Disconnected');
    setMessageType('info');
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !connecting) {
      handleConnect();
    }
  };

  // Loading state
  if (loading) {
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
          <p style={{ fontSize: '24px', opacity: 0.8 }}>Checking connection...</p>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Not connected - show modal
  if (!playerId) {
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
            {title}
          </h1>
          
          <p style={{
            fontSize: '18px',
            marginBottom: '32px',
            color: '#aaa'
          }}>
            {description}
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
          
          {/* Help text */}
          <p style={{
            marginTop: '32px',
            fontSize: '14px',
            color: '#666',
            lineHeight: 1.6
          }}>
            Web apps connect to existing players.<br />
            The Electron Player must be running with this ID.
          </p>
        </div>
      </div>
    );
  }

  // Connected - render children with context
  return (
    <PlayerContext.Provider value={{ playerId, disconnect: handleDisconnect }}>
      {children}
    </PlayerContext.Provider>
  );
}

/**
 * Small component to show current Player ID and disconnect button
 * Can be placed in app header
 */
export function PlayerIdBadge({ className = '' }: { className?: string }) {
  const { playerId, disconnect } = usePlayer();
  
  return (
    <div 
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px',
        backgroundColor: 'rgba(0, 188, 212, 0.1)',
        borderRadius: '8px',
        border: '1px solid rgba(0, 188, 212, 0.3)'
      }}
    >
      <span style={{ 
        fontSize: '12px', 
        color: '#00bcd4',
        fontFamily: 'monospace',
        fontWeight: 'bold'
      }}>
        {playerId}
      </span>
      <button
        onClick={disconnect}
        title="Disconnect from player"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888',
          transition: 'color 0.2s'
        }}
        onMouseEnter={(e) => (e.target as HTMLElement).style.color = '#ff6b6b'}
        onMouseLeave={(e) => (e.target as HTMLElement).style.color = '#888'}
      >
        ✕
      </button>
    </div>
  );
}

// Named export for compatibility with different import styles
export { ConnectPlayerModal };
export default ConnectPlayerModal;