/**
 * Thumbnail Cache Service
 * 
 * Downloads and caches thumbnails from Supabase Storage in IndexedDB
 * for fast offline access in the KIOSK.
 */

import { supabase } from '@shared/supabase-client';

const CACHE_DB_NAME = 'djamms-thumbnails';
const CACHE_VERSION = 1;
const BUCKET_NAME = 'thumbnails';

interface ThumbnailCache {
  db: IDBDatabase | null;
  isInitialized: boolean;
  downloadProgress: { downloaded: number; total: number };
  isDownloading: boolean;
}

class ThumbnailCacheService {
  private cache: ThumbnailCache = {
    db: null,
    isInitialized: false,
    downloadProgress: { downloaded: 0, total: 0 },
    isDownloading: false
  };

  /**
   * Initialize IndexedDB for thumbnail caching
   */
  async initialize(): Promise<void> {
    if (this.cache.isInitialized && this.cache.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CACHE_DB_NAME, CACHE_VERSION);
      
      request.onerror = () => {
        console.error('[ThumbnailCache] Failed to open IndexedDB:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.cache.db = request.result;
        this.cache.isInitialized = true;
        console.log('[ThumbnailCache] IndexedDB initialized');
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('thumbnails')) {
          const store = db.createObjectStore('thumbnails', { keyPath: 'youtubeId' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          console.log('[ThumbnailCache] Created object store');
        }
      };
    });
  }

  /**
   * Get thumbnail URL - checks cache first, falls back to Supabase
   */
  async getThumbnailUrl(youtubeId: string): Promise<string> {
    if (!youtubeId) return '';

    if (!this.cache.isInitialized) {
      await this.initialize();
    }

    // Check cache first
    const cached = await this.getFromCache(youtubeId);
    if (cached) {
      return cached; // Return blob URL from IndexedDB
    }

    // Fallback to Supabase URL (will download on-demand by browser)
    return this.getSupabaseUrl(youtubeId);
  }

  /**
   * Get thumbnail from IndexedDB cache
   */
  private async getFromCache(youtubeId: string): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.cache.db) {
        resolve(null);
        return;
      }

      const transaction = this.cache.db.transaction(['thumbnails'], 'readonly');
      const store = transaction.objectStore('thumbnails');
      const request = store.get(youtubeId);

      request.onsuccess = () => {
        const result = request.result;
        if (result && result.blob) {
          try {
            // Create blob URL from cached data
            const blob = new Blob([result.blob], { type: 'image/png' });
            const blobUrl = URL.createObjectURL(blob);
            resolve(blobUrl);
          } catch (error) {
            console.error(`[ThumbnailCache] Error creating blob URL for ${youtubeId}:`, error);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error(`[ThumbnailCache] Error reading from cache for ${youtubeId}:`, request.error);
        resolve(null);
      };
    });
  }

  /**
   * Get public URL from Supabase Storage
   */
  private getSupabaseUrl(youtubeId: string): string {
    const { data } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(`${youtubeId}.thumb.250.png`);
    return data.publicUrl;
  }

  /**
   * Download all thumbnails for a list of videos (background process)
   */
  async downloadAllThumbnails(videoList: Array<{ youtubeId?: string | null }>): Promise<void> {
    if (this.cache.isDownloading) {
      console.log('[ThumbnailCache] Download already in progress');
      return;
    }

    if (!this.cache.isInitialized) {
      await this.initialize();
    }

    // Extract unique YouTube IDs
    const uniqueIds = [...new Set(
      videoList
        .map(v => v.youtubeId)
        .filter((id): id is string => Boolean(id))
    )];

    if (uniqueIds.length === 0) {
      console.log('[ThumbnailCache] No thumbnails to download');
      return;
    }

    this.cache.downloadProgress = { downloaded: 0, total: uniqueIds.length };
    this.cache.isDownloading = true;

    console.log(`[ThumbnailCache] Starting download of ${uniqueIds.length} thumbnails...`);

    // Download in batches of 20 to avoid overwhelming the browser
    const BATCH_SIZE = 20;
    for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
      const batch = uniqueIds.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(id => this.downloadAndCache(id)));
      
      // Small delay between batches
      if (i + BATCH_SIZE < uniqueIds.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    this.cache.isDownloading = false;
    console.log(`[ThumbnailCache] Download complete: ${this.cache.downloadProgress.downloaded}/${this.cache.downloadProgress.total} cached`);
  }

  /**
   * Download a single thumbnail and cache it
   */
  private async downloadAndCache(youtubeId: string): Promise<void> {
    try {
      // Check if already cached
      const cached = await this.getFromCache(youtubeId);
      if (cached) {
        this.cache.downloadProgress.downloaded++;
        return; // Already cached
      }

      // Download from Supabase
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .download(`${youtubeId}.thumb.250.png`);

      if (error || !data) {
        // Thumbnail doesn't exist in Supabase - that's okay, skip it
        return;
      }

      // Convert to ArrayBuffer for IndexedDB storage
      const arrayBuffer = await data.arrayBuffer();

      // Store in IndexedDB
      if (this.cache.db) {
        const transaction = this.cache.db.transaction(['thumbnails'], 'readwrite');
        const store = transaction.objectStore('thumbnails');
        await new Promise<void>((resolve, reject) => {
          const request = store.put({
            youtubeId,
            blob: arrayBuffer,
            timestamp: Date.now()
          });
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }

      this.cache.downloadProgress.downloaded++;
    } catch (error) {
      console.error(`[ThumbnailCache] Failed to cache thumbnail ${youtubeId}:`, error);
    }
  }

  /**
   * Get download progress
   */
  getProgress() {
    return { ...this.cache.downloadProgress };
  }

  /**
   * Check if download is in progress
   */
  isDownloadInProgress(): boolean {
    return this.cache.isDownloading;
  }

  /**
   * Clear all cached thumbnails
   */
  async clearCache(): Promise<void> {
    if (!this.cache.db) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      if (!this.cache.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.cache.db.transaction(['thumbnails'], 'readwrite');
      const store = transaction.objectStore('thumbnails');
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[ThumbnailCache] Cache cleared');
        resolve();
      };

      request.onerror = () => {
        console.error('[ThumbnailCache] Error clearing cache:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get cache size (approximate)
   */
  async getCacheSize(): Promise<number> {
    if (!this.cache.db) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      if (!this.cache.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.cache.db.transaction(['thumbnails'], 'readonly');
      const store = transaction.objectStore('thumbnails');
      const request = store.count();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }
}

export const thumbnailCache = new ThumbnailCacheService();
