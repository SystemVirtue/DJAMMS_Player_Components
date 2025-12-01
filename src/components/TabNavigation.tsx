// components/TabNavigation.tsx
import React from 'react';

interface Tab {
  id: string;
  label: string;
  icon: string;
}

interface TabNavigationProps<T extends string> {
  activeTab: T;
  tabs: Array<{
    id: T;
    label: string;
    icon: string;
  }>;
  onTabChange: (tabId: T) => void;
}

export const TabNavigation = <T extends string>({
  activeTab,
  tabs,
  onTabChange
}: TabNavigationProps<T>) => {
  return (
    <div style={{ marginBottom: '20px', borderBottom: '1px solid #ddd' }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          style={{
            padding: '10px 20px',
            backgroundColor: activeTab === tab.id ? '#007bff' : '#f8f9fa',
            color: activeTab === tab.id ? 'white' : '#333',
            border: 'none',
            borderRadius: '4px 4px 0 0',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold'
          }}
        >
          {tab.icon} {tab.label}
        </button>
      ))}
    </div>
  );
};