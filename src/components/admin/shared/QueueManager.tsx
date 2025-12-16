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
    <div className="queue-manager bg-white rounded-lg shadow p-6">
      <div className="queue-header flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Queue Management</h2>
        <button
          onClick={handleClearQueue}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
        >
          Clear Queue
        </button>
      </div>

      {/* Now Playing Section */}
      {playerState?.now_playing_video && (
        <div className="now-playing mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-lg font-medium text-blue-900 mb-2">Now Playing</h3>
          <div className="track-info">
            <div className="text-xl font-semibold text-blue-800">
              {playerState.now_playing_video.title}
            </div>
            <div className="text-blue-600">
              {playerState.now_playing_video.artist}
            </div>
          </div>
        </div>
      )}

      {/* Active Queue */}
      <div className="active-queue mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Up Next</h3>
        <div className="queue-list space-y-2">
          {playerState?.active_queue?.slice(1).map((item: any, index: number) => (
            <div key={item.id} className="queue-item flex items-center justify-between p-3 bg-gray-50 rounded border">
              <div className="flex items-center space-x-3">
                <span className="position w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-medium">
                  {index + 1}
                </span>
                <div>
                  <div className="font-medium text-gray-900">{item.title}</div>
                  <div className="text-sm text-gray-600">{item.artist}</div>
                </div>
              </div>
              <button
                onClick={() => handleSkip(index + 1)}
                className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 transition-colors"
              >
                Skip
              </button>
            </div>
          ))}
          {(!playerState?.active_queue || playerState.active_queue.length <= 1) && (
            <div className="text-center py-8 text-gray-500">
              No songs in queue
            </div>
          )}
        </div>
      </div>

      {/* Priority Queue */}
      {playerState?.priority_queue && playerState.priority_queue.length > 0 && (
        <div className="priority-queue">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Priority Queue</h3>
          <div className="priority-list space-y-2">
            {playerState?.priority_queue.map((item: any, index: number) => (
              <div key={item.id} className="priority-item flex items-center p-3 bg-yellow-50 border border-yellow-200 rounded">
                <span className="priority-badge w-8 h-8 bg-yellow-500 text-white rounded-full flex items-center justify-center text-sm font-medium mr-3">
                  P{index + 1}
                </span>
                <div>
                  <div className="font-medium text-gray-900">{item.title}</div>
                  <div className="text-sm text-gray-600">{item.artist}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
