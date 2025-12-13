/**
 * ModernQueueView.tsx - Queue tab with editable list
 */

import React from 'react';
import type { QueueVideoItem } from '@shared/types';
import { getThumbnailUrl } from '../utils/thumbnailUtils';
import { GripVertical, X } from 'lucide-react';
import './ModernQueueView.css';

interface ModernQueueViewProps {
  queue: QueueVideoItem[];
  thumbnailsPath: string;
  onRemove?: (index: number) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

export const ModernQueueView: React.FC<ModernQueueViewProps> = ({
  queue,
  thumbnailsPath,
  onRemove,
  onReorder
}) => {
  return (
    <div className="modern-queue-view">
      <div className="modern-queue-header">
        <h2 className="modern-queue-title">Your Queue</h2>
        <div className="modern-queue-count">{queue.length} song{queue.length !== 1 ? 's' : ''}</div>
      </div>
      
      {queue.length === 0 ? (
        <div className="modern-queue-empty">
          <p>Your queue is empty</p>
          <p className="modern-queue-empty-hint">Add songs from Search, Home, or Top Charts</p>
        </div>
      ) : (
        <div className="modern-queue-list">
          {queue.map((item, index) => {
            const thumb = getThumbnailUrl(item, thumbnailsPath);
            return (
              <div key={`${item.id}-${index}`} className="modern-queue-item">
                <div className="modern-queue-item-drag">
                  <GripVertical size={24} />
                </div>
                <div className="modern-queue-item-rank">{index + 1}</div>
                {thumb && (
                  <img
                    src={thumb}
                    alt=""
                    className="modern-queue-item-art"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
                <div className="modern-queue-item-info">
                  <div className="modern-queue-item-title">{item.title}</div>
                  {item.artist && (
                    <div className="modern-queue-item-artist">{item.artist}</div>
                  )}
                </div>
                {onRemove && (
                  <button
                    className="modern-queue-item-remove"
                    onClick={() => onRemove(index)}
                  >
                    <X size={24} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};


