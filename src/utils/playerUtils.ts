/**
 * Player ID Utilities for Electron App
 * 
 * Electron Player CAN claim/create new Player IDs.
 * This is in contrast to Web apps which can only connect to existing IDs.
 */

import { getSupabaseService } from '../services/SupabaseService';

// Storage key for localStorage (used in renderer process)
const STORAGE_KEY = 'djamms_player_id';

// Default Player ID
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
 */
export async function validatePlayerId(id: string): Promise<boolean> {
  const clean = id.trim().toUpperCase();
  
  if (clean.length < MIN_PLAYER_ID_LENGTH) {
    return false;
  }

  try {
    const supabase = getSupabaseService();
    const client = supabase.getClient();
    
    const { data, error } = await client
      .from('players')
      .select('player_id')
      .eq('player_id', clean)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - player doesn't exist
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
 * Claim a new Player ID (Electron only)
 * Creates a new player record in the database
 * Returns true if successful, false if already taken or error
 */
export async function claimPlayerId(id: string, name?: string): Promise<{ success: boolean; error?: string }> {
  const clean = id.trim().toUpperCase();
  
  if (clean.length < MIN_PLAYER_ID_LENGTH) {
    return { success: false, error: `Player ID must be at least ${MIN_PLAYER_ID_LENGTH} characters` };
  }

  try {
    const supabase = getSupabaseService();
    const client = supabase.getClient();
    
    const { error } = await client
      .from('players')
      .insert({
        player_id: clean,
        name: name || null
      });

    if (error) {
      // Unique constraint violation - ID already taken
      if (error.code === '23505') {
        return { success: false, error: 'Player ID already exists' };
      }
      console.error('[playerUtils] Error claiming Player ID:', error);
      return { success: false, error: error.message };
    }

    // Store in localStorage
    setPlayerId(clean);
    return { success: true };
  } catch (err) {
    console.error('[playerUtils] Exception claiming Player ID:', err);
    return { success: false, error: 'Failed to claim Player ID' };
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
    const supabase = getSupabaseService();
    const client = supabase.getClient();
    
    const { data, error } = await client
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

/**
 * Generate a random Player ID
 */
export function generateRandomPlayerId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'DJAMMS_';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Initialize Player ID on app startup
 * - If stored ID exists and is valid, use it
 * - If no stored ID, try to claim DEFAULT_PLAYER_ID
 * - If DEFAULT taken, generate and claim a random ID
 */
export async function initializePlayerId(): Promise<string> {
  // Check for stored ID
  const storedId = getPlayerId();
  if (storedId) {
    const isValid = await validatePlayerId(storedId);
    if (isValid) {
      console.log('[playerUtils] Using stored Player ID:', storedId);
      return storedId;
    } else {
      console.warn('[playerUtils] Stored Player ID no longer valid, will claim new ID');
      clearPlayerId();
    }
  }

  // Try to claim default ID
  console.log('[playerUtils] Attempting to claim default Player ID:', DEFAULT_PLAYER_ID);
  const defaultResult = await claimPlayerId(DEFAULT_PLAYER_ID);
  if (defaultResult.success) {
    console.log('[playerUtils] Claimed default Player ID:', DEFAULT_PLAYER_ID);
    return DEFAULT_PLAYER_ID;
  }

  // Default taken - check if we can just use it (we claimed it before from another instance)
  const defaultExists = await validatePlayerId(DEFAULT_PLAYER_ID);
  if (defaultExists) {
    console.log('[playerUtils] Default Player ID exists, using it:', DEFAULT_PLAYER_ID);
    setPlayerId(DEFAULT_PLAYER_ID);
    return DEFAULT_PLAYER_ID;
  }

  // Generate random ID
  let attempts = 0;
  while (attempts < 10) {
    const randomId = generateRandomPlayerId();
    console.log('[playerUtils] Attempting to claim random Player ID:', randomId);
    const result = await claimPlayerId(randomId);
    if (result.success) {
      console.log('[playerUtils] Claimed random Player ID:', randomId);
      return randomId;
    }
    attempts++;
  }

  // Fallback - shouldn't happen
  console.error('[playerUtils] Failed to claim any Player ID after 10 attempts');
  throw new Error('Failed to initialize Player ID');
}
