// CreditsDisplay.tsx - Credits placeholder UI for Kiosk
// Future implementation: coin-operated request system

import { Coins } from 'lucide-react';

interface CreditsDisplayProps {
  credits: number;
}

export function CreditsDisplay({ credits }: CreditsDisplayProps) {
  return (
    <div className="fixed top-4 right-4 z-20">
      <div className="kiosk-card flex items-center gap-3">
        <Coins size={28} className="text-yellow-400" />
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Credits</p>
          <p className="text-2xl font-bold text-white">{credits}</p>
        </div>
      </div>
    </div>
  );
}

// Placeholder: Credits needed message
export function CreditsNeededMessage() {
  return (
    <div className="text-center py-8">
      <Coins size={48} className="text-yellow-400 mx-auto mb-4" />
      <h3 className="text-xl font-bold text-white mb-2">Insert Coins to Request Songs</h3>
      <p className="text-gray-400">
        Add credits to request your favorite songs
      </p>
    </div>
  );
}
