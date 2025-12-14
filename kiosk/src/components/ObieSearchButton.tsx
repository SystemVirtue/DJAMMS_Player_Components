/**
 * ObieSearchButton.tsx - Large centered button with yellow border and musical note icons
 * Matches obie-v5 aesthetic
 */

import React from 'react';
import { Music2 } from 'lucide-react';

interface ObieSearchButtonProps {
  onClick: () => void;
}

export const ObieSearchButton: React.FC<ObieSearchButtonProps> = ({ onClick }) => {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-10 pointer-events-none">
      <button
        onClick={onClick}
        className="pointer-events-auto bg-black/60 border-4 border-yellow-400 rounded-xl px-12 py-8 shadow-2xl hover:bg-yellow-400/20 hover:scale-105 transition-all duration-200 flex items-center gap-4 group"
      >
        <Music2 className="text-yellow-400 h-12 w-12 group-hover:scale-110 transition-transform" />
        <span className="text-yellow-300 text-4xl font-bold tracking-wide">
          SEARCH FOR MUSIC
        </span>
        <Music2 className="text-yellow-400 h-12 w-12 group-hover:scale-110 transition-transform" />
      </button>
    </div>
  );
};



