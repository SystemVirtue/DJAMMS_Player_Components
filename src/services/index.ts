// src/services/index.ts
export { LocalSearchService, localSearchService } from './LocalSearchService';
export type { SearchResult, SearchOptions } from './LocalSearchService';

export { YouTubeSearchService, youtubeSearchService } from './YouTubeSearchService';
export type { YouTubeVideo, YouTubeSearchResult, YouTubeSearchOptions } from './YouTubeSearchService';

// Supabase integration service
export { SupabaseService, getSupabaseService } from './SupabaseService';
export type { CommandHandler } from './SupabaseService';

// Queue management service
export { QueueService, getQueueService } from './QueueService';
export type { QueueState, RotateResult } from './QueueService';
