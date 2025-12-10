/**
 * Supabase Configuration for DJAMMS Player
 * 
 * This file contains the configuration for connecting to the Supabase backend.
 * Values are loaded from environment variables with fallback to defaults.
 * 
 * For Electron renderer process (Vite): Use import.meta.env.VITE_*
 * For Electron main process: Use process.env
 */

import { SupabaseConfig } from '../types/supabase';

// Get environment variables with fallbacks
// In Vite (renderer), use import.meta.env.VITE_* (compiled at build time)
// In Node.js (main), use process.env
const getEnvVar = (viteKey: string, nodeKey: string, fallback: string): string => {
  // Check Vite environment (renderer process) - import.meta.env is available at compile time
  // Check if we're in a Vite context by checking for import.meta.env directly
  // @ts-ignore - import.meta may not be defined in Node.js context
  if (typeof window !== 'undefined' && typeof import.meta !== 'undefined' && import.meta.env) {
    // @ts-ignore
    const viteValue = import.meta.env[viteKey];
    if (viteValue && viteValue !== 'undefined') return viteValue;
  }
  
  // Check Node.js environment (main process)
  if (typeof process !== 'undefined' && process.env) {
    const nodeValue = process.env[nodeKey];
    if (nodeValue) return nodeValue;
  }
  
  // Fallback to default (for development)
  return fallback;
};

// DJAMMS_Obie_Server Project Configuration
// Default values are provided for development but should be overridden via .env
export const SUPABASE_URL = getEnvVar(
  'VITE_SUPABASE_URL',
  'SUPABASE_URL',
  'https://lfvhgdbnecjeuciadimx.supabase.co' // Fallback for development
);

// Public anon key - safe to expose in client-side code
export const SUPABASE_ANON_KEY = getEnvVar(
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmdmhnZGJuZWNqZXVjaWFkaW14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2OTc2MjIsImV4cCI6MjA3OTI3MzYyMn0.kSVtXnNVRofDol8L20oflgdo7A82BgAMco2FoFHRkG8' // Fallback for development
);

// Default player ID - "DJAMMS_DEMO" (prompts user to change but allows app to continue)
export const DEFAULT_PLAYER_ID = 'DJAMMS_DEMO';

// Minimum length for Player ID
export const MIN_PLAYER_ID_LENGTH = 6;

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
export const STATE_SYNC_DEBOUNCE = 300; // 300ms debounce for better responsiveness while reducing spam

// Maximum age for pending commands before considered expired (5 minutes)
export const COMMAND_EXPIRY_MS = 5 * 60 * 1000;
