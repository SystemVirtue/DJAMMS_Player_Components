/**
 * ModernGenresView.tsx - Genres tab with large category tiles
 * 3x3 grid of colorful genre icons
 */

import React from 'react';
import type { SupabaseLocalVideo } from '@shared/types';
import './ModernGenresView.css';

interface ModernGenresViewProps {
  videos: SupabaseLocalVideo[];
  onGenreSelect: (genre: string) => void;
}

const GENRES = [
  { name: 'Rock', icon: '🎸', color: '#FF3333' },
  { name: 'Pop', icon: '🎤', color: '#FF6B9D' },
  { name: 'Hip Hop', icon: '🎧', color: '#1DB954' },
  { name: 'Country', icon: '🤠', color: '#FFA500' },
  { name: 'Electronic', icon: '🎹', color: '#00D9FF' },
  { name: 'Jazz', icon: '🎺', color: '#9B59B6' },
  { name: 'R&B', icon: '🎵', color: '#E74C3C' },
  { name: 'Classical', icon: '🎻', color: '#3498DB' },
  { name: 'Karaoke', icon: '🎙️', color: '#FFD700' },
];

export const ModernGenresView: React.FC<ModernGenresViewProps> = ({
  onGenreSelect
}) => {
  return (
    <div className="modern-genres-view">
      <h2 className="modern-genres-title">Browse by Genre</h2>
      <div className="modern-genres-grid">
        {GENRES.map((genre) => (
          <button
            key={genre.name}
            className="modern-genre-tile"
            onClick={() => onGenreSelect(genre.name)}
            style={{ '--genre-color': genre.color } as React.CSSProperties}
          >
            <div className="modern-genre-icon">{genre.icon}</div>
            <div className="modern-genre-name">{genre.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
};


