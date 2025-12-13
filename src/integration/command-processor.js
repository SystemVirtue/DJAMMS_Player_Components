/**
 * Command Processor
 * Handles admin commands from web interfaces and translates them to orchestrator actions
 * src/integration/command-processor.js
 */

const EventEmitter = require('events');

class CommandProcessor extends EventEmitter {
  constructor(orchestrator, supabaseAdapter = null) {
    super();
    this.orchestrator = orchestrator;
    this.supabase = supabaseAdapter;
    this.commandHistory = [];
    this.maxHistorySize = 100;
    this.isProcessing = false;
    this.commandQueue = [];
  }

  /**
   * Initialize the command processor
   * Sets up real-time subscription for admin commands
   */
  async initialize() {
    if (this.supabase && this.supabase.connected()) {
      // Subscribe to admin commands from Supabase
      this.setupRealtimeSubscription();
    }
    this.emit('initialized');
    return true;
  }

  /**
   * Setup real-time subscription for admin commands
   */
  setupRealtimeSubscription() {
    if (!this.supabase || !this.supabase.client) return;

    const playerId = process.env.PLAYER_ID || 'electron-player-1';
    
    try {
      const channel = this.supabase.client.channel('admin-commands')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'admin_commands',
          filter: `player_id=eq.${playerId}`
        }, (payload) => {
          if (payload.new && payload.new.status === 'pending') {
            this.queueCommand(payload.new);
          }
        });

