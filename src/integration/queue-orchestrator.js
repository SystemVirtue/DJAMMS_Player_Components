const EventEmitter = require('events');
const debug = (msg, ...args) => { try { console.log('[QueueOrchestrator]', msg, ...args); } catch (e) {} };

/**
 * QueueOrchestrator
 *
 * Lightweight stub of the Queue Orchestrator described in the manifesto.
 * Methods are documented and emit simple events so tests and early development
 * can integrate with the rest of the app.
 */
class QueueOrchestrator extends EventEmitter {
  constructor(supabaseAdapter = null, localFileManager = null, config = {}) {
    super();
    this.supabase = supabaseAdapter;
    this.localFileManager = localFileManager;
    this.config = Object.assign({ crossfadeSeconds: 3 }, config);

    // State representation (expanded)
    this.state = {
      status: 'idle', // playing|paused|stopped|idle
      nowPlaying: null,
      activeQueue: [],
      priorityQueue: [],
      volume: 1.0,
      isPlaying: false,
      isPaused: false,
      currentPosition: 0
    };
    this.supabaseAdapter = supabaseAdapter;
    this._realtimeChannel = null;
    this._adminChannel = null;
    this._priorityChannel = null;
    this.stats = { videosPlayed: 0, priorityVideosPlayed: 0, errors: 0 };
  }

  async initialize() {
    // Initialize connections, load initial state, and start heartbeat
    // If a Supabase adapter wasn't provided, try to auto-create one when env vars are present
    if (!this.supabaseAdapter) {
      try {
        // only require when needed so the module isn't mandatory in unit tests
        // eslint-disable-next-line global-require
        const SupabaseAdapter = require('./supabase-adapter');
        // adapter will be a no-op if env vars are missing
        const adapter = new SupabaseAdapter();
        if (adapter.connected()) {
          this.supabaseAdapter = adapter;
        }
      } catch (e) {
        // not fatal — continue without Supabase
      }
    }

    // Try to load initial state from Supabase if available
    try { await this.loadInitialState(); } catch (e) { /* ignore */ }

    // start lightweight heartbeat if supabase available
    this.startHeartbeat();

    // Attach realtime listeners if present
    this.setupRealtimeSubscriptions();

    this.emit('initialized', { ok: true, connected: !!this.supabaseAdapter });
  }

  async loadInitialState() {
    if (!this.supabaseAdapter) return null;
    try {
      const playerId = process.env.PLAYER_ID || 'electron-player-1';
      const row = await this.supabaseAdapter.getPlayerState(playerId);
      if (row) {
        // Safely load state with fallbacks for missing columns
        if (row.now_playing_video) this.state.nowPlaying = row.now_playing_video;
        if (row.active_queue) this.state.activeQueue = row.active_queue;
        if (row.priority_queue) this.state.priorityQueue = row.priority_queue;
        if (row.status) {
          this.state.status = row.status;
          this.state.isPlaying = row.status === 'playing';
          this.state.isPaused = row.status === 'paused';
        }
        if (row.volume !== undefined) this.state.volume = row.volume;
        
        // If we loaded a playing state with a nowPlaying video, emit play-video event
        if (row.now_playing_video && row.status === 'playing') {
          debug('Loaded playing state, emitting play-video for saved video');
          this.emit('play-video', row.now_playing_video);
        }
      }
      return row;
    } catch (err) {
      // Silently ignore schema/cache issues during development
      console.warn('[QueueOrchestrator] Failed to load initial state:', err.message);
      return null;
    }
  }

  setupRealtimeSubscriptions() {
    if (!this.supabaseAdapter) return null;
    const playerId = process.env.PLAYER_ID || 'electron-player-1';
    // subscribe for player state changes (only if adapter supports it)
    if (this.supabaseAdapter.subscribeToPlayer) this.startRealtime(playerId);
    // Try to subscribe to admin commands / priority requests when available
    try {
      if (this.supabaseAdapter.subscribeToAdminCommands) {
        this._adminChannel = this.supabaseAdapter.subscribeToAdminCommands((cmd) => this.handleAdminCommand(cmd));
      }
      if (this.supabaseAdapter.subscribeToPriorityRequests) {
        this._priorityChannel = this.supabaseAdapter.subscribeToPriorityRequests((req) => this.handleNewPriorityRequest(req));
      }
    } catch (e) {
      // ignore
    }
  }

  startHeartbeat(intervalMs = 10000) {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (!this.supabaseAdapter || !this.supabaseAdapter.upsertPlayerState) return;
    this.heartbeat = setInterval(async () => {
      try {
        const updatePromise = this.supabaseAdapter.upsertPlayerState({ player_id: process.env.PLAYER_ID || 'electron-player-1', last_heartbeat: new Date().toISOString(), is_online: true });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Heartbeat timeout')), 5000));
        await Promise.race([updatePromise, timeoutPromise]);
      } catch (e) {
        // Silently ignore heartbeat errors
      }
    }, intervalMs);
  }

