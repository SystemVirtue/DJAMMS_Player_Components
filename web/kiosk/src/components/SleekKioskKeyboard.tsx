/**
 * SleekKioskKeyboard.tsx - Alphanumeric keyboard footer
 * 1280w x 192h matching wireframe design
 */

import React from 'react';
import './SleekKioskKeyboard.css';

interface SleekKioskKeyboardProps {
  onKeyPress: (key: string) => void;
  onBackspace?: () => void;
  onClear?: () => void;
  showNumbers?: boolean;
}

const ALPHABET_ROW_1 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
const ALPHABET_ROW_2 = ['N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

export const SleekKioskKeyboard: React.FC<SleekKioskKeyboardProps> = ({
  onKeyPress,
  onBackspace,
  onClear,
  showNumbers = false
}) => {
  return (
    <footer className="sleek-kiosk-keyboard">
      {showNumbers && (
        <div className="sleek-kiosk-keyboard-row">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(key => (
            <button
              key={key}
              className="sleek-kiosk-key"
              onClick={() => onKeyPress(key)}
            >
              {key}
            </button>
          ))}
        </div>
      )}
      
      <div className="sleek-kiosk-keyboard-row">
        {ALPHABET_ROW_1.map(key => (
          <button
            key={key}
            className="sleek-kiosk-key"
            onClick={() => onKeyPress(key)}
          >
            {key}
          </button>
        ))}
        {onClear && (
          <button
            className="sleek-kiosk-key sleek-kiosk-key-special"
            onClick={onClear}
          >
            #
          </button>
        )}
      </div>
      
      <div className="sleek-kiosk-keyboard-row">
        {ALPHABET_ROW_2.map(key => (
          <button
            key={key}
            className="sleek-kiosk-key"
            onClick={() => onKeyPress(key)}
          >
            {key}
          </button>
        ))}
        {onBackspace && (
          <button
            className="sleek-kiosk-key sleek-kiosk-key-special"
            onClick={onBackspace}
          >
            ⌫
          </button>
        )}
      </div>
    </footer>
  );
};

