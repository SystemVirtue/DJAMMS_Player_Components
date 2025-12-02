// src/services/YouTubeSearchService.ts
import axios from 'axios';

export interface YouTubeVideo {
  id: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  duration?: string;
  viewCount?: string;
  publishedAt: string;
  description?: string;
}

export interface YouTubeSearchResult {
  videos: YouTubeVideo[];
  nextPageToken?: string;
  totalResults: number;
}

export interface YouTubeSearchOptions {
  maxResults?: number;
  pageToken?: string;
  order?: 'relevance' | 'date' | 'viewCount' | 'rating';
  videoDuration?: 'any' | 'short' | 'medium' | 'long';
  type?: 'video' | 'channel' | 'playlist';
}

const DEFAULT_MAX_RESULTS = 25;

export class YouTubeSearchService {
  private apiKey: string | null = null;
  private baseUrl = 'https://www.googleapis.com/youtube/v3';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || null;
  }

  /**
   * Set the YouTube API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  /**
   * Search YouTube for videos
   */
  async search(query: string, options?: YouTubeSearchOptions): Promise<YouTubeSearchResult> {
    if (!this.apiKey) {
      console.warn('[YouTubeSearchService] API key not configured');
      return { videos: [], totalResults: 0 };
    }

    try {
      const searchResponse = await axios.get(`${this.baseUrl}/search`, {
        params: {
          part: 'snippet',
          q: query,
          type: options?.type || 'video',
          maxResults: options?.maxResults || DEFAULT_MAX_RESULTS,
          pageToken: options?.pageToken,
          order: options?.order || 'relevance',
          videoDuration: options?.videoDuration,
          key: this.apiKey
        }
      });

      const videoIds = searchResponse.data.items
        .filter((item: any) => item.id?.videoId)
        .map((item: any) => item.id.videoId)
        .join(',');

      // Get video details (duration, view count) if we have video IDs
      let videoDetails: Record<string, any> = {};
      if (videoIds) {
        const detailsResponse = await axios.get(`${this.baseUrl}/videos`, {
          params: {
            part: 'contentDetails,statistics',
            id: videoIds,
            key: this.apiKey
          }
        });

        for (const item of detailsResponse.data.items) {
          videoDetails[item.id] = {
            duration: this.formatDuration(item.contentDetails?.duration),
            viewCount: this.formatViewCount(item.statistics?.viewCount)
          };
        }
      }

      const videos: YouTubeVideo[] = searchResponse.data.items
        .filter((item: any) => item.id?.videoId)
        .map((item: any) => ({
          id: item.id.videoId,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          thumbnailUrl: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
          duration: videoDetails[item.id.videoId]?.duration,
          viewCount: videoDetails[item.id.videoId]?.viewCount,
          publishedAt: item.snippet.publishedAt,
          description: item.snippet.description
        }));

      return {
        videos,
        nextPageToken: searchResponse.data.nextPageToken,
        totalResults: searchResponse.data.pageInfo?.totalResults || videos.length
      };
    } catch (error: any) {
      console.error('[YouTubeSearchService] Search error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error?.message || 'YouTube search failed');
    }
  }

  /**
   * Get video details by ID
   */
  async getVideoDetails(videoId: string): Promise<YouTubeVideo | null> {
    if (!this.apiKey) {
      console.warn('[YouTubeSearchService] API key not configured');
      return null;
    }

    try {
      const response = await axios.get(`${this.baseUrl}/videos`, {
        params: {
          part: 'snippet,contentDetails,statistics',
          id: videoId,
          key: this.apiKey
        }
      });

      const item = response.data.items?.[0];
      if (!item) return null;

      return {
        id: item.id,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnailUrl: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
        duration: this.formatDuration(item.contentDetails?.duration),
        viewCount: this.formatViewCount(item.statistics?.viewCount),
        publishedAt: item.snippet.publishedAt,
        description: item.snippet.description
      };
    } catch (error: any) {
      console.error('[YouTubeSearchService] Get video details error:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Get trending music videos
   */
  async getTrendingMusic(regionCode = 'US', maxResults = 25): Promise<YouTubeVideo[]> {
    if (!this.apiKey) {
      console.warn('[YouTubeSearchService] API key not configured');
      return [];
    }

    try {
      const response = await axios.get(`${this.baseUrl}/videos`, {
        params: {
          part: 'snippet,contentDetails,statistics',
          chart: 'mostPopular',
          videoCategoryId: '10', // Music category
          regionCode,
          maxResults,
          key: this.apiKey
        }
      });

      return response.data.items.map((item: any) => ({
        id: item.id,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnailUrl: item.snippet.thumbnails?.medium?.url,
        duration: this.formatDuration(item.contentDetails?.duration),
        viewCount: this.formatViewCount(item.statistics?.viewCount),
        publishedAt: item.snippet.publishedAt,
        description: item.snippet.description
      }));
    } catch (error: any) {
      console.error('[YouTubeSearchService] Get trending error:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Format ISO 8601 duration to human readable
   */
  private formatDuration(isoDuration: string | undefined): string {
    if (!isoDuration) return '';

    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '';

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Format view count to human readable
   */
  private formatViewCount(count: string | undefined): string {
    if (!count) return '';

    const num = parseInt(count, 10);
    if (num >= 1000000000) {
      return `${(num / 1000000000).toFixed(1)}B views`;
    }
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M views`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K views`;
    }
    return `${num} views`;
  }

  /**
   * Parse YouTube URL to extract video ID
   */
  static parseVideoUrl(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  /**
   * Build YouTube embed URL
   */
  static getEmbedUrl(videoId: string, autoplay = false): string {
    return `https://www.youtube.com/embed/${videoId}?autoplay=${autoplay ? 1 : 0}&rel=0`;
  }

  /**
   * Build YouTube watch URL
   */
  static getWatchUrl(videoId: string): string {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }
}

// Export singleton instance (API key should be set by app)
export const youtubeSearchService = new YouTubeSearchService();
