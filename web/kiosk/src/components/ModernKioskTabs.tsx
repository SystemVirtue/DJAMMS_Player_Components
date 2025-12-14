/**
 * ModernKioskTabs.tsx - Tab navigation for main content
 * Large touch targets with icons and text
 */

import React from 'react';
import { Home, Search, Music, TrendingUp, ListMusic } from 'lucide-react';
import './ModernKioskTabs.css';

export type TabId = 'home' | 'search' | 'genres' | 'charts' | 'queue';

interface ModernKioskTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <Home size={32} /> },
  { id: 'search', label: 'Search', icon: <Search size={32} /> },
  { id: 'genres', label: 'Genres', icon: <Music size={32} /> },
  { id: 'charts', label: 'Top Charts', icon: <TrendingUp size={32} /> },
  { id: 'queue', label: 'Queue', icon: <ListMusic size={32} /> },
];

export const ModernKioskTabs: React.FC<ModernKioskTabsProps> = ({
  activeTab,
  onTabChange
}) => {
  return (
    <div className="modern-kiosk-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`modern-kiosk-tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          <span className="modern-kiosk-tab-icon">{tab.icon}</span>
          <span className="modern-kiosk-tab-label">{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

