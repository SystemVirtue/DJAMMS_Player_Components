import { insertCommand, subscribeToPlayerState, getPlayerState, getAllLocalVideos, searchLocalVideos } from '../../web/shared/supabase-client';
import type { SupabasePlayerState } from '../types/supabase';
import type { Video } from '../types';

export class UnifiedAPI {
  private isElectron: boolean;
  private playerId: string;

  constructor() {
    this.isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
    this.playerId = this.getPlayerId();
  }

  // Unified playlist loading
  async getPlaylists(): Promise<{ playlists: Record<string, Video[]>; playlistsDirectory: string }> {
    if (this.isElectron) {
      return await (window as any).electronAPI.getPlaylists();
    } else {
      return await this.getPlaylistsFromSupabase();
    }
  }

  // Unified command sending
  async sendCommand(command: string, data?: any): Promise<any> {
    if (this.isElectron) {
      return await (window as any).electronAPI.sendCommand(command, data);
    } else {
      return await insertCommand(command as any, data, 'web-admin', this.playerId);
    }
  }

  // Unified player state access
  async getPlayerState(): Promise<SupabasePlayerState | null> {
    if (this.isElectron) {
      return await (window as any).electronAPI.getPlayerState();
    } else {
      return await getPlayerState(this.playerId);
    }
  }

  // Unified real-time subscription
  subscribeToPlayerState(callback: (state: SupabasePlayerState) => void): () => void {
    if (this.isElectron) {
      const handler = (_event: any, state: SupabasePlayerState) => callback(state);
      (window as any).electronAPI.on('player-state-update', handler);
      return () => (window as any).electronAPI.off('player-state-update', handler);
    } else {
      const subscription = subscribeToPlayerState(this.playerId, callback);
      return () => subscription.unsubscribe?.() || subscription;
    }
  }

  // Search functionality
  async searchVideos(query: string): Promise<Video[]> {
    if (this.isElectron) {
      return await (window as any).electronAPI.searchVideos(query);
    } else {
      const results = await searchLocalVideos(query, this.playerId, 100);
      return results.map(video => ({
        id: video.id,
        title: video.title,
        artist: video.artist,
        src: video.path || '',
        path: video.path,
        duration: video.duration || undefined,
        playlist: (video.metadata as any)?.playlist || 'Unknown'
      }));
    }
  }

  // Helper methods
  private async getPlaylistsFromSupabase(): Promise<{ playlists: Record<string, Video[]>; playlistsDirectory: string }> {
    const videos = await getAllLocalVideos(this.playerId, null);

    const playlists: Record<string, Video[]> = {};
    videos.forEach(video => {
      const playlist = (video.metadata as any)?.playlist || 'Unknown';
      if (!playlists[playlist]) playlists[playlist] = [];

      // Convert SupabaseLocalVideo to Video format
      const videoItem: Video = {
        id: video.id,
        title: video.title,
        artist: video.artist,
        src: video.path || '',
        path: video.path,
        duration: video.duration || undefined,
        playlist: playlist
      };
      playlists[playlist].push(videoItem);
    });

    return { playlists, playlistsDirectory: '' };
  }

  private getPlayerId(): string {
    // Priority: URL param > localStorage > default
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlPlayerId = urlParams.get('playerId');
      if (urlPlayerId) return urlPlayerId;

      const storedId = localStorage.getItem('djamms_player_id');
      if (storedId) return storedId;
    }

    return 'DJAMMS_DEMO';
  }

  get isElectronMode(): boolean {
    return this.isElectron;
  }

  get currentPlayerId(): string {
    return this.playerId;
  }
}

// Export singleton
export const unifiedAPI = new UnifiedAPI();
