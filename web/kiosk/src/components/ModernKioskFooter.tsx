/**
 * ModernKioskFooter.tsx - Footer with persistent controls
 * 1280w x 150h with Back, Home, Volume, Help
 */

import React, { useState } from 'react';
import { ArrowLeft, Home, Volume2, HelpCircle, X } from 'lucide-react';
import './ModernKioskFooter.css';

interface ModernKioskFooterProps {
  onBack: () => void;
  onHome: () => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
  onHelp: () => void;
}

export const ModernKioskFooter: React.FC<ModernKioskFooterProps> = ({
  onBack,
  onHome,
  volume,
  onVolumeChange,
  onHelp
}) => {
  const [showHelpModal, setShowHelpModal] = useState(false);
  
  const handleHelp = () => {
    setShowHelpModal(true);
    onHelp();
  };
  
  return (
    <>
      <footer className="modern-kiosk-footer">
        <button className="modern-kiosk-footer-btn modern-kiosk-footer-btn-back" onClick={onBack}>
          <ArrowLeft size={32} />
          <span>Back</span>
        </button>
        
        <button className="modern-kiosk-footer-btn modern-kiosk-footer-btn-home" onClick={onHome}>
          <Home size={32} />
          <span>Home</span>
        </button>
        
        <div className="modern-kiosk-footer-volume">
          <Volume2 size={24} />
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className="modern-kiosk-volume-slider"
          />
          <span className="modern-kiosk-volume-value">{volume}%</span>
        </div>
        
        <button className="modern-kiosk-footer-btn modern-kiosk-footer-btn-help" onClick={handleHelp}>
          <HelpCircle size={32} />
          <span>Help</span>
        </button>
      </footer>
      
      {/* Help Modal */}
      {showHelpModal && (
        <div className="modern-kiosk-help-modal" onClick={() => setShowHelpModal(false)}>
          <div className="modern-kiosk-help-modal-content" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modern-kiosk-help-modal-close"
              onClick={() => setShowHelpModal(false)}
            >
              <X size={24} />
            </button>
            <h2>Help & FAQ</h2>
            <div className="modern-kiosk-help-content">
              <h3>How to Search</h3>
              <p>Tap the Search tab and use the on-screen keyboard to type artist or song names.</p>
              
              <h3>How to Queue Songs</h3>
              <p>Tap the "QUEUE" button on any song tile to add it to your queue.</p>
              
              <h3>Navigation</h3>
              <p>Use the tabs at the top to browse by Home, Search, Genres, Top Charts, or view your Queue.</p>
              
              <h3>Volume Control</h3>
              <p>Use the volume slider in the footer to adjust playback volume.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};


