import React from 'react';
import type { SupabasePlayerState } from '../../../types/supabase';

interface QueueManagerProps {
  playerState: SupabasePlayerState | null;
  onCommand: (command: string, data?: any) => Promise<void>;
}

export const QueueManager: React.FC<QueueManagerProps> = ({
  playerState,
  onCommand
}) => {

  const handleSkip = async (index: number) => {
    await onCommand('skip', { index });
  };

  const handleClearQueue = async () => {
    await onCommand('queue_clear');
  };

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
          <h3 className="text-lg font-medium text-ytm-text mb-2">Now Playing</h3>
          <div className="track-info">
            <div className="text-xl font-semibold text-ytm-text">
              {playerState.now_playing_video.title}
            </div>
            <div className="text-ytm-text-secondary">
              {playerState.now_playing_video.artist}
            </div>
          </div>
        </div>
      )}

      {/* Active Queue */}
      {playerState?.queue && playerState.queue.length > 0 ? (
        <div className="active-queue">
          <h3 className="text-lg font-medium text-ytm-text mb-4">Up Next</h3>
          <div className="space-y-2">
            {playerState.queue.map((item, index) => (
              <div key={index} className="queue-item flex items-center justify-between p-3 bg-ytm-surface-hover border border-ytm-divider rounded-lg">
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-medium text-ytm-text-secondary w-8">{index + 1}</span>
                  <div>
                    <div className="font-medium text-ytm-text">{item.title}</div>
                    <div className="text-sm text-ytm-text-secondary">{item.artist}</div>
                  </div>
                </div>
                <button
                  onClick={() => handleSkip(index)}
                  className="px-3 py-1 bg-ytm-accent text-ytm-text text-sm rounded hover:bg-red-600 transition-colors"
                >
                  Skip
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-queue text-center py-12">
          <div className="text-ytm-text-secondary">
            <div className="text-4xl mb-4">🎵</div>
            <h3 className="text-lg font-medium text-ytm-text mb-2">Queue is Empty</h3>
            <p className="text-sm">Add some music to get started!</p>
          </div>
        </div>
      )}
    </div>
  );
};