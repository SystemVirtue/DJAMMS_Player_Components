/**
 * ObieCredits.tsx - Fixed top-right box with yellow border, coin icon
 * Shows FREE PLAY or credit count matching obie-v5 aesthetic
 */

import React from 'react';
import { Coins } from 'lucide-react';

interface ObieCreditsProps {
  isFreePlay: boolean;
  credits?: number;
}

export const ObieCredits: React.FC<ObieCreditsProps> = ({ isFreePlay, credits }) => {
  return (
    <div className="fixed top-4 right-4 z-20">
      <div className="bg-black/60 border-2 border-yellow-400 rounded-lg p-3 shadow-lg">
        <div className="flex items-center gap-2">
          <Coins className="text-yellow-300 h-6 w-6" />
          <div className="flex flex-col">
            <p className="text-white text-sm font-bold">
              {isFreePlay ? 'FREE PLAY' : 'CREDITS'}
            </p>
            {!isFreePlay && (
              <p className="text-yellow-300 text-lg font-bold">
                {credits ?? 0}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};



