// src/services/LocalSearchService.ts
import Fuse, { IFuseOptions, FuseResultMatch } from 'fuse.js';
import { Video } from '../types';
import { logger } from '../utils/logger';

export interface SearchResult {
  item: Video;
  score: number;
  matches?: readonly FuseResultMatch[];
}

export interface SearchOptions {
  threshold?: number;
  limit?: number;
  keys?: string[];
}

const DEFAULT_SEARCH_OPTIONS: IFuseOptions<Video> = {
  keys: [
    { name: 'title', weight: 0.5 },
    { name: 'artist', weight: 0.3 },
    { name: 'album', weight: 0.1 },
    { name: 'playlist', weight: 0.1 }
  ],
  threshold: 0.4,
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
  ignoreLocation: true,
  useExtendedSearch: true
};

export class LocalSearchService {
  private fuse: Fuse<Video> | null = null;
  private videos: Video[] = [];
  private indexedPlaylists: Set<string> = new Set();

  constructor() {
    this.videos = [];
    this.fuse = null;
  }

  /**
   * Index videos from playlists for searching
   */
  indexVideos(playlists: Record<string, Video[]>): void {
    this.videos = [];
    this.indexedPlaylists.clear();

    for (const [playlistName, playlistVideos] of Object.entries(playlists)) {
      this.indexedPlaylists.add(playlistName);
      for (const video of playlistVideos) {
        this.videos.push({
          ...video,
          playlist: playlistName
        });
      }
    }

    this.fuse = new Fuse(this.videos, DEFAULT_SEARCH_OPTIONS);
    logger.info(`[LocalSearchService] Indexed ${this.videos.length} videos from ${this.indexedPlaylists.size} playlists`);
  }

  /**
   * Add videos from a single playlist to the index
   */
  addPlaylist(playlistName: string, videos: Video[]): void {
    if (this.indexedPlaylists.has(playlistName)) {
      // Remove existing videos from this playlist
      this.videos = this.videos.filter(v => v.playlist !== playlistName);
    }

    this.indexedPlaylists.add(playlistName);
    for (const video of videos) {
      this.videos.push({
        ...video,
        playlist: playlistName
      });
    }

    // Rebuild index
    this.fuse = new Fuse(this.videos, DEFAULT_SEARCH_OPTIONS);
  }

  /**
   * Search for videos matching the query
   */
  search(query: string, options?: SearchOptions): SearchResult[] {
    if (!this.fuse || !query.trim()) {
      return [];
    }

    const searchOptions: IFuseOptions<Video> = {
      ...DEFAULT_SEARCH_OPTIONS,
      threshold: options?.threshold ?? DEFAULT_SEARCH_OPTIONS.threshold
    };

    // Update fuse options if custom keys provided
    if (options?.keys) {
      searchOptions.keys = options.keys;
      this.fuse = new Fuse(this.videos, searchOptions);
    }

    const results = this.fuse.search(query);
    const limit = options?.limit ?? 50;

    return results.slice(0, limit).map(result => ({
      item: result.item,
      score: result.score ?? 0,
      matches: result.matches
    }));
  }

  /**
   * Search within a specific playlist
   */
  searchInPlaylist(query: string, playlistName: string, options?: SearchOptions): SearchResult[] {
    const playlistVideos = this.videos.filter(v => v.playlist === playlistName);
    
    if (playlistVideos.length === 0 || !query.trim()) {
      return [];
    }

    const playlistFuse = new Fuse(playlistVideos, {
      ...DEFAULT_SEARCH_OPTIONS,
      threshold: options?.threshold ?? DEFAULT_SEARCH_OPTIONS.threshold
    });

    const results = playlistFuse.search(query);
    const limit = options?.limit ?? 50;

    return results.slice(0, limit).map(result => ({
      item: result.item,
      score: result.score ?? 0,
      matches: result.matches
    }));
  }

  /**
   * Get all videos grouped by playlist
   */
  getVideosByPlaylist(): Record<string, Video[]> {
    const grouped: Record<string, Video[]> = {};
    
    for (const video of this.videos) {
      const playlist = video.playlist || 'Unknown';
      if (!grouped[playlist]) {
        grouped[playlist] = [];
      }
      grouped[playlist].push(video);
    }

    return grouped;
  }

  /**
   * Get all playlist names
   */
  getPlaylistNames(): string[] {
    return Array.from(this.indexedPlaylists).sort();
  }

  /**
   * Get videos from a specific playlist
   */
  getPlaylistVideos(playlistName: string): Video[] {
    return this.videos.filter(v => v.playlist === playlistName);
  }

  /**
   * Get total video count
   */
  getVideoCount(): number {
    return this.videos.length;
  }

  /**
   * Get all videos (for browsing)
   */
  getAllVideos(): Video[] {
    return [...this.videos];
  }

  /**
   * Filter videos by artist
   */
  filterByArtist(artist: string): Video[] {
    return this.videos.filter(v => 
      v.artist?.toLowerCase().includes(artist.toLowerCase())
    );
  }

  /**
   * Get unique artists
   */
  getArtists(): string[] {
    const artists = new Set<string>();
    for (const video of this.videos) {
      if (video.artist) {
        artists.add(video.artist);
      }
    }
    return Array.from(artists).sort();
  }

  /**
   * Sort videos by various criteria
   */
  sortVideos(videos: Video[], sortBy: 'title' | 'artist' | 'playlist' | 'duration', ascending = true): Video[] {
    const sorted = [...videos].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortBy) {
        case 'title':
          aVal = a.title?.toLowerCase() ?? '';
          bVal = b.title?.toLowerCase() ?? '';
          break;
        case 'artist':
          aVal = a.artist?.toLowerCase() ?? '';
          bVal = b.artist?.toLowerCase() ?? '';
          break;
        case 'playlist':
          aVal = a.playlist?.toLowerCase() ?? '';
          bVal = b.playlist?.toLowerCase() ?? '';
          break;
        case 'duration':
          aVal = a.duration ?? 0;
          bVal = b.duration ?? 0;
          break;
      }

      if (aVal < bVal) return ascending ? -1 : 1;
      if (aVal > bVal) return ascending ? 1 : -1;
      return 0;
    });

    return sorted;
  }

  /**
   * Clear the search index
   */
  clear(): void {
    this.videos = [];
    this.fuse = null;
    this.indexedPlaylists.clear();
  }
}

// Export singleton instance
export const localSearchService = new LocalSearchService();
