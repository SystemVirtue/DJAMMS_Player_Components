// src/components/tabs/QueueTab.tsx
import React from 'react';
import { Video } from '../../types';
import { cleanVideoTitle, getDisplayArtist, getPlaylistDisplayName, formatDuration } from '../../utils/playlistHelpers';

interface QueueTabProps {
  queue: Video[];
  queueIndex: number;
  priorityQueue: Video[];
  currentVideo: Video | null;
  playbackTime: number;
  playbackDuration: number;
  onQueueItemClick: (index: number) => void;
}

export const QueueTab: React.FC<QueueTabProps> = ({
  queue,
  queueIndex,
  priorityQueue,
  currentVideo,
  playbackTime,
  playbackDuration,
  onQueueItemClick
}) => {
  return (
    <div className="tab-content active">
      <div className="tab-header">
        <h1>Queue</h1>
      </div>
      <div className="table-container">
        {/* Now Playing Section */}
        {currentVideo && (
          <div className="queue-section now-playing-section">
            <div className="queue-section-header">
              <span className="material-symbols-rounded">play_circle</span>
              NOW PLAYING
            </div>
            <div className="now-playing-content">
              <div className="now-playing-info">
                <div className="now-playing-title">{cleanVideoTitle(currentVideo.title)}</div>
                <div className="now-playing-artist">{getDisplayArtist(currentVideo.artist)}</div>
                <div className="now-playing-playlist">{currentVideo.playlistDisplayName || getPlaylistDisplayName(currentVideo.playlist || '')}</div>
              </div>
              <div className="now-playing-progress">
                <span className="time-elapsed">
                  {Math.floor(playbackTime / 60)}:{String(Math.floor(playbackTime % 60)).padStart(2, '0')}
                </span>
                <div className="progress-bar-container">
                  <div 
                    className="progress-bar-fill" 
                    style={{ width: `${playbackDuration > 0 ? (playbackTime / playbackDuration) * 100 : 0}%` }}
                  />
                </div>
                <span className="time-remaining">
                  -{Math.floor((playbackDuration - playbackTime) / 60)}:{String(Math.floor((playbackDuration - playbackTime) % 60)).padStart(2, '0')}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Priority Queue Section */}
        {priorityQueue.length > 0 && (
          <div className="queue-section priority-queue-section">
            <div className="queue-section-header priority">
              <span className="material-symbols-rounded">priority_high</span>
              PRIORITY QUEUE
            </div>
            <table className="media-table">
              <tbody>
                {priorityQueue.map((track, index) => (
                  <tr
                    key={`priority-${track.id}-${index}`}
                    className="priority-item"
                  >
                    <td className="col-index">P{index + 1}</td>
                    <td className="col-title">{cleanVideoTitle(track.title)}</td>
                    <td>{getDisplayArtist(track.artist)}</td>
                    <td>{formatDuration(track.duration)}</td>
                    <td>{track.playlistDisplayName || getPlaylistDisplayName(track.playlist || '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Active Queue Section */}
        <div className="queue-section active-queue-section">
          <div className="queue-section-header">
            <span className="material-symbols-rounded">queue_music</span>
            UP NEXT
          </div>
          <table className="media-table">
            <thead>
              <tr>
                <th className="col-index">#</th>
                <th className="col-title">Title</th>
                <th className="col-artist">Artist</th>
                <th className="col-duration">Duration</th>
                <th className="col-playlist">Playlist</th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 ? (
                <tr className="empty-state">
                  <td colSpan={5}>Queue is empty. Add tracks from Search.</td>
                </tr>
              ) : (() => {
                const upNextVideos = queue.slice(queueIndex + 1).map((track, idx) => ({
                  track,
                  originalIndex: queueIndex + 1 + idx,
                  isUpNext: true
                }));
                const alreadyPlayedVideos = queue.slice(0, queueIndex).map((track, idx) => ({
                  track,
                  originalIndex: idx,
                  isUpNext: false
                }));
                const reorderedQueue = [...upNextVideos, ...alreadyPlayedVideos];
                
                if (reorderedQueue.length === 0) {
                  return (
                    <tr className="empty-state">
                      <td colSpan={5}>No more tracks in queue.</td>
                    </tr>
                  );
                }
                
                return reorderedQueue.map(({ track, originalIndex, isUpNext }, displayIndex) => (
                  <tr
                    key={`queue-${track.id}-${originalIndex}`}
                    className={!isUpNext ? 'played' : ''}
                    onClick={() => onQueueItemClick(originalIndex)}
                  >
                    <td>{displayIndex + 1}</td>
                    <td className="col-title">{cleanVideoTitle(track.title)}</td>
                    <td>{getDisplayArtist(track.artist)}</td>
                    <td>{formatDuration(track.duration)}</td>
                    <td>{track.playlistDisplayName || getPlaylistDisplayName(track.playlist || '')}</td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

