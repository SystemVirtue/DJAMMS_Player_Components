/**
 * IO Logger Service
 * Tracks all IO events (Supabase, Web Admin, Web Kiosk) for the Connections tab
 * Stores logs in Supabase with session tracking and recursion detection
 */

import { SupabaseClient } from '@supabase/supabase-js';

export type IOEventType = 'supabase' | 'web-admin' | 'web-kiosk' | 'error' | 'video-player' | 'local-admin';

export interface IOEvent {
  id: string;
  timestamp: Date;
  type: IOEventType;
  direction: 'sent' | 'received';
  endpoint?: string;
  request?: string;
  response?: string;
  error?: string;
  isRecursion?: boolean;
  recursionReason?: string;
  sessionId?: string;
}

export interface IOLogSession {
  session_id: string;
  started_at: string;
  ended_at?: string;
  is_active: boolean;
  log_count: number;
}

type IOEventCallback = (event: IOEvent) => void;

class IOLogger {
  private static instance: IOLogger | null = null;
  private events: IOEvent[] = [];
  private maxEvents = 1000; // Keep last 1000 events in memory
  private callbacks: Set<IOEventCallback> = new Set();
  private sessionId: string | null = null;
  private playerId: string | null = null;
  private supabaseClient: SupabaseClient | null = null;
  
  // Recursion detection
  private recentEvents: Array<{ type: IOEventType; direction: string; data: string; timestamp: number }> = [];
  private readonly RECURSION_WINDOW_MS = 5000; // 5 second window
  private readonly RECURSION_THRESHOLD = 3; // 3 similar events in window = recursion
  private readonly MAX_RECENT_EVENTS = 50; // Keep last 50 events for recursion detection

  private constructor() {}

  public static getInstance(): IOLogger {
    if (!IOLogger.instance) {
      IOLogger.instance = new IOLogger();
    }
    return IOLogger.instance;
  }

  /**
   * Initialize logger with Supabase client and create session
   */
  public async initialize(client: SupabaseClient, playerId: string): Promise<string> {
    this.supabaseClient = client;
    this.playerId = playerId;
    
    // Create new session
    const { data, error } = await client.rpc('create_io_log_session', {
      p_player_id: playerId
    });
    
    if (error) {
      console.error('[IOLogger] Failed to create session:', error);
      // Fallback to local session ID
      this.sessionId = `${playerId}_${Date.now()}`;
    } else {
      this.sessionId = data;
    }
    
    return this.sessionId || '';
  }

  /**
   * Get current session ID
   */
  public getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Check for recursion patterns
   */
  private detectRecursion(
    type: IOEventType,
    direction: 'sent' | 'received',
    data: string
  ): { isRecursion: boolean; reason?: string } {
    const now = Date.now();
    
    // Clean old events outside window
    this.recentEvents = this.recentEvents.filter(
      e => now - e.timestamp < this.RECURSION_WINDOW_MS
    );
    
    // Check for similar events in window
    const similarEvents = this.recentEvents.filter(e => 
      e.type === type && 
      e.direction === direction &&
      e.data === data
    );
    
    if (similarEvents.length >= this.RECURSION_THRESHOLD) {
      return {
        isRecursion: true,
        reason: `Detected ${similarEvents.length + 1} identical ${type} ${direction} events within ${this.RECURSION_WINDOW_MS}ms`
      };
    }
    
    // Add to recent events
    this.recentEvents.push({
      type,
      direction,
      data,
      timestamp: now
    });
    
    // Keep only last MAX_RECENT_EVENTS
    if (this.recentEvents.length > this.MAX_RECENT_EVENTS) {
      this.recentEvents.shift();
    }
    
    return { isRecursion: false };
  }

