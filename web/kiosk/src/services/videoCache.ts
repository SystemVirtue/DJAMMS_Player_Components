/**
 * Video Cache Service
 * 
 * Caches the full video list in IndexedDB to avoid reloading on every search
 * Only refreshes when cache is empty or explicitly invalidated
 */

import { getAllLocalVideos } from '@shared/supabase-client';
import type { SupabaseLocalVideo } from '@shared/types';

const CACHE_DB_NAME = 'djamms-videos';
const CACHE_VERSION = 1;
const CACHE_STORE_NAME = 'videos';
const METADATA_STORE_NAME = 'cache_metadata';

interface VideoCache {
  db: IDBDatabase | null;
  isInitialized: boolean;
}

interface CacheMetadata {
  playerId: string;
  lastUpdated: number;
  videoCount: number;
}

class VideoCacheService {
  private cache: VideoCache = {
    db: null,
    isInitialized: false
  };

  /**
   * Initialize IndexedDB for video caching
   */
  async initialize(): Promise<void> {
    if (this.cache.isInitialized && this.cache.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CACHE_DB_NAME, CACHE_VERSION);
      
      request.onerror = () => {
        console.error('[VideoCache] Failed to open IndexedDB:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.cache.db = request.result;
        this.cache.isInitialized = true;
        console.log('[VideoCache] IndexedDB initialized');
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create videos store
        if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
          const videoStore = db.createObjectStore(CACHE_STORE_NAME, { keyPath: 'id' });
          videoStore.createIndex('playerId', 'player_id', { unique: false });
          console.log('[VideoCache] Created videos object store');
        }
        
        // Create metadata store
        if (!db.objectStoreNames.contains(METADATA_STORE_NAME)) {
          const metadataStore = db.createObjectStore(METADATA_STORE_NAME, { keyPath: 'playerId' });
          console.log('[VideoCache] Created metadata object store');
        }
      };
    });
  }

  /**
   * Get cached videos for a player
   */
  async getCachedVideos(playerId: string): Promise<SupabaseLocalVideo[] | null> {
    if (!this.cache.isInitialized) {
      await this.initialize();
    }

    if (!this.cache.db) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.cache.db!.transaction([CACHE_STORE_NAME], 'readonly');
      const store = transaction.objectStore(CACHE_STORE_NAME);
      const index = store.index('playerId');
      const request = index.getAll(playerId);

      request.onsuccess = () => {
        const videos = request.result as SupabaseLocalVideo[];
        if (videos && videos.length > 0) {
          console.log(`[VideoCache] Found ${videos.length} cached videos for player ${playerId}`);
          resolve(videos);
        } else {
          console.log(`[VideoCache] No cached videos found for player ${playerId}`);
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('[VideoCache] Error reading from cache:', request.error);
        resolve(null);
      };
    });
  }

  /**
   * Cache videos for a player
   */
  async cacheVideos(playerId: string, videos: SupabaseLocalVideo[]): Promise<void> {
    if (!this.cache.isInitialized) {
      await this.initialize();
    }

    if (!this.cache.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.cache.db!.transaction([CACHE_STORE_NAME, METADATA_STORE_NAME], 'readwrite');
      const videoStore = transaction.objectStore(CACHE_STORE_NAME);
      const metadataStore = transaction.objectStore(METADATA_STORE_NAME);

      // Clear existing videos for this player
      const index = videoStore.index('playerId');
      const clearRequest = index.openKeyCursor(IDBKeyRange.only(playerId));
      
      clearRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          videoStore.delete(cursor.primaryKey);
          cursor.continue();
        } else {
          // All old videos cleared, now add new ones
          let videosAdded = 0;
          videos.forEach((video, index) => {
            const videoWithPlayerId = { ...video, player_id: playerId };
            const request = videoStore.put(videoWithPlayerId);
            
            request.onsuccess = () => {
              videosAdded++;
              if (videosAdded === videos.length) {
                // Update metadata
                const metadata: CacheMetadata = {
                  playerId,
                  lastUpdated: Date.now(),
                  videoCount: videos.length
                };
                metadataStore.put(metadata);
                console.log(`[VideoCache] Cached ${videos.length} videos for player ${playerId}`);
                resolve();
              }
            };
            
            request.onerror = () => {
              console.error('[VideoCache] Error caching video:', request.error);
              if (videosAdded === videos.length) {
                resolve(); // Continue even if some fail
              }
            };
          });
          
          if (videos.length === 0) {
            // Update metadata even if no videos
            const metadata: CacheMetadata = {
              playerId,
              lastUpdated: Date.now(),
              videoCount: 0
            };
            metadataStore.put(metadata);
            resolve();
          }
        }
      };

      clearRequest.onerror = () => {
        console.error('[VideoCache] Error clearing old videos:', clearRequest.error);
        reject(clearRequest.error);
      };
    });
  }

  /**
   * Get or load videos (with caching)
   * Returns cached videos if available, otherwise loads and caches them
   */
  async getOrLoadVideos(playerId: string, forceRefresh: boolean = false): Promise<SupabaseLocalVideo[]> {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await this.getCachedVideos(playerId);
      if (cached !== null) {
        return cached;
      }
    }

    // Cache miss or force refresh - load from Supabase
    console.log(`[VideoCache] ${forceRefresh ? 'Force refreshing' : 'Cache miss'} - Loading videos for player ${playerId}`);
    const videos = await getAllLocalVideos(playerId, null, 0);
    
    // Cache the results
    await this.cacheVideos(playerId, videos);
    
    return videos;
  }

  /**
   * Invalidate cache for a player (e.g., after re-indexing)
   */
  async invalidateCache(playerId: string): Promise<void> {
    if (!this.cache.isInitialized) {
      await this.initialize();
    }

    if (!this.cache.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.cache.db!.transaction([CACHE_STORE_NAME, METADATA_STORE_NAME], 'readwrite');
      const videoStore = transaction.objectStore(CACHE_STORE_NAME);
      const metadataStore = transaction.objectStore(METADATA_STORE_NAME);
      
      // Clear videos
      const index = videoStore.index('playerId');
      const clearRequest = index.openKeyCursor(IDBKeyRange.only(playerId));
      
      clearRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          videoStore.delete(cursor.primaryKey);
          cursor.continue();
        } else {
          // Clear metadata
          metadataStore.delete(playerId);
          console.log(`[VideoCache] Invalidated cache for player ${playerId}`);
          resolve();
        }
      };

      clearRequest.onerror = () => {
        console.error('[VideoCache] Error invalidating cache:', clearRequest.error);
        reject(clearRequest.error);
      };
    });
  }

  /**
   * Get cache metadata (last updated time, video count)
   */
  async getCacheMetadata(playerId: string): Promise<CacheMetadata | null> {
    if (!this.cache.isInitialized) {
      await this.initialize();
    }

    if (!this.cache.db) {
      return null;
    }

    return new Promise((resolve) => {
      const transaction = this.cache.db!.transaction([METADATA_STORE_NAME], 'readonly');
      const store = transaction.objectStore(METADATA_STORE_NAME);
      const request = store.get(playerId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        resolve(null);
      };
    });
  }

  /**
   * Clear all cached data
   */
  async clearAllCache(): Promise<void> {
    if (!this.cache.db) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      if (!this.cache.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.cache.db.transaction([CACHE_STORE_NAME, METADATA_STORE_NAME], 'readwrite');
      const videoStore = transaction.objectStore(CACHE_STORE_NAME);
      const metadataStore = transaction.objectStore(METADATA_STORE_NAME);
      
      const videoClear = videoStore.clear();
      const metadataClear = metadataStore.clear();

      Promise.all([
        new Promise((res, rej) => {
          videoClear.onsuccess = () => res(undefined);
          videoClear.onerror = () => rej(videoClear.error);
        }),
        new Promise((res, rej) => {
          metadataClear.onsuccess = () => res(undefined);
          metadataClear.onerror = () => rej(metadataClear.error);
        })
      ]).then(() => {
        console.log('[VideoCache] All cache cleared');
        resolve();
      }).catch(reject);
    });
  }
}

export const videoCache = new VideoCacheService();