  getState() {
    // resolve copy so we don't let callers mutate internal state
    return Object.assign({}, this.state, { activeQueueSize: this.state.activeQueue.length, priorityQueueSize: this.state.priorityQueue.length, stats: this.stats });
  }

  async clearQueue() {
    this.state.activeQueue = [];
    this.state.priorityQueue = [];
    this.emit('queue-updated', this.getState());
    // try to persist cleared queue to Supabase if available (best-effort, with timeout)
    try {
      if (this.supabaseAdapter && this.supabaseAdapter.upsertPlayerState) {
        const updatePromise = this.supabaseAdapter.upsertPlayerState({ player_id: process.env.PLAYER_ID || 'electron-player-1', active_queue: [], priority_queue: [] });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Queue clear timeout')), 5000));
        await Promise.race([updatePromise, timeoutPromise]);
      }
    } catch (e) {
      // Silently ignore database errors to prevent crashes
    }
    return this.state;
  }

  async addVideo(video) {
    this.state.activeQueue.push(video);
    this.emit('queue-updated', this.getState());
    // try to persist updated queue to Supabase if available (best-effort, with timeout)
    try {
      if (this.supabaseAdapter && this.supabaseAdapter.upsertPlayerState) {
        const updatePromise = this.supabaseAdapter.upsertPlayerState({ player_id: process.env.PLAYER_ID || 'electron-player-1', active_queue: this.state.activeQueue });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Queue update timeout')), 5000));
        await Promise.race([updatePromise, timeoutPromise]);
      }
    } catch (e) {
      // Silently ignore database errors to prevent crashes
    }
    return this.state;
  }

  async skip() {
    // Move to next (prioritize priorityQueue)
    const next = this.state.priorityQueue.shift() || this.state.activeQueue.shift() || null;
    this.state.nowPlaying = next;
    if (!next) {
      this.state.status = 'idle';
      this.emit('queue-empty');
    } else {
      this.state.status = 'playing';
      this.emit('play-video', this.state.nowPlaying);
      this.stats.videosPlayed += 1;
    }
    this.emit('queue-updated', this.getState());
    // update server with new now playing and queues (non-blocking, with timeout)
    try {
      if (this.supabaseAdapter && this.supabaseAdapter.upsertPlayerState) {
        const updatePromise = this.supabaseAdapter.upsertPlayerState({ player_id: process.env.PLAYER_ID || 'electron-player-1', now_playing_video: this.state.nowPlaying, active_queue: this.state.activeQueue, priority_queue: this.state.priorityQueue, status: this.state.status });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Skip update timeout')), 5000));
        await Promise.race([updatePromise, timeoutPromise]);
      }
    } catch (e) {
      // Silently ignore database errors to prevent crashes
    }
    return next;
  }

  async handleAdminCommand(command) {
    // small command handler to demonstrate behavior
    if (!command || !command.action_type) return;
    try {
      switch ((command.action_type || '').toLowerCase()) {
        case 'skip':
          await this.skip(); break;
        case 'play_pause':
        case 'play':
          if (this.state.isPlaying) await this.pause(); else await this.play(); break;
        case 'pause':
          await this.pause(); break;
        case 'stop':
          await this.stop(); break;
        case 'add_video':
          if (command.action_data) await this.addVideo(command.action_data); break;
        case 'set_volume':
          if (command.action_data && typeof command.action_data.volume !== 'undefined') await this.setVolume(command.action_data.volume); break;
        case 'load_playlist':
          // action_data: { playlist_path, replace_queue }
          if (command.action_data && command.action_data.playlist_path && this.localFileManager) {
            const playlist = await this.localFileManager.getPlaylistByPath(command.action_data.playlist_path);
            if (playlist && playlist.videos) {
              if (command.action_data.replace_queue) this.state.activeQueue = [];
              for (const v of playlist.videos) this.state.activeQueue.push(v);
              this.emit('queue-updated', this.getState());
            }
          }
          break;
        default:
          // noop for now
          break;
      }
    } catch (e) { /* ignore */ }
  }

  async addPriorityRequest(request) {
    // attempt to resolve the requested video and insert into priority queue
    try {
      let video = null;
      if (this.localFileManager) video = await this.localFileManager.resolveVideo(request.video_source || request.source);
      if (!video && request.video_source && request.video_source.startsWith('http')) video = { id: request.video_source, title: request.video_source, src: request.video_source };
      if (!video) return null;
      video.priorityRequestId = request.id || null;
      video.priority = request.priority_score || 50;
      this.state.priorityQueue.push(video);
      this.state.priorityQueue.sort((a,b) => (b.priority||0)-(a.priority||0));
      this.emit('priority-queue-updated', this.getState());
      // optionally persist priority request
      try { if (this.supabaseAdapter && this.supabaseAdapter.upsertPriorityRequest) this.supabaseAdapter.upsertPriorityRequest(request); } catch (err) {}
      return video;
    } catch (e) { return null; }
  }

