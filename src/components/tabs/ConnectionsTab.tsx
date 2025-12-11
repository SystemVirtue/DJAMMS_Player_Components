/**
 * Connections Tab Component
 * Shows connection status and IO event logs
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getIOLogger, IOEvent, IOEventType, IOLogSession } from '../../services/IOLogger';
import { getSupabaseService } from '../../services/SupabaseService';

interface ConnectionsTabProps {
  playerId: string;
}

interface ConnectionStatus {
  supabase: 'online' | 'offline';
  webAdmin: { status: 'online' | 'offline'; ip?: string };
  webKiosk: { status: 'online' | 'offline'; ip?: string };
}

export const ConnectionsTab: React.FC<ConnectionsTabProps> = ({ playerId }) => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    supabase: 'offline',
    webAdmin: { status: 'offline' },
    webKiosk: { status: 'offline' }
  });
  const [events, setEvents] = useState<IOEvent[]>([]);
  const [filters, setFilters] = useState<Set<IOEventType>>(new Set(['supabase', 'web-admin', 'web-kiosk', 'error']));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sessions, setSessions] = useState<IOLogSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('current');
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const consoleRef = useRef<HTMLDivElement>(null);
  const ioLogger = getIOLogger();

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [events]);

  // Subscribe to IO events
  useEffect(() => {
    const unsubscribe = ioLogger.onEvent((event) => {
      if (event.id === 'clear') {
        setEvents([]);
      } else {
        setEvents(prev => {
          const filtered = ioLogger.getEvents({ types: Array.from(filters) });
          return filtered;
        });
      }
    });

    // Load initial events
    const initialEvents = ioLogger.getEvents({ types: Array.from(filters) });
    setEvents(initialEvents);

    return unsubscribe;
  }, [filters, ioLogger]);

  // Update events when filters change (only for current session)
  useEffect(() => {
    if (selectedSession === 'current') {
      const filtered = ioLogger.getEvents({ types: Array.from(filters) });
      setEvents(filtered);
    }
  }, [filters, ioLogger, selectedSession]);

  // Check Supabase connection status
  const checkSupabaseStatus = useCallback(() => {
    const supabaseService = getSupabaseService();
    const isOnline = supabaseService.initialized && supabaseService.isOnline;
    setConnectionStatus(prev => ({
      ...prev,
      supabase: isOnline ? 'online' : 'offline'
    }));
  }, []);

  // Ping Web Admin and Web Kiosk
  const pingEndpoints = useCallback(async () => {
    setIsRefreshing(true);
    
    // Check Supabase status
    checkSupabaseStatus();

    try {
      const supabaseService = getSupabaseService();
      if (!supabaseService.initialized || !supabaseService.isOnline) {
        setConnectionStatus(prev => ({
          ...prev,
          webAdmin: { status: 'offline' },
          webKiosk: { status: 'offline' }
        }));
        setIsRefreshing(false);
        return;
      }

      // Send ping via Broadcast channel
      const client = supabaseService['client'];
      if (!client) {
        setIsRefreshing(false);
        return;
      }

      // Create ping channel to receive responses
      const pingResponseChannel = client
        .channel(`ping-responses:${playerId}`)
        .on('broadcast', { event: 'ping_response' }, (payload) => {
          const response = payload.payload as {
            endpoint_type: 'web-admin' | 'web-kiosk';
            ip_address: string;
            player_id: string;
          };

          if (response.endpoint_type === 'web-admin') {
            setConnectionStatus(prev => ({
              ...prev,
              webAdmin: { status: 'online', ip: response.ip_address }
            }));
            getIOLogger().logReceived('web-admin', JSON.stringify({
              type: 'ping_response',
              ip: response.ip_address
            }, null, 2), 'ping');
          } else if (response.endpoint_type === 'web-kiosk') {
            setConnectionStatus(prev => ({
              ...prev,
              webKiosk: { status: 'online', ip: response.ip_address }
            }));
            getIOLogger().logReceived('web-kiosk', JSON.stringify({
              type: 'ping_response',
              ip: response.ip_address
            }, null, 2), 'ping');
          }
        })
        .subscribe();

      // Send ping to Web Admin
      const adminPingChannel = client.channel(`ping-handler:${playerId}`);
      await adminPingChannel.subscribe();
      await adminPingChannel.send({
        type: 'broadcast',
        event: 'ping',
        payload: {
          player_id: playerId,
          timestamp: Date.now(),
          endpoint_type: 'web-admin'
        }
      });

      // Send ping to Web Kiosk
      await adminPingChannel.send({
        type: 'broadcast',
        event: 'ping',
        payload: {
          player_id: playerId,
          timestamp: Date.now(),
          endpoint_type: 'web-kiosk'
        }
      });

      // Log ping
      await getIOLogger().logSent('web-admin', JSON.stringify({
        type: 'ping',
        player_id: playerId
      }, null, 2), 'ping');

      // Wait for responses (timeout after 3 seconds)
      setTimeout(() => {
        pingResponseChannel.unsubscribe();
        adminPingChannel.unsubscribe();
        
        // Mark as offline if no response received
        setConnectionStatus(prev => ({
          ...prev,
          webAdmin: prev.webAdmin.status === 'online' ? prev.webAdmin : { status: 'offline' },
          webKiosk: prev.webKiosk.status === 'online' ? prev.webKiosk : { status: 'offline' }
        }));
        
        setIsRefreshing(false);
      }, 3000);
    } catch (error) {
      console.error('[ConnectionsTab] Error pinging endpoints:', error);
      await getIOLogger().logError('error', String(error), 'ping');
      setConnectionStatus(prev => ({
        ...prev,
        webAdmin: { status: 'offline' },
        webKiosk: { status: 'offline' }
      }));
      setIsRefreshing(false);
    }
  }, [checkSupabaseStatus, playerId]);

  // Load sessions on mount
  useEffect(() => {
    const loadSessions = async () => {
      setIsLoadingSessions(true);
      try {
        const sessionList = await ioLogger.getSessions();
        setSessions(sessionList);
      } catch (error) {
        console.error('[ConnectionsTab] Failed to load sessions:', error);
      } finally {
        setIsLoadingSessions(false);
      }
    };
    
    loadSessions();
  }, [ioLogger]);

  // Load events for selected session
  useEffect(() => {
    const loadSessionEvents = async () => {
      if (selectedSession === 'current') {
        // Use real-time events from memory
        const filtered = ioLogger.getEvents({ types: Array.from(filters) });
        setEvents(filtered);
      } else {
        // Load from Supabase
        setIsLoadingSessions(true);
        try {
          const sessionEvents = await ioLogger.loadSessionLogs(selectedSession, Array.from(filters));
          setEvents(sessionEvents);
        } catch (error) {
          console.error('[ConnectionsTab] Failed to load session events:', error);
        } finally {
          setIsLoadingSessions(false);
        }
      }
    };
    
    loadSessionEvents();
  }, [selectedSession, filters, ioLogger]);

  // Check status on mount and when tab becomes visible
  useEffect(() => {
    checkSupabaseStatus();
    pingEndpoints();
  }, [checkSupabaseStatus, pingEndpoints]);

  // Toggle filter
  const toggleFilter = useCallback((type: IOEventType) => {
    setFilters(prev => {
      const newFilters = new Set(prev);
      if (newFilters.has(type)) {
        newFilters.delete(type);
      } else {
        newFilters.add(type);
      }
      return newFilters;
    });
  }, []);

  // Format timestamp
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit'
    }) + '.' + date.getMilliseconds().toString().padStart(3, '0');
  };

  // Get color for event type
  const getEventColor = (type: IOEventType) => {
    switch (type) {
      case 'supabase':
        return '#90EE90'; // Light Green
      case 'web-admin':
        return '#FFFF90'; // Light Yellow
      case 'web-kiosk':
        return '#90C7FF'; // Light Blue
      case 'error':
        return '#FF4444'; // Bright Red
      default:
        return '#FFFFFF';
    }
  };

  return (
    <div className="tab-content active" style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h1 style={{ marginBottom: '20px' }}>Connections</h1>

      {/* Session Selector */}
      <div style={{
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <label style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          Session:
        </label>
        <select
          value={selectedSession}
          onChange={(e) => setSelectedSession(e.target.value)}
          disabled={isLoadingSessions}
          style={{
            padding: '8px 12px',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            cursor: isLoadingSessions ? 'not-allowed' : 'pointer',
            minWidth: '250px'
          }}
        >
          <option value="current">This Session</option>
          {sessions.map(session => (
            <option key={session.session_id} value={session.session_id}>
              {new Date(session.started_at).toLocaleString()} 
              {session.is_active ? ' (Active)' : ''} 
              ({session.log_count} logs)
            </option>
          ))}
        </select>
        {isLoadingSessions && (
          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Loading...</span>
        )}
      </div>

      {/* Status Frame */}
      <div style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600 }}>Server Status:</span>
          <span style={{
            color: connectionStatus.supabase === 'online' ? '#00FF00' : '#FF0000',
            fontWeight: 600
          }}>
            {connectionStatus.supabase === 'online' ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600 }}>Web Admin:</span>
          {connectionStatus.webAdmin.status === 'online' ? (
            <span style={{ color: '#00FF00', fontWeight: 600 }}>
              {connectionStatus.webAdmin.ip || 'Connected'}
            </span>
          ) : (
            <span style={{ color: '#FF0000', fontWeight: 600 }}>✗</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600 }}>Web Kiosk:</span>
          {connectionStatus.webKiosk.status === 'online' ? (
            <span style={{ color: '#00FF00', fontWeight: 600 }}>
              {connectionStatus.webKiosk.ip || 'Connected'}
            </span>
          ) : (
            <span style={{ color: '#FF0000', fontWeight: 600 }}>✗</span>
          )}
        </div>

        <button
          onClick={pingEndpoints}
          disabled={isRefreshing}
          style={{
            marginLeft: 'auto',
            padding: '8px 16px',
            backgroundColor: 'var(--accent-color)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isRefreshing ? 'not-allowed' : 'pointer',
            fontWeight: 600
          }}
        >
          {isRefreshing ? 'Refreshing...' : 'REFRESH'}
        </button>
      </div>

      {/* Filter Buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        {(['supabase', 'web-admin', 'web-kiosk', 'error'] as IOEventType[]).map(type => {
          const isActive = filters.has(type);
          return (
            <button
              key={type}
              onClick={() => toggleFilter(type)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#000000',
                color: isActive ? '#00FF00' : '#888888',
                border: `2px solid ${isActive ? '#00FF00' : '#444444'}`,
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 600,
                textTransform: 'uppercase',
                transition: 'all 0.2s'
              }}
            >
              {type === 'web-admin' ? 'WEB ADMIN' : 
               type === 'web-kiosk' ? 'WEB KIOSK' : 
               type.toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* Console Frame */}
      <div
        ref={consoleRef}
        style={{
          flex: 1,
          backgroundColor: '#000000',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '12px',
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: '12px',
          minHeight: '400px'
        }}
      >
        {events.length === 0 ? (
          <div style={{ color: '#888888', textAlign: 'center', padding: '20px' }}>
            No events logged yet
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <th style={{ textAlign: 'left', padding: '8px', color: '#888', width: '120px' }}>TIME</th>
                <th style={{ textAlign: 'left', padding: '8px', color: '#888', width: '50%' }}>REQUEST</th>
                <th style={{ textAlign: 'left', padding: '8px', color: '#888', width: '50%' }}>RESPONSE</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event, index) => {
                // Try to pair sent/received events
                const isSent = event.direction === 'sent';
                const pairedEvent = isSent 
                  ? events.find(e => e.id === event.id && e.direction === 'received')
                  : events.find(e => e.id === event.id && e.direction === 'sent');

                const color = getEventColor(event.type);
                const isRecursion = event.isRecursion || pairedEvent?.isRecursion;

                return (
                  <tr 
                    key={`${event.id}-${index}`} 
                    style={{ 
                      borderBottom: '1px solid #222',
                      backgroundColor: isRecursion ? 'rgba(255, 68, 68, 0.1)' : 'transparent'
                    }}
                  >
                    <td style={{ padding: '8px', color: '#888' }}>
                      {formatTime(event.timestamp)}
                      {isRecursion && (
                        <span style={{ color: '#FF4444', marginLeft: '8px', fontSize: '10px' }}>
                          ⚠️ RECURSION
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px', color: isSent ? color : '#666' }}>
                      {isSent ? (event.request || event.error || '-') : (pairedEvent?.request || '-')}
                    </td>
                    <td style={{ padding: '8px', color: !isSent ? color : '#666' }}>
                      {!isSent ? (event.response || '-') : (pairedEvent?.response || '-')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

