require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

/**
 * SupabaseAdapter
 * A small adapter to centralize Supabase connection & common operations.
 * Reads credentials from process.env (use .env during development)
 */
class SupabaseAdapter {
  constructor({ url = process.env.SUPABASE_URL, anonKey = process.env.SUPABASE_ANON_KEY, serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY } = {}) {
    if (!url || !anonKey) {
      this.client = null;
      this._connected = false;
      return;
    }

    this.client = createClient(url, anonKey, {
      auth: { persistSession: false },
      db: {
        schema: 'public'
      },
      global: {
        headers: {
          'statement-timeout': '30000' // 30 second timeout for queries
        }
      }
    });

    // Optional: a service client using the service role key for server-only operations
    if (serviceRole) {
      this.service = createClient(url, serviceRole);
    }

    this._connected = !!this.client;
  }

  connected() { return this._connected; }

  // Fetch player state by player_id
  async getPlayerState(playerId) {
    if (!this.client) throw new Error('Supabase not configured');
    const { data, error } = await this.client
      .from('player_state')
      .select('*')
      .eq('player_id', playerId)
      .limit(1)
      .single();
    if (error) throw error;
    return data;
  }

  // Upsert state (convenience)
  async upsertPlayerState(state) {
    if (!this.client) throw new Error('Supabase not configured');
    const { data, error } = await this.client
      .from('player_state')
      .upsert(state, { onConflict: 'player_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Simple real-time subscription for player_state row updates
  subscribeToPlayer(playerId, onPayload) {
    if (!this.client || !this.client.channel) throw new Error('Realtime not available or supabase-js version mismatch');

    const channel = this.client.channel(`player_state:${playerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_state', filter: `player_id=eq.${playerId}` }, (payload) => {
        onPayload && onPayload(payload);
      });

    channel.subscribe();
    return channel;
  }

  // Unsubscribe helper
  unsubscribe(channel) {
    if (!channel) return;
    try { channel.unsubscribe(); } catch (e) { /* ignore */ }
  }

  // Video management methods
  async syncLocalVideos(playerId, videos) {
    if (!this.client) throw new Error('Supabase not configured');
    if (!Array.isArray(videos)) return;

    // Delete existing videos for this player
    await this.client
      .from('local_videos')
      .delete()
      .eq('player_id', playerId);

    // Insert new videos
    if (videos.length > 0) {
      const videoRecords = videos.map(video => ({
        player_id: playerId,
        title: video.title,
        artist: video.artist,
        path: video.path,
        duration: video.duration,
        metadata: {
          album: video.album,
          size: video.size,
          sourceType: video.sourceType
        },
        is_available: true
      }));

      const { data, error } = await this.client
        .from('local_videos')
        .insert(videoRecords);

      if (error) throw error;
      return data;
    }

    return [];
  }

  async getLocalVideos(playerId) {
    if (!this.client) throw new Error('Supabase not configured');
    const { data, error } = await this.client
      .from('local_videos')
      .select('*')
      .eq('player_id', playerId)
      .eq('is_available', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async searchVideos(playerId, query, limit = 50) {
    if (!this.client) throw new Error('Supabase not configured');
    const { data, error } = await this.client
      .from('local_videos')
      .select('*')
      .eq('player_id', playerId)
      .eq('is_available', true)
      .or(`title.ilike.%${query}%,artist.ilike.%${query}%`)
      .limit(limit);

    if (error) throw error;
    return data;
  }
}

module.exports = SupabaseAdapter;
