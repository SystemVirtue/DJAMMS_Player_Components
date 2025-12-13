/**
 * SleekKioskNav.tsx - Navigation bar with mode selection buttons
 * 1280w x 80h with Back, Search All, Browse Artists, Browse Songs
 */

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import './SleekKioskNav.css';

export type NavMode = 'search' | 'browse-artists' | 'browse-songs';

interface SleekKioskNavProps {
  activeMode: NavMode;
  onModeChange: (mode: NavMode) => void;
  onBack: () => void;
}

export const SleekKioskNav: React.FC<SleekKioskNavProps> = ({
  activeMode,
  onModeChange,
  onBack
}) => {
  return (
    <nav className="sleek-kiosk-nav">
      <button
        className="sleek-kiosk-nav-btn sleek-kiosk-nav-btn-back"
        onClick={onBack}
      >
        <ArrowLeft size={24} />
        <span>BACK</span>
      </button>
      
      <button
        className={`sleek-kiosk-nav-btn sleek-kiosk-nav-btn-mode ${activeMode === 'search' ? 'active' : ''}`}
        onClick={() => onModeChange('search')}
      >
        SEARCH ALL
      </button>
      
      <button
        className={`sleek-kiosk-nav-btn sleek-kiosk-nav-btn-mode ${activeMode === 'browse-artists' ? 'active' : ''}`}
        onClick={() => onModeChange('browse-artists')}
      >
        BROWSE ARTISTS
      </button>
      
      <button
        className={`sleek-kiosk-nav-btn sleek-kiosk-nav-btn-mode ${activeMode === 'browse-songs' ? 'active' : ''}`}
        onClick={() => onModeChange('browse-songs')}
      >
        BROWSE SONGS
      </button>
    </nav>
  );
};