  /**
   * Log a sent request
   */
  public async logSent(
    type: IOEventType,
    request: string,
    endpoint?: string
  ): Promise<string> {
    const eventId = crypto.randomUUID();
    
    // Detect recursion
    const recursionCheck = this.detectRecursion(type, 'sent', request);
    
    const event: IOEvent = {
      id: eventId,
      timestamp: new Date(),
      type,
      direction: 'sent',
      request,
      endpoint,
      isRecursion: recursionCheck.isRecursion,
      recursionReason: recursionCheck.reason,
      sessionId: this.sessionId || undefined
    };

    this.addEvent(event);
    
    // Store in Supabase if available
    if (this.supabaseClient && this.sessionId && this.playerId) {
      try {
        // Parse JSON safely
        let requestData = null;
        try {
          requestData = request ? JSON.parse(request) : null;
        } catch (e) {
          // If not valid JSON, store as string
          requestData = { raw: request };
        }
        
        await this.supabaseClient.rpc('log_io_event', {
          p_session_id: this.sessionId,
          p_player_id: this.playerId,
          p_event_type: type,
          p_direction: 'sent',
          p_endpoint: endpoint || null,
          p_request_data: requestData,
          p_response_data: null,
          p_error_data: null,
          p_is_recursion: recursionCheck.isRecursion,
          p_recursion_reason: recursionCheck.reason || null
        });
      } catch (error) {
        // Non-critical - log but don't block
        console.debug('[IOLogger] Failed to store log in Supabase:', error);
      }
    }
    
    return eventId;
  }

  /**
   * Log a received response
   */
  public async logReceived(
    type: IOEventType,
    response: string,
    endpoint?: string,
    requestId?: string
  ): Promise<void> {
    const eventId = requestId || crypto.randomUUID();
    
    // Detect recursion
    const recursionCheck = this.detectRecursion(type, 'received', response);
    
    const event: IOEvent = {
      id: eventId,
      timestamp: new Date(),
      type,
      direction: 'received',
      response,
      endpoint,
      isRecursion: recursionCheck.isRecursion,
      recursionReason: recursionCheck.reason,
      sessionId: this.sessionId || undefined
    };

    this.addEvent(event);
    
    // Store in Supabase if available
    if (this.supabaseClient && this.sessionId && this.playerId) {
      try {
        // Parse JSON safely
        let responseData = null;
        try {
          responseData = response ? JSON.parse(response) : null;
        } catch (e) {
          // If not valid JSON, store as string
          responseData = { raw: response };
        }
        
        await this.supabaseClient.rpc('log_io_event', {
          p_session_id: this.sessionId,
          p_player_id: this.playerId,
          p_event_type: type,
          p_direction: 'received',
          p_endpoint: endpoint || null,
          p_request_data: null,
          p_response_data: responseData,
          p_error_data: null,
          p_is_recursion: recursionCheck.isRecursion,
          p_recursion_reason: recursionCheck.reason || null
        });
      } catch (error) {
        // Non-critical - log but don't block
        console.debug('[IOLogger] Failed to store log in Supabase:', error);
      }
    }
  }

  /**
   * Log an error
   */
  public async logError(
    type: IOEventType,
    error: string,
    endpoint?: string,
    request?: string
  ): Promise<void> {
    const eventId = crypto.randomUUID();
    
    const event: IOEvent = {
      id: eventId,
      timestamp: new Date(),
      type: 'error',
      direction: 'sent',
      error,
      endpoint,
      request,
      sessionId: this.sessionId || undefined
    };

    this.addEvent(event);
    
    // Store in Supabase if available
    if (this.supabaseClient && this.sessionId && this.playerId) {
      try {
        // Parse JSON safely
        let requestData = null;
        try {
          requestData = request ? JSON.parse(request) : null;
        } catch (e) {
          // If not valid JSON, store as string
          requestData = { raw: request };
        }
        
        await this.supabaseClient.rpc('log_io_event', {
          p_session_id: this.sessionId,
          p_player_id: this.playerId,
          p_event_type: 'error',
          p_direction: 'sent',
          p_endpoint: endpoint || null,
          p_request_data: requestData,
          p_response_data: null,
          p_error_data: { error, original_type: type },
          p_is_recursion: false,
          p_recursion_reason: null
        });
      } catch (error) {
        // Non-critical - log but don't block
        console.debug('[IOLogger] Failed to store error log in Supabase:', error);
      }
    }
  }

