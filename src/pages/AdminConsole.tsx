// src/pages/AdminConsole.tsx
import React from 'react';
import { UnifiedAdmin } from '../components/admin/UnifiedAdmin';

interface AdminConsoleProps {
  className?: string;
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({ className = '' }) => {
  // Use the unified admin component for consistent functionality across platforms
  return (
    <div className={className}>
      <UnifiedAdmin />
    </div>
  );
};