  async advanceQueue() {
    debug('advanceQueue called');
    // advance to next video using priority then main queue
    if (this.isAdvancing) return;
    this.isAdvancing = true;
    try {
      const next = this.state.priorityQueue.shift() || this.state.activeQueue.shift() || null;
      debug('next video:', next?.title);
      this.state.nowPlaying = next;
      if (!next) {
        this.state.status = 'idle';
        this.emit('queue-empty');
        return null;
      }
      this.state.status = 'playing';
      this.state.isPlaying = true; this.state.isPaused = false;
      debug('emitting play-video for:', next.title);
      this.emit('play-video', next);
      this.emit('queue-updated', this.getState());
      // attempt to sync
      try {
        if (this.supabaseAdapter && this.supabaseAdapter.upsertPlayerState) {
          const updatePromise = this.supabaseAdapter.upsertPlayerState({ player_id: process.env.PLAYER_ID || 'electron-player-1', now_playing_video: next, active_queue: this.state.activeQueue, priority_queue: this.state.priorityQueue, status: this.state.status });
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Advance queue update timeout')), 5000));
          await Promise.race([updatePromise, timeoutPromise]);
        }
      } catch (e) {
        // Silently ignore database errors to prevent crashes
      }
      return next;
    } finally { this.isAdvancing = false; }
  }

  async onVideoEnded() { await this.advanceQueue(); }


  async startRealtime(playerId) {
    if (!this.supabaseAdapter || !playerId) return null;
    this._realtimeChannel = this.supabaseAdapter.subscribeToPlayer(playerId, (payload) => {
      // very small example: when player_state row updates, merge nowPlaying
      if (payload?.new) {
        try {
          const row = payload.new;
          // merge server state into local state minimally
          if (row.now_playing_video) this.state.nowPlaying = row.now_playing_video;
          if (row.active_queue) this.state.activeQueue = row.active_queue;
          this.emit('realtime:player-updated', row);
        } catch (err) { /* ignore parse issues */ }
      }
    });
    return this._realtimeChannel;
  }

  stopRealtime() {
    if (this._realtimeChannel && this.supabaseAdapter) {
      this.supabaseAdapter.unsubscribe(this._realtimeChannel);
      this._realtimeChannel = null;
    }
  }

  async play() {
    this.state.status = 'playing';
    this.state.isPlaying = true; this.state.isPaused = false;
    this.emit('play', this.getState());
    try {
      if (this.supabaseAdapter && this.supabaseAdapter.upsertPlayerState) {
        const updatePromise = this.supabaseAdapter.upsertPlayerState({ player_id: process.env.PLAYER_ID || 'electron-player-1', status: 'playing' });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Play update timeout')), 5000));
        await Promise.race([updatePromise, timeoutPromise]);
      }
    } catch (e) {
      // Silently ignore database errors to prevent crashes
    }
  }

  async pause() {
    this.state.status = 'paused';
    this.state.isPaused = true; this.state.isPlaying = false;
    this.emit('pause', this.getState());
    try {
      if (this.supabaseAdapter && this.supabaseAdapter.upsertPlayerState) {
        const updatePromise = this.supabaseAdapter.upsertPlayerState({ player_id: process.env.PLAYER_ID || 'electron-player-1', status: 'paused' });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Pause update timeout')), 5000));
        await Promise.race([updatePromise, timeoutPromise]);
      }
    } catch (e) {
      // Silently ignore database errors to prevent crashes
    }
  }

  async setVolume(v) {
    this.state.volume = Math.max(0, Math.min(1, v));
    this.emit('volume-changed', this.state.volume);
    try {
      if (this.supabaseAdapter && this.supabaseAdapter.upsertPlayerState) {
        const updatePromise = this.supabaseAdapter.upsertPlayerState({ player_id: process.env.PLAYER_ID || 'electron-player-1', volume: this.state.volume });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Volume update timeout')), 5000));
        await Promise.race([updatePromise, timeoutPromise]);
      }
    } catch (e) {
      // Silently ignore database errors to prevent crashes
    }
    return this.state.volume;
  }

  async stop() {
    this.state.isPlaying = false; this.state.isPaused = false; this.state.nowPlaying = null; this.state.currentPosition = 0; this.state.status = 'stopped';
    this.emit('stop', this.getState());
    try {
      if (this.supabaseAdapter && this.supabaseAdapter.upsertPlayerState) {
        const updatePromise = this.supabaseAdapter.upsertPlayerState({ player_id: process.env.PLAYER_ID || 'electron-player-1', status: 'stopped', now_playing_video: null });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Stop update timeout')), 5000));
        await Promise.race([updatePromise, timeoutPromise]);
      }
    } catch (e) {
      // Silently ignore database errors to prevent crashes
    }
  }

  async handleNewPriorityRequest(req) {
    try {
      const added = await this.addPriorityRequest(req);
      // If nothing is currently playing, begin playback
      if (!this.state.nowPlaying) await this.advanceQueue();
      return added;
    } catch (e) { return null; }
  }

  // Expand with additional methods from the manifesto as needed.
}

module.exports = QueueOrchestrator;
