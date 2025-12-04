/**
 * Supabase Configuration for DJAMMS Player
 * 
 * This file contains the configuration for connecting to the Supabase backend.
 * The values are hardcoded for now but could be moved to environment variables.
 */

import { SupabaseConfig } from '../types/supabase';

// DJAMMS_Obie_Server Project Configuration
export const SUPABASE_URL = 'https://lfvhgdbnecjeuciadimx.supabase.co';

// Public anon key - safe to expose in client-side code
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmdmhnZGJuZWNqZXVjaWFkaW14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2OTc2MjIsImV4cCI6MjA3OTI3MzYyMn0.kSVtXnNVRofDol8L20oflgdo7A82BgAMco2FoFHRkG8';

// Default player ID - should be unique per Electron instance
// In production, this would be generated on first run and stored
export const DEFAULT_PLAYER_ID = 'electron-player-1';

/**
 * Get the Supabase configuration
 * @param playerId - Optional player ID override
 */
export function getSupabaseConfig(playerId?: string): SupabaseConfig {
  return {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    playerId: playerId || DEFAULT_PLAYER_ID
  };
}

// Heartbeat interval in milliseconds (30 seconds)
export const HEARTBEAT_INTERVAL = 30000;

// Command polling interval (for fallback if realtime fails)
export const COMMAND_POLL_INTERVAL = 5000;

// State sync debounce time (prevent excessive updates)
export const STATE_SYNC_DEBOUNCE = 1000; // 1 second debounce to reduce update spam

// Maximum age for pending commands before considered expired (5 minutes)
export const COMMAND_EXPIRY_MS = 5 * 60 * 1000;
