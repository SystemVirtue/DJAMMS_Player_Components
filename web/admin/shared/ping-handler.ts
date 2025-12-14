/**
 * Ping Handler for Web Admin and Kiosk
 * Responds to ping commands from Electron Player with IP address
 */

import { supabase } from './supabase-client';
import { DEFAULT_PLAYER_ID } from './supabase-client';

let pingChannel: any = null;
let isPingHandlerActive = false;

/**
 * Get client IP address
 */
async function getClientIP(): Promise<string> {
  try {
    // Try to get IP from various sources
    // Method 1: Use a public IP service
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip || 'unknown';
  } catch (error) {
    // Fallback: Try another service
    try {
      const response = await fetch('https://api64.ipify.org?format=json');
      const data = await response.json();
      return data.ip || 'unknown';
    } catch (err) {
      // Final fallback
      return window.location.hostname || 'unknown';
    }
  }
}

/**
 * Initialize ping handler for Web Admin/Kiosk
 */
export async function initializePingHandler(
  playerId: string = DEFAULT_PLAYER_ID,
  endpointType: 'web-admin' | 'web-kiosk'
): Promise<void> {
  if (isPingHandlerActive) {
    return; // Already initialized
  }

  try {
    // Subscribe to ping commands via Broadcast channel
    pingChannel = supabase
      .channel(`ping-handler:${playerId}`)
      .on('broadcast', { event: 'ping' }, async (payload) => {
        const message = payload.payload as {
          player_id: string;
          timestamp: number;
          endpoint_type?: string;
        };

        // Only respond if ping is for this player or general
        if (message.player_id && message.player_id !== playerId) {
          return;
        }

        // Get client IP
        const clientIP = await getClientIP();

        // Respond via Broadcast channel
        try {
          await pingChannel.send({
            type: 'broadcast',
            event: 'ping_response',
            payload: {
              player_id: playerId,
              endpoint_type: endpointType,
              ip_address: clientIP,
              timestamp: Date.now(),
              ping_timestamp: message.timestamp
            }
          });

          console.log(`[PingHandler] Responded to ping with IP: ${clientIP}`);
        } catch (error) {
          console.error('[PingHandler] Failed to send ping response:', error);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isPingHandlerActive = true;
          console.log(`[PingHandler] ✅ Ping handler active for ${endpointType}`);
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          isPingHandlerActive = false;
          console.warn(`[PingHandler] ⚠️ Ping handler disconnected`);
        }
      });
  } catch (error) {
    console.error('[PingHandler] Failed to initialize:', error);
  }
}

/**
 * Cleanup ping handler
 */
export function cleanupPingHandler(): void {
  if (pingChannel) {
    pingChannel.unsubscribe();
    pingChannel = null;
    isPingHandlerActive = false;
  }
}

