// src/components/ToolsTab.tsx
import React from 'react';

interface ToolsTabProps {
  isElectron: boolean;
  onOpenFullscreen: () => void;
  onRefreshPlaylists: () => void;
  onClearQueue: () => void;
}

const tools = [
  {
    id: 'fullscreen',
    title: 'Open Fullscreen Player',
    description: 'Launch the video player in a separate fullscreen window on another display.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
      </svg>
    ),
    electronOnly: true
  },
  {
    id: 'refresh',
    title: 'Refresh Playlists',
    description: 'Rescan the playlists directory to detect any new or removed videos.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
      </svg>
    ),
    electronOnly: false
  },
  {
    id: 'clear-queue',
    title: 'Clear Queue',
    description: 'Remove all videos from the active queue and priority queue.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
      </svg>
    ),
    electronOnly: false
  },
  {
    id: 'shuffle-all',
    title: 'Shuffle All Videos',
    description: 'Create a queue with all videos from all playlists randomly shuffled.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>
      </svg>
    ),
    electronOnly: false
  },
  {
    id: 'export-queue',
    title: 'Export Queue',
    description: 'Save the current queue as a playlist file for later use.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"/>
      </svg>
    ),
    electronOnly: true
  },
  {
    id: 'keyboard-shortcuts',
    title: 'Keyboard Shortcuts',
    description: 'View and customize keyboard shortcuts for playback control.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/>
      </svg>
    ),
    electronOnly: false
  }
];

export const ToolsTab: React.FC<ToolsTabProps> = ({
  isElectron,
  onOpenFullscreen,
  onRefreshPlaylists,
  onClearQueue
}) => {
  const handleToolClick = (toolId: string) => {
    switch (toolId) {
      case 'fullscreen':
        onOpenFullscreen();
        break;
      case 'refresh':
        onRefreshPlaylists();
        break;
      case 'clear-queue':
        onClearQueue();
        break;
      case 'shuffle-all':
        // TODO: Implement shuffle all
        console.log('Shuffle all videos');
        break;
      case 'export-queue':
        // TODO: Implement export queue
        console.log('Export queue');
        break;
      case 'keyboard-shortcuts':
        // TODO: Show keyboard shortcuts modal
        console.log('Show keyboard shortcuts');
        break;
      default:
        break;
    }
  };

  const visibleTools = tools.filter(tool => !tool.electronOnly || isElectron);

  return (
    <div className="tab-content">
      <div className="tools-grid">
        {visibleTools.map(tool => (
          <div
            key={tool.id}
            className="tool-card"
            onClick={() => handleToolClick(tool.id)}
          >
            <div className="tool-card-icon">{tool.icon}</div>
            <div className="tool-card-title">{tool.title}</div>
            <div className="tool-card-description">{tool.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ToolsTab;