  /**
   * Get sessions for current player
   */
  public async getSessions(): Promise<IOLogSession[]> {
    if (!this.supabaseClient || !this.playerId) {
      return [];
    }
    
    try {
      const { data, error } = await this.supabaseClient.rpc('get_io_log_sessions', {
        p_player_id: this.playerId
      });
      
      if (error) {
        console.error('[IOLogger] Failed to get sessions:', error);
        return [];
      }
      
      return data || [];
    } catch (error) {
      console.error('[IOLogger] Error getting sessions:', error);
      return [];
    }
  }

  /**
   * Load logs for a specific session
   */
  public async loadSessionLogs(
    sessionId: string,
    eventTypes?: IOEventType[]
  ): Promise<IOEvent[]> {
    if (!this.supabaseClient) {
      return [];
    }
    
    try {
      const { data, error } = await this.supabaseClient.rpc('get_io_logs_for_session', {
        p_session_id: sessionId,
        p_event_types: eventTypes || null,
        p_limit: 1000
      });
      
      if (error) {
        console.error('[IOLogger] Failed to load session logs:', error);
        return [];
      }
      
      // Convert database format to IOEvent format
      return (data || []).map((row: any) => ({
        id: row.id,
        timestamp: new Date(row.log_timestamp || row.timestamp),
        type: row.event_type as IOEventType,
        direction: row.direction as 'sent' | 'received',
        endpoint: row.endpoint,
        request: row.request_data ? (typeof row.request_data === 'string' ? row.request_data : JSON.stringify(row.request_data, null, 2)) : undefined,
        response: row.response_data ? (typeof row.response_data === 'string' ? row.response_data : JSON.stringify(row.response_data, null, 2)) : undefined,
        error: row.error_data ? (typeof row.error_data === 'string' ? row.error_data : JSON.stringify(row.error_data, null, 2)) : undefined,
        isRecursion: row.is_recursion,
        recursionReason: undefined,
        sessionId: sessionId
      }));
    } catch (error) {
      console.error('[IOLogger] Error loading session logs:', error);
      return [];
    }
  }

  /**
   * Add event and notify callbacks
   */
  private addEvent(event: IOEvent): void {
    this.events.push(event);

    // Keep only last maxEvents
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Notify all callbacks
    this.callbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('[IOLogger] Error in callback:', error);
      }
    });
  }

  /**
   * Subscribe to new events
   */
  public onEvent(callback: IOEventCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Get all events (optionally filtered)
   */
  public getEvents(filters?: {
    types?: IOEventType[];
    direction?: 'sent' | 'received';
  }): IOEvent[] {
    let filtered = [...this.events];

    if (filters?.types && filters.types.length > 0) {
      filtered = filtered.filter(event => 
        filters.types!.includes(event.type) || 
        (event.type === 'error' && filters.types.includes('error'))
      );
    }

    if (filters?.direction) {
      filtered = filtered.filter(event => event.direction === filters.direction);
    }

    return filtered;
  }

  /**
   * Clear all events
   */
  public clear(): void {
    this.events = [];
    this.callbacks.forEach(callback => {
      try {
        callback({
          id: 'clear',
          timestamp: new Date(),
          type: 'supabase',
          direction: 'sent',
          request: 'CLEAR'
        });
      } catch (error) {
        console.error('[IOLogger] Error in clear callback:', error);
      }
    });
  }

  /**
   * Get event count
   */
  public getEventCount(): number {
    return this.events.length;
  }
}

export const getIOLogger = () => IOLogger.getInstance();