      channel.subscribe();
      console.log('[CommandProcessor] Subscribed to admin commands');
    } catch (error) {
      console.warn('[CommandProcessor] Failed to subscribe to admin commands:', error.message);
    }
  }

  /**
   * Queue a command for processing
   */
  queueCommand(command) {
    this.commandQueue.push(command);
    this.processNextCommand();
  }

  /**
   * Process the next command in the queue
   */
  async processNextCommand() {
    if (this.isProcessing || this.commandQueue.length === 0) return;

    this.isProcessing = true;
    const command = this.commandQueue.shift();

    try {
      await this.processCommand(command);
    } catch (error) {
      console.error('[CommandProcessor] Error processing command:', error);
      this.emit('command-error', { command, error });
    } finally {
      this.isProcessing = false;
      // Process next command if any
      if (this.commandQueue.length > 0) {
        setImmediate(() => this.processNextCommand());
      }
    }
  }

  /**
   * Process a single admin command
   */
  async processCommand(command) {
    const startTime = Date.now();
    
    console.log('[CommandProcessor] Processing command:', command.action_type);
    this.emit('command-started', command);

    // Update command status to processing
    if (this.supabase && command.id) {
      await this.updateCommandStatus(command.id, 'processing');
    }

    let result;
    let success = true;
    let errorMessage = null;

    try {
      switch (command.action_type) {
        case 'skip':
          result = await this.handleSkip();
          break;

        case 'play':
        case 'resume':
          result = await this.handlePlay();
          break;

        case 'pause':
          result = await this.handlePause();
          break;

        case 'play_pause':
        case 'toggle':
          result = await this.handlePlayPause();
          break;

        case 'stop':
          result = await this.handleStop();
          break;

        case 'set_volume':
          result = await this.handleSetVolume(command.action_data);
          break;

        case 'seek_to':
          result = await this.handleSeekTo(command.action_data);
          break;

        case 'load_playlist':
          result = await this.handleLoadPlaylist(command.action_data);
          break;

        case 'add_video':
          result = await this.handleAddVideo(command.action_data);
          break;

        case 'remove_video':
          result = await this.handleRemoveVideo(command.action_data);
          break;

        case 'reorder_queue':
          result = await this.handleReorderQueue(command.action_data);
          break;

        case 'shuffle_queue':
          result = await this.handleShuffleQueue();
          break;

        case 'clear_queue':
          result = await this.handleClearQueue();
          break;

        case 'add_priority':
          result = await this.handleAddPriority(command.action_data);
          break;

        default:
          throw new Error(`Unknown command type: ${command.action_type}`);
      }
    } catch (error) {
      success = false;
      errorMessage = error.message;
      console.error('[CommandProcessor] Command failed:', error);
    }

    const duration = Date.now() - startTime;

    // Update command status
    if (this.supabase && command.id) {
      await this.updateCommandStatus(
        command.id,
        success ? 'completed' : 'failed',
        { result, error: errorMessage, duration }
      );
    }

    // Add to history
    this.addToHistory({
      ...command,
      status: success ? 'completed' : 'failed',
      result,
      error: errorMessage,
      duration,
      processedAt: new Date().toISOString()
    });

    this.emit('command-completed', {
      command,
      success,
      result,
      error: errorMessage,
      duration
    });

    return { success, result, error: errorMessage };
  }

  // Command Handlers (detailed implementations)

  async handleSkip() {
    if (!this.orchestrator) throw new Error('Orchestrator not available');
    return await this.orchestrator.skip();
  }

  async handlePlay() {
    if (!this.orchestrator) throw new Error('Orchestrator not available');
    await this.orchestrator.play();
    return { status: 'playing' };
  }

  async handlePause() {
    if (!this.orchestrator) throw new Error('Orchestrator not available');
    await this.orchestrator.pause();
    return { status: 'paused' };
  }

  async handlePlayPause() {
    if (!this.orchestrator) throw new Error('Orchestrator not available');
    const state = this.orchestrator.getState();
    if (state.isPlaying) {
      await this.orchestrator.pause();
      return { status: 'paused' };
    } else {
      await this.orchestrator.play();
      return { status: 'playing' };
    }
  }

  async handleStop() {
    if (!this.orchestrator) throw new Error('Orchestrator not available');
    await this.orchestrator.stop();
    return { status: 'stopped' };
  }

  async handleSetVolume(data) {
    if (!this.orchestrator) throw new Error('Orchestrator not available');
    if (!data || typeof data.volume === 'undefined') {
      throw new Error('Volume value required');
    }
    const volume = Math.max(0, Math.min(1, parseFloat(data.volume)));
    await this.orchestrator.setVolume(volume);
    return { volume };
  }

  async handleSeekTo(data) {
    if (!data || typeof data.position === 'undefined') {
      throw new Error('Position value required');
    }
    // Emit seek event for renderer to handle
    this.emit('seek', { position: data.position });
    return { position: data.position };
  }

  async handleLoadPlaylist(data) {
    if (!this.orchestrator) throw new Error('Orchestrator not available');
    if (!data || !data.playlist_path) {
      throw new Error('Playlist path required');
    }

    // Use orchestrator's handleAdminCommand for playlist loading
    await this.orchestrator.handleAdminCommand({
      action_type: 'load_playlist',
      action_data: data
    });

    return { loaded: true, path: data.playlist_path };
  }

  async handleAddVideo(data) {
    if (!this.orchestrator) throw new Error('Orchestrator not available');
    if (!data) throw new Error('Video data required');

    await this.orchestrator.addVideo(data);
    return { added: true, video: data };
  }

  async handleRemoveVideo(data) {
    if (!this.orchestrator) throw new Error('Orchestrator not available');
    if (!data || !data.video_id) {
      throw new Error('Video ID required');
    }

    const state = this.orchestrator.getState();
    const index = state.activeQueue.findIndex(v => v.id === data.video_id);
    
    if (index === -1) {
      throw new Error('Video not found in queue');
    }

    state.activeQueue.splice(index, 1);
    this.orchestrator.emit('queue-updated', this.orchestrator.getState());
    
    return { removed: true, video_id: data.video_id };
  }

  async handleReorderQueue(data) {
    if (!this.orchestrator) throw new Error('Orchestrator not available');
    if (!data || !Array.isArray(data.order)) {
      throw new Error('Order array required');
    }

    const state = this.orchestrator.getState();
    const newQueue = [];
    
    for (const id of data.order) {
      const video = state.activeQueue.find(v => v.id === id);
      if (video) newQueue.push(video);
    }

    // Add any videos not in the order array at the end
    for (const video of state.activeQueue) {
      if (!newQueue.find(v => v.id === video.id)) {
        newQueue.push(video);
      }
    }

    state.activeQueue = newQueue;
    this.orchestrator.emit('queue-updated', this.orchestrator.getState());
    
    return { reordered: true };
  }

  async handleShuffleQueue() {
    if (!this.orchestrator) throw new Error('Orchestrator not available');
    
    const state = this.orchestrator.getState();
    
    // Fisher-Yates shuffle
    for (let i = state.activeQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.activeQueue[i], state.activeQueue[j]] = [state.activeQueue[j], state.activeQueue[i]];
    }

    this.orchestrator.emit('queue-updated', this.orchestrator.getState());
    return { shuffled: true };
  }

  async handleClearQueue() {
    if (!this.orchestrator) throw new Error('Orchestrator not available');
    
    const state = this.orchestrator.getState();
    const clearedCount = state.activeQueue.length;
    state.activeQueue = [];
    
    this.orchestrator.emit('queue-updated', this.orchestrator.getState());
    return { cleared: true, count: clearedCount };
  }

  async handleAddPriority(data) {
    if (!this.orchestrator) throw new Error('Orchestrator not available');
    if (!data) throw new Error('Priority request data required');

    const result = await this.orchestrator.addPriorityRequest(data);
    return { added: !!result, video: result };
  }

  // Helper Methods

  async updateCommandStatus(commandId, status, metadata = {}) {
    if (!this.supabase || !this.supabase.client) return;

    try {
      await this.supabase.client
        .from('admin_commands')
        .update({
          status,
          processed_at: new Date().toISOString(),
          result_data: metadata
        })
        .eq('id', commandId);
    } catch (error) {
      console.warn('[CommandProcessor] Failed to update command status:', error.message);
    }
  }

  addToHistory(command) {
    this.commandHistory.unshift(command);
    if (this.commandHistory.length > this.maxHistorySize) {
      this.commandHistory.pop();
    }
  }

  getHistory(limit = 20) {
    return this.commandHistory.slice(0, limit);
  }

  /**
   * Send a command directly (for local use)
   */
  async sendCommand(actionType, actionData = null) {
    return await this.processCommand({
      action_type: actionType,
      action_data: actionData,
      source: 'local'
    });
  }
}

module.exports = CommandProcessor;
