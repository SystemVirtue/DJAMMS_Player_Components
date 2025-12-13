/**
 * SearchKeyboardModal.tsx - Modal on-screen keyboard
 * Only appears when search input is focused
 */

import React from 'react';
import { Delete, X } from 'lucide-react';
import './SearchKeyboardModal.css';

interface SearchKeyboardModalProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onClose: () => void;
}

const KEYBOARD_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

export const SearchKeyboardModal: React.FC<SearchKeyboardModalProps> = ({
  onKeyPress,
  onBackspace,
  onClear,
  onClose
}) => {
  return (
    <div className="search-keyboard-modal" onClick={onClose}>
      <div className="search-keyboard-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button className="search-keyboard-modal-close" onClick={onClose}>
          <X size={32} />
        </button>
        
        {/* Keyboard */}
        <div className="search-keyboard-modal-keyboard">
          {KEYBOARD_ROWS.map((row, rowIndex) => (
            <div key={rowIndex} className="search-keyboard-modal-row">
              {/* Clear button on left of bottom row */}
              {rowIndex === 3 && (
                <button
                  className="search-keyboard-modal-key search-keyboard-modal-key-clear"
                  onClick={onClear}
                >
                  CLR
                </button>
              )}
              
              {row.map((key) => (
                <button
                  key={key}
                  className="search-keyboard-modal-key"
                  onClick={() => onKeyPress(key)}
                >
                  {key}
                </button>
              ))}
              
              {/* Backspace on right of bottom row */}
              {rowIndex === 3 && (
                <button
                  className="search-keyboard-modal-key search-keyboard-modal-key-backspace"
                  onClick={onBackspace}
                >
                  <Delete size={28} />
                </button>
              )}
            </div>
          ))}
          
          {/* Space bar row */}
          <div className="search-keyboard-modal-row">
            <button
              className="search-keyboard-modal-key search-keyboard-modal-key-space"
              onClick={() => onKeyPress(' ')}
            >
              SPACE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


