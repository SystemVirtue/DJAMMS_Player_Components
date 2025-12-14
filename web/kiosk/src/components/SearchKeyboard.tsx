// SearchKeyboard.tsx - On-screen QWERTY keyboard for Kiosk
// Compact 3-row QWERTY + 2-row number pad layout
// Styled with obie-v5 aesthetic

import { Delete } from 'lucide-react';

interface SearchKeyboardProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSubmit?: () => void;
}

// QWERTY rows (3 rows)
const QWERTY_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

// Number pad rows (3 rows: 1-4, 5-8, 9-0-DONE)
const NUMBER_ROWS = [
  ['1', '2', '3', '4'],
  ['5', '6', '7', '8'],
  ['9', '0'],
];

export function SearchKeyboard({ onKeyPress, onBackspace, onClear, onSubmit }: SearchKeyboardProps) {
  return (
    <div className="flex flex-col gap-2 p-4" style={{ backgroundColor: 'rgba(30, 41, 59, 0.4)' }}>
      {/* Main keyboard container: QWERTY on left, Number pad on right */}
      <div className="flex gap-4">
        {/* Left: QWERTY keyboard (3 rows) */}
        <div className="flex flex-col gap-2 flex-1">
          {/* Row 1: Q-P + Delete */}
          <div className="flex gap-2">
            {QWERTY_ROWS[0].map((key) => (
              <button
                key={key}
                onClick={() => onKeyPress(key)}
                className="keyboard-key flex-1"
              >
                {key}
              </button>
            ))}
            <button
              onClick={onBackspace}
              className="keyboard-key flex items-center justify-center bg-gradient-to-b from-red-500 to-red-600 border-red-400 hover:from-red-400 hover:to-red-500"
              title="Delete"
              style={{ minWidth: '100px', flex: '0 0 auto' }}
            >
              <Delete size={20} />
            </button>
          </div>
          
          {/* Row 2: A-L + Clear */}
          <div className="flex gap-2">
            {QWERTY_ROWS[1].map((key) => (
              <button
                key={key}
                onClick={() => onKeyPress(key)}
                className="keyboard-key flex-1"
              >
                {key}
              </button>
            ))}
            <button
              onClick={onClear}
              className="keyboard-key keyboard-key-wide text-sm bg-gradient-to-b from-orange-500 to-orange-600 border-orange-400 hover:from-orange-400 hover:to-orange-500"
              title="Clear"
            >
              CLEAR
            </button>
          </div>
          
          {/* Row 3: Z-M + Space */}
          <div className="flex gap-2">
            {QWERTY_ROWS[2].map((key) => (
              <button
                key={key}
                onClick={() => onKeyPress(key)}
                className="keyboard-key flex-1"
              >
                {key}
              </button>
            ))}
            <button
              onClick={() => onKeyPress(' ')}
              className="keyboard-key"
              style={{ minWidth: '200px', flex: '1 1 auto' }}
            >
              SPACE
            </button>
          </div>
        </div>
        
        {/* Right: Number pad (3 rows: 1-4, 5-8, 9-0-DONE) */}
        <div className="flex flex-col gap-2">
          {/* Number row 1: 1-4 */}
          <div className="flex gap-2">
            {NUMBER_ROWS[0].map((key) => (
              <button
                key={key}
                onClick={() => onKeyPress(key)}
                className="keyboard-key"
                style={{ minWidth: '80px' }}
              >
                {key}
              </button>
            ))}
          </div>
          
          {/* Number row 2: 5-8 */}
          <div className="flex gap-2">
            {NUMBER_ROWS[1].map((key) => (
              <button
                key={key}
                onClick={() => onKeyPress(key)}
                className="keyboard-key"
                style={{ minWidth: '80px' }}
              >
                {key}
              </button>
            ))}
          </div>
          
          {/* Number row 3: 9-0 + DONE button */}
          <div className="flex gap-2">
            {NUMBER_ROWS[2].map((key) => (
              <button
                key={key}
                onClick={() => onKeyPress(key)}
                className="keyboard-key"
                style={{ minWidth: '80px' }}
              >
                {key}
              </button>
            ))}
            {/* DONE button (dark red) - replaces CLOSE */}
            {onSubmit && (
              <button
                onClick={onSubmit}
                className="keyboard-key text-white font-bold border-2 border-red-600"
                style={{ 
                  minWidth: '80px',
                  backgroundColor: '#8B0000', // Dark red
                  borderColor: '#8B0000'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#A00000';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#8B0000';
                }}
              >
                DONE
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
