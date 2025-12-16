import React, { useState } from 'react';
import { cleanVideoTitle, getDisplayArtist, getPlaylistDisplayName, formatDuration } from '../../../utils/playlistHelpers';
import type { SupabasePlayerState, QueueVideoItem } from '../../../types/supabase';

interface QueueManagerProps {
  playerState: SupabasePlayerState | null;
  onCommand: (command: string, data?: any) => Promise<void>;
}

interface QueueVideoToPlay {
  video: QueueVideoItem;
  index: number;
}

export const QueueManager: React.FC<QueueManagerProps> = ({
  playerState,
  onCommand
}) => {
  const [queueVideoToPlay, setQueueVideoToPlay] = useState<QueueVideoToPlay | null>(null);
  const [showQueuePlayDialog, setShowQueuePlayDialog] = useState(false);

  const handleClearQueue = async () => {
    await onCommand('queue_clear');
  };

  const handleQueueItemClick = (index: number) => {
    if (playerState?.active_queue && playerState.active_queue[index]) {
      setQueueVideoToPlay({ video: playerState.active_queue[index], index });
      setShowQueuePlayDialog(true);
    }
  };

  const handlePlayNow = async () => {
    if (queueVideoToPlay) {
      await onCommand('play', { video: queueVideoToPlay.video, queueIndex: queueVideoToPlay.index });
      setShowQueuePlayDialog(false);
      setQueueVideoToPlay(null);
    }
  };

  const handlePlayNext = async () => {
    if (queueVideoToPlay && playerState) {
      // Move the video to index position 1 (after current which is index 0)
      await onCommand('queue_move', { 
        fromIndex: queueVideoToPlay.index, 
        toIndex: 1 
      });
      setShowQueuePlayDialog(false);
      setQueueVideoToPlay(null);
    }
  };

  const handleDelete = async () => {
    if (queueVideoToPlay) {
      await onCommand('queue_remove', { 
        videoId: queueVideoToPlay.video.id,
        queueType: 'active'
      });
      setShowQueuePlayDialog(false);
      setQueueVideoToPlay(null);
    }
  };

  // Get the queue index from player state (defaults to 0)
  const queueIndex = playerState?.queue_index ?? 0;
  
  // Get "Up Next" videos (after current index) and already played videos
  const upNextVideos = playerState?.active_queue 
    ? playerState.active_queue.slice(queueIndex + 1).map((track, idx) => ({
        track,
        originalIndex: queueIndex + 1 + idx,
        isUpNext: true
      }))
    : [];
  
  const alreadyPlayedVideos = playerState?.active_queue 
    ? playerState.active_queue.slice(0, queueIndex).map((track, idx) => ({
        track,
        originalIndex: idx,
        isUpNext: false
      }))
    : [];
  
  const reorderedQueue = [...upNextVideos, ...alreadyPlayedVideos];

  return (
    <div className="queue-manager bg-ytm-surface rounded-lg shadow p-6">
      <div className="queue-header flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-ytm-text">Queue Management</h2>
        <button
          onClick={handleClearQueue}
          className="px-4 py-2 bg-red-600 text-ytm-text rounded hover:bg-red-700 transition-colors"
        >
          Clear Queue
        </button>
      </div>

      {/* Now Playing Section */}
      {playerState?.now_playing_video && (
        <div className="now-playing mb-6 p-4 bg-ytm-surface-hover border border-ytm-divider rounded-lg">
          <div className="flex items-center space-x-2 mb-2">
            <span className="material-symbols-rounded text-ytm-accent">play_circle</span>
            <h3 className="text-lg font-medium text-ytm-text">NOW PLAYING</h3>
          </div>
          <div className="track-info">
            <div className="text-xl font-semibold text-ytm-text">
              {cleanVideoTitle(playerState.now_playing_video.title)}
            </div>
            <div className="text-ytm-text-secondary">
              {getDisplayArtist(playerState.now_playing_video.artist)}
            </div>
            {(playerState.now_playing_video as any).playlistDisplayName && (
              <div className="text-sm text-ytm-text-secondary mt-1">
                {(playerState.now_playing_video as any).playlistDisplayName}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Priority Queue Section */}
      {playerState?.priority_queue && playerState.priority_queue.length > 0 && (
        <div className="priority-queue mb-6">
          <div className="flex items-center space-x-2 mb-4">
            <span className="material-symbols-rounded text-red-400">priority_high</span>
            <h3 className="text-lg font-medium text-ytm-text">PRIORITY QUEUE</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: '600px' }}>
              <tbody>
                {playerState.priority_queue.map((item, index) => (
                  <tr
                    key={`priority-${item.id}-${index}`}
                    className="border-b border-red-500/30 bg-red-500/10"
                  >
                    <td className="py-3 px-4 text-sm font-medium text-red-400" style={{ width: '60px' }}>P{index + 1}</td>
                    <td className="py-3 px-4 text-sm font-medium text-ytm-text">{cleanVideoTitle(item.title)}</td>
                    <td className="py-3 px-4 text-sm text-ytm-text-secondary">{getDisplayArtist(item.artist)}</td>
                    <td className="py-3 px-4 text-sm text-ytm-text-secondary" style={{ width: '80px' }}>{formatDuration(item.duration)}</td>
                    <td className="py-3 px-4 text-sm text-ytm-text-secondary">
                      {item.playlistDisplayName || (item.playlist ? getPlaylistDisplayName(item.playlist) : '')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Active Queue Section */}
      <div className="active-queue">
        <div className="flex items-center space-x-2 mb-4">
          <span className="material-symbols-rounded text-ytm-accent">queue_music</span>
          <h3 className="text-lg font-medium text-ytm-text">UP NEXT</h3>
        </div>
        {reorderedQueue.length === 0 ? (
          <div className="empty-queue text-center py-12">
            <div className="text-ytm-text-secondary">
              <div className="text-4xl mb-4">🎵</div>
              <h3 className="text-lg font-medium text-ytm-text mb-2">Queue is Empty</h3>
              <p className="text-sm">Add some music to get started!</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: '600px' }}>
              <thead>
                <tr className="border-b border-ytm-divider">
                  <th className="text-left py-3 px-4 text-sm font-medium text-ytm-text-secondary" style={{ width: '60px' }}>#</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-ytm-text-secondary">Title</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-ytm-text-secondary">Artist</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-ytm-text-secondary" style={{ width: '80px' }}>Duration</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-ytm-text-secondary">Playlist</th>
                </tr>
              </thead>
              <tbody>
                {reorderedQueue.map(({ track, originalIndex, isUpNext }, displayIndex) => (
                  <tr
                    key={`queue-${track.id}-${originalIndex}`}
                    className={`border-b border-ytm-divider hover:bg-ytm-surface-hover transition-colors cursor-pointer ${
                      !isUpNext ? 'opacity-60' : ''
                    }`}
                    onClick={() => handleQueueItemClick(originalIndex)}
                  >
                    <td className="py-3 px-4 text-sm text-ytm-text-secondary">{displayIndex + 1}</td>
                    <td className="py-3 px-4 text-sm font-medium text-ytm-text">{cleanVideoTitle(track.title)}</td>
                    <td className="py-3 px-4 text-sm text-ytm-text-secondary">{getDisplayArtist(track.artist)}</td>
                    <td className="py-3 px-4 text-sm text-ytm-text-secondary">{formatDuration(track.duration)}</td>
                    <td className="py-3 px-4 text-sm text-ytm-text-secondary">
                      {track.playlistDisplayName || (track.playlist ? getPlaylistDisplayName(track.playlist) : '')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Queue Play Confirmation Dialog */}
      {showQueuePlayDialog && queueVideoToPlay && (
        <div 
          className="dialog-overlay" 
          onClick={() => { setShowQueuePlayDialog(false); setQueueVideoToPlay(null); }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div 
            className="dialog-box" 
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--ytm-surface)',
              borderRadius: '8px',
              padding: '24px',
              minWidth: '400px',
              maxWidth: '500px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
            }}
          >
            <h3 style={{ 
              marginBottom: '20px', 
              fontSize: '18px', 
              fontWeight: 'bold',
              color: 'var(--ytm-text)'
            }}>
              {cleanVideoTitle(queueVideoToPlay.video.title)}
              {queueVideoToPlay.video.artist ? ` - ${getDisplayArtist(queueVideoToPlay.video.artist)}` : ''}
            </h3>
            <div className="dialog-actions" style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: '12px' 
            }}>
              <button 
                className="dialog-btn dialog-btn-primary" 
                onClick={handlePlayNow}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                ▶ PLAY NOW
              </button>
              <button 
                className="dialog-btn dialog-btn-secondary" 
                onClick={handlePlayNext}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                ⏭ PLAY NEXT
              </button>
              <button 
                className="dialog-btn dialog-btn-danger" 
                onClick={handleDelete}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                ✕ DELETE
              </button>
              <button 
                onClick={() => { setShowQueuePlayDialog(false); setQueueVideoToPlay(null); }}
                style={{
                  padding: '10px 16px',
                  backgroundColor: 'transparent',
                  color: 'var(--ytm-text-secondary)',
                  border: '1px solid var(--ytm-divider)',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};