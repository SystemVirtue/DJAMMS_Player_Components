// SearchKeyboard.tsx - On-screen QWERTY keyboard for Kiosk
// Styled with obie-v5 aesthetic

import { Delete, CornerDownLeft } from 'lucide-react';

interface SearchKeyboardProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSubmit?: () => void;
}

const KEYBOARD_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

export function SearchKeyboard({ onKeyPress, onBackspace, onClear, onSubmit }: SearchKeyboardProps) {
  return (
    <div className="flex flex-col items-center gap-2 p-4">
      {KEYBOARD_ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="flex gap-2 justify-center">
          {/* Clear button on the left of bottom row */}
          {rowIndex === 3 && (
            <button
              onClick={onClear}
              className="keyboard-key keyboard-key-wide text-sm"
              title="Clear"
            >
              CLEAR
            </button>
          )}
          
          {row.map((key) => (
            <button
              key={key}
              onClick={() => onKeyPress(key)}
              className="keyboard-key"
            >
              {key}
            </button>
          ))}
          
          {/* Backspace on the right of bottom row */}
          {rowIndex === 3 && (
            <button
              onClick={onBackspace}
              className="keyboard-key keyboard-key-wide flex items-center justify-center"
              title="Backspace"
            >
              <Delete size={24} />
            </button>
          )}
        </div>
      ))}
      
      {/* Space bar and submit row */}
      <div className="flex gap-2 justify-center mt-2">
        <button
          onClick={() => onKeyPress(' ')}
          className="keyboard-key keyboard-key-space"
        >
          SPACE
        </button>
        {onSubmit && (
          <button
            onClick={onSubmit}
            className="keyboard-key keyboard-key-wide bg-gradient-to-b from-amber-500 to-amber-600 border-amber-400 flex items-center justify-center gap-2"
          >
            <CornerDownLeft size={20} />
            SEARCH
          </button>
        )}
      </div>
    </div>
  );
}
