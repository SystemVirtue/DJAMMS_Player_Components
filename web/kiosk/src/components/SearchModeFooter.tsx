/**
 * SearchModeFooter.tsx - Footer component for Search Mode
 * Contains on-screen QWERTY keyboard and hide button
 */

import React from 'react';
import { Delete, X } from 'lucide-react';
import './SearchModeFooter.css';

interface SearchModeFooterProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onHideKeyboard: () => void;
}

const KEYBOARD_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

export const SearchModeFooter: React.FC<SearchModeFooterProps> = ({
  onKeyPress,
  onBackspace,
  onClear,
  onHideKeyboard
}) => {
  return (
    <div className="search-mode-footer">
      {/* Hide Keyboard Button */}
      <button className="search-mode-hide-btn" onClick={onHideKeyboard}>
        <X size={24} />
      </button>
      
      {/* Keyboard */}
      <div className="search-mode-keyboard">
        {KEYBOARD_ROWS.map((row, rowIndex) => (
          <div key={rowIndex} className="search-mode-keyboard-row">
            {/* Clear button on left of bottom row */}
            {rowIndex === 3 && (
              <button
                className="search-mode-key search-mode-key-clear"
                onClick={onClear}
              >
                CLR
              </button>
            )}
            
            {row.map((key) => (
              <button
                key={key}
                className="search-mode-key"
                onClick={() => onKeyPress(key)}
              >
                {key}
              </button>
            ))}
            
            {/* Backspace on right of bottom row */}
            {rowIndex === 3 && (
              <button
                className="search-mode-key search-mode-key-backspace"
                onClick={onBackspace}
              >
                <Delete size={20} />
              </button>
            )}
          </div>
        ))}
        
        {/* Space bar row */}
        <div className="search-mode-keyboard-row">
          <button
            className="search-mode-key search-mode-key-space"
            onClick={() => onKeyPress(' ')}
          >
            SPACE
          </button>
        </div>
      </div>
    </div>
  );
};


