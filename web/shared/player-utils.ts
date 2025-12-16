/**
 * Player ID Utilities for Web Apps (Kiosk/Admin)
 * 
 * Web apps can ONLY connect to EXISTING Player IDs.
 * Only Electron Player can claim/create new Player IDs.
 */

import { supabase } from './supabase-client';

// Storage key for localStorage
const STORAGE_KEY = 'djamms_player_id';

// Default Player ID to pre-fill in connection dialog
export const DEFAULT_PLAYER_ID = 'DEMO_PLAYER';

// Minimum length for Player IDs
export const MIN_PLAYER_ID_LENGTH = 6;

/**
 * Get stored Player ID from localStorage
 */
export function getPlayerId(): string | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }
  return localStorage.getItem(STORAGE_KEY) || null;
}

/**
 * Store Player ID in localStorage (uppercase)
 */
export function setPlayerId(id: string): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(STORAGE_KEY, id.toUpperCase());
}

/**
 * Clear stored Player ID
 */
export function clearPlayerId(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Validate Player ID format (local check only)
 */
export function isValidPlayerIdFormat(id: string): boolean {
  const clean = id.trim().toUpperCase();
  return clean.length >= MIN_PLAYER_ID_LENGTH;
}

/**
 * Validate that a Player ID exists in the database
 * Web apps can only connect to EXISTING players
 */
export async function validatePlayerId(id: string): Promise<boolean> {
  const clean = id.trim().toUpperCase();
  
  if (clean.length < MIN_PLAYER_ID_LENGTH) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from('players')
      .select('player_id')
      .eq('player_id', clean)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return false;
      }
      console.error('[playerUtils] Error validating Player ID:', error);
      return false;
    }

    return !!data;
  } catch (err) {
    console.error('[playerUtils] Exception validating Player ID:', err);
    return false;
  }
}

/**
 * Get player info from database
 */
export async function getPlayerInfo(id: string): Promise<{ 
  player_id: string; 
  name: string | null; 
  created_at: string 
} | null> {
  const clean = id.trim().toUpperCase();
  
  try {
    const { data, error } = await supabase
      .from('players')
      .select('player_id, name, created_at')
      .eq('player_id', clean)
      .single();

    if (error) {
      return null;
    }
    return data;
  } catch (err) {
    return null;
  }
}
