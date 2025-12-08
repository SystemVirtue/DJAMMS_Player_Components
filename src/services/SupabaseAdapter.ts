/**
 * Unified Supabase Adapter Interface
 * 
 * This provides a common interface for Supabase operations across:
 * - Electron app (SupabaseService)
 * - Web apps (supabase-client)
 * 
 * The goal is to gradually consolidate the three Supabase implementations:
 * 1. src/services/SupabaseService.ts (Electron app - full service)
 * 2. web/shared/supabase-client.ts (Web apps - command sending)
 * 3. src/integration/supabase-adapter.js (Legacy - can be deprecated)
 * 
 * Architecture:
 * - Electron app is PRIMARY source of truth
 * - Supabase is SYNC layer (WEB → Commands → Electron; Electron → State → WEB)
 * - All data stored locally in Electron, synced to Supabase
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase';

/**
 * Base interface for Supabase operations
 */
export interface ISupabaseAdapter {
  /** Check if adapter is connected */
  connected(): boolean;
  
  /** Get the Supabase client */
  getClient(): SupabaseClient | null;
  
  /** Initialize the adapter */
  initialize(): Promise<boolean>;
  
  /** Shutdown the adapter */
  shutdown(): Promise<void>;
}

/**
 * Unified Supabase client factory
 * Creates a Supabase client with consistent configuration
 */
export function createSupabaseClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }

  // Import createClient - works in both ESM and CommonJS contexts
  const { createClient } = require('@supabase/supabase-js');
  
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    },
    global: {
      headers: {
        'Accept': 'application/json',
        'statement-timeout': '30000' // 30 second timeout for queries
      }
    }
  });
}

/**
 * Shared utility functions for Supabase operations
 */
export class SupabaseUtils {
  /**
   * Check if Supabase is configured
   */
  static isConfigured(): boolean {
    return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  }

  /**
   * Validate Supabase response
   */
  static validateResponse<T>(data: T | null, error: any): { data: T | null; error: any } {
    if (error) {
      logger.error('Supabase operation error:', error);
      return { data: null, error };
    }
    return { data, error: null };
  }
}

// Import logger for utilities
import { logger } from '../utils/logger';

