/**
 * Player ID Utilities for Electron App
 * 
 * Electron Player CAN claim/create new Player IDs.
 * This is in contrast to Web apps which can only connect to existing IDs.
 */

// Lazy import to avoid bundling Supabase in library build
let _supabaseService: any = null;
const getSupabaseServiceLazy = async () => {
  if (!_supabaseService) {
    const module = await import('../services/SupabaseService');
    _supabaseService = module.getSupabaseService();
  }
  return _supabaseService;
};

// Lazy import logger to avoid circular dependencies
let _logger: any = null;
const getLogger = async () => {
  if (!_logger) {
    const module = await import('./logger');
    _logger = module.logger;
  }
  return _logger;
};

// Storage key for localStorage (used in renderer process)
const STORAGE_KEY = 'djamms_player_id';

// Default Player ID - "DJAMMS_DEMO" (prompts user to change but allows app to continue)
export const DEFAULT_PLAYER_ID = 'DJAMMS_DEMO';

// Minimum length for Player IDs
export const MIN_PLAYER_ID_LENGTH = 4;
export const MAX_PLAYER_ID_LENGTH = 20;

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
 * Rules:
 * - Must be between 4 and 20 characters
 * - Only A-Z, 0-9, and underscore (_) allowed
 * - No spaces or special characters
 */
export function isValidPlayerIdFormat(id: string): boolean {
  const clean = id.trim().toUpperCase();
  
  // Check length
  if (clean.length < MIN_PLAYER_ID_LENGTH || clean.length > MAX_PLAYER_ID_LENGTH) {
    return false;
  }
  
  // Check characters: only A-Z, 0-9, and underscore
  const validPattern = /^[A-Z0-9_]+$/;
  return validPattern.test(clean);
}

/**
 * Validate that a Player ID exists in the database
 * Returns false if Supabase is not available (instead of throwing)
 */
export async function validatePlayerId(id: string): Promise<boolean> {
  const clean = id.trim().toUpperCase();
  
  if (clean.length < MIN_PLAYER_ID_LENGTH) {
    return false;
  }

  try {
    const supabase = await getSupabaseServiceLazy();
    const client = supabase.getClient();
    
    if (!client) {
      // Supabase not available - just return false silently in dev mode
      return false;
    }
    
    const { data, error } = await client
      .from('players')
      .select('player_id')
      .eq('player_id', clean)
      .single();

    if (error) {
      // Not found or other error
      return false;
    }
    
    return !!data;
  } catch (err) {
    // Supabase error - return false
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
    const supabase = await getSupabaseServiceLazy();
    const client = supabase.getClient();
    
    if (!client) {
      // Supabase not available - fail silently without logging
      return { success: false, error: 'Supabase not available' };
    }
    
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
      return { success: false, error: error.message };
    }

    // Store in localStorage
    setPlayerId(clean);
    return { success: true };
  } catch (err) {
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
    const supabase = await getSupabaseServiceLazy();
    const client = supabase.getClient();
    
    if (!client) {
      return null;
    }
    
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
 * - If stored ID exists, use it (skip validation to avoid errors during startup)
 * - Otherwise, return "DJAMMS_DEMO" (allows app to continue, but prompts user to change)
 * 
 * Returns "DJAMMS_DEMO" if no Player ID is set (triggers first-run prompt)
 */
export async function initializePlayerId(): Promise<string> {
  // Check for stored ID
  const storedId = getPlayerId();
  if (storedId && storedId.trim() !== '' && storedId.trim() !== 'DJAMMS_DEMO') {
    try {
      const logger = await getLogger();
      logger.debug('[playerUtils] Using stored Player ID:', storedId);
    } catch (err) {
      // Logger not available - continue silently
    }
    return storedId;
  }

  // No Player ID set - return "DJAMMS_DEMO" to allow app to continue (but prompt user)
  try {
    const logger = await getLogger();
    logger.debug('[playerUtils] No Player ID set - using default DJAMMS_DEMO');
  } catch (err) {
    // Logger not available - continue silently
  }
  return DEFAULT_PLAYER_ID;
}
